import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Landmark, Banknote } from 'lucide-react';
import { RoyceBackIcon } from '../components/royce';
import { showToast } from '../lib/toast';
import {
  apiCreatorBalance,
  apiCreatorPayoutMethods,
  apiCreatorSavePayoutMethod,
  apiCreatorWithdrawGbp,
  apiCreatorGbpWithdrawals,
  apiCreatorLedger,
  apiCreatorPayoutAccount,
  apiCreatorPayoutOnboard,
} from '../features/creator/creatorPayoutApi';
import { SETTINGS_HOME } from '../lib/settingsNav';

type Balance = {
  pending_coins: number;
  available_coins: number;
  locked_coins: number;
  total_earned: number;
  total_withdrawn: number;
  gbp?: {
    pending_pence: number;
    available_pence: number;
    withdrawn_pence: number;
    reversed_pence: number;
    held_pence: number;
  };
  rewards?: {
    qualified_views_30d: number;
    current_reward_pence: number;
    next_milestone_views: number | null;
    next_milestone_reward_pence: number | null;
  };
  earnings_by_source?: {
    gifts_pence: number;
    subscriptions_pence: number;
    rewards_pence: number;
    reversals_pence: number;
  };
  active_subscribers?: number;
};

function formatPence(pence: number): string {
  const n = Math.max(0, Math.floor(Number(pence) || 0));
  return `£${(n / 100).toFixed(2)}`;
}

type PayoutMethod = {
  id?: string;
  type?: string;
  details?: Record<string, unknown>;
  is_default?: boolean;
};

type GbpWithdrawal = {
  id: string;
  amount_pence: number;
  status: string;
  created_at?: string;
  payout_provider_ref?: string | null;
};

type LedgerRow = {
  id: string;
  revenue_source: string;
  creator_amount_pence: number;
  status: string;
  created_at?: string;
};

const GBP_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export default function CreatorPayout() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [gbpWithdrawals, setGbpWithdrawals] = useState<GbpWithdrawal[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [methodType, setMethodType] = useState<'bank' | 'paypal'>('bank');
  const [accountName, setAccountName] = useState('');
  const [accountDetail, setAccountDetail] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [connectStatus, setConnectStatus] = useState('unknown');
  const [onboarding, setOnboarding] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, methRes, wdRes, ledRes, acctRes] = await Promise.all([
        apiCreatorBalance(),
        apiCreatorPayoutMethods(),
        apiCreatorGbpWithdrawals(),
        apiCreatorLedger(),
        apiCreatorPayoutAccount(),
      ]);
      if (balRes.data) setBalance(balRes.data as Balance);
      setMethods(methRes.methods as PayoutMethod[]);
      setGbpWithdrawals(wdRes.withdrawals as GbpWithdrawal[]);
      setLedger(ledRes.ledger as LedgerRow[]);
      if (acctRes.data) {
        const d = acctRes.data;
        const ready =
          d.payouts_enabled === true ||
          String(d.verificationStatus || d.verification_status || '') === 'verified';
        setConnectStatus(ready ? 'ready' : String(d.status || d.account_status || d.verificationStatus || 'pending'));
      }
    } catch {
      showToast('Could not load payout info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const exit = useCallback(() => navigate(SETTINGS_HOME, { replace: true }), [navigate]);

  const startConnectOnboard = async () => {
    setOnboarding(true);
    try {
      const { data, error } = await apiCreatorPayoutOnboard();
      if (error) {
        showToast(error || 'Stripe Connect unavailable');
        return;
      }
      const url = String(
        (data as Record<string, unknown> | null)?.onboardingUrl ||
          (data as Record<string, unknown> | null)?.onboarding_url ||
          (data as Record<string, unknown> | null)?.url ||
          '',
      );
      if (url) {
        window.location.href = url;
        return;
      }
      const ready =
        (data as Record<string, unknown> | null)?.ok === true &&
        String((data as Record<string, unknown> | null)?.verificationStatus || '') === 'verified';
      showToast(ready ? 'Stripe Connect account ready' : 'Stripe Connect response received');
      await reload();
    } finally {
      setOnboarding(false);
    }
  };

  const saveMethod = async () => {
    if (!accountName.trim() || !accountDetail.trim()) {
      showToast('Enter payout details');
      return;
    }
    setSaving(true);
    try {
      const details =
        methodType === 'paypal'
          ? { email: accountDetail.trim(), name: accountName.trim() }
          : { account_name: accountName.trim(), iban_or_account: accountDetail.trim() };
      const { error } = await apiCreatorSavePayoutMethod({ type: methodType, details });
      if (error) {
        showToast(error || 'Could not save payout method');
        return;
      }
      showToast('Payout method saved');
      setAccountName('');
      setAccountDetail('');
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async () => {
    // Amount entered as pounds (e.g. 10.50) → pence
    const pounds = Number(withdrawAmount);
    const amountPence = Math.round((Number.isFinite(pounds) ? pounds : 0) * 100);
    if (amountPence <= 0) {
      showToast('Enter a valid GBP amount');
      return;
    }
    if (!methods.length) {
      showToast('Add a payout method first');
      return;
    }
    setWithdrawing(true);
    try {
      const { data, error } = await apiCreatorWithdrawGbp({
        amount_pence: amountPence,
        idempotency_key: `ui:${Date.now()}:${amountPence}`,
      });
      if (error) {
        showToast(error || 'Withdraw failed');
        return;
      }
      showToast(data?.already_exists ? 'Withdrawal already submitted' : 'GBP withdrawal requested');
      setWithdrawAmount('');
      await reload();
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-transparent flex flex-col max-w-[480px] mx-auto">
      <div className="flex items-center justify-between px-3 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={exit} aria-label="Back">
          <RoyceBackIcon />
        </button>
        <h1 className="text-sm font-bold text-[#F5F5F7] absolute left-1/2 -translate-x-1/2">Creator Payout</h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#6F3FF5]/25 border-t-[#6F3FF5] rounded-full animate-spin elix-loader" />
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-[#D8D9DD]/25 bg-white/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[#F5F5F7] font-bold text-sm">
                <Wallet size={16} /> Creator earnings (GBP)
              </div>
              <p className="text-[11px] text-white/70 leading-snug">
                Creators receive 60% of eligible net gift and creator-subscription revenue received by Elix Star
                Live after applicable store fees, taxes, refunds, chargebacks and processing deductions.
              </p>
              <p className="text-[11px] text-white/55 leading-snug">
                Video rewards use qualified unique views. Repeated watches by the same user do not create
                additional qualified reward views. Test, free and promotional coins never create withdrawable
                earnings. Promote Video purchases are platform advertising revenue only (0% to creators).
              </p>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <p className="text-white/40 uppercase text-[9px]">GBP available</p>
                  <p className="text-[#D9A62E] font-bold text-lg tabular-nums">{formatPence(balance?.gbp?.available_pence ?? 0)}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">GBP pending</p>
                  <p className="text-white font-bold text-lg tabular-nums">{formatPence(balance?.gbp?.pending_pence ?? 0)}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">GBP withdrawn</p>
                  <p className="text-white/80 font-semibold tabular-nums">{formatPence(balance?.gbp?.withdrawn_pence ?? 0)}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">GBP reversed / held</p>
                  <p className="text-white/80 font-semibold tabular-nums">
                    {formatPence(balance?.gbp?.reversed_pence ?? 0)} / {formatPence(balance?.gbp?.held_pence ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">Gift earnings</p>
                  <p className="text-white/80 font-semibold tabular-nums">{formatPence(balance?.earnings_by_source?.gifts_pence ?? 0)}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">Subscription earnings</p>
                  <p className="text-white/80 font-semibold tabular-nums">{formatPence(balance?.earnings_by_source?.subscriptions_pence ?? 0)}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">Rewards earnings</p>
                  <p className="text-white/80 font-semibold tabular-nums">{formatPence(balance?.earnings_by_source?.rewards_pence ?? 0)}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">Active subscribers</p>
                  <p className="text-white/80 font-semibold tabular-nums">{(balance?.active_subscribers ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">Qualified views (30d)</p>
                  <p className="text-white/80 font-semibold tabular-nums">{(balance?.rewards?.qualified_views_30d ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">Reward milestone</p>
                  <p className="text-white/80 font-semibold tabular-nums">
                    {formatPence(balance?.rewards?.current_reward_pence ?? 0)}
                    {balance?.rewards?.next_milestone_views != null
                      ? ` → ${formatPence(balance.rewards.next_milestone_reward_pence ?? 0)} @ ${balance.rewards.next_milestone_views.toLocaleString()}`
                      : ''}
                  </p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">Diamonds (ops only)</p>
                  <p className="text-white/50 font-semibold tabular-nums">{(balance?.available_coins ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">Diamonds pending</p>
                  <p className="text-white/50 font-semibold tabular-nums">{(balance?.pending_coins ?? 0).toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[#D8D9DD]/25 bg-white/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[#F5F5F7] font-bold text-sm">
                <Banknote size={16} /> Stripe Connect (GBP payouts)
              </div>
              <p className="text-[11px] text-white/55">
                Status: {connectStatus}. Connect is required for automatic provider payouts with transaction IDs.
              </p>
              <button
                type="button"
                disabled={onboarding || connectStatus === 'ready'}
                onClick={() => void startConnectOnboard()}
                className="w-full py-2.5 rounded-lg bg-[#6F3FF5] text-white elix-accent text-[12px] font-bold disabled:opacity-50"
              >
                {connectStatus === 'ready' ? 'Stripe Connect ready' : onboarding ? 'Opening…' : 'Set up Stripe Connect'}
              </button>
            </div>

            <div className="rounded-xl border border-[#D8D9DD]/25 bg-white/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[#F5F5F7] font-bold text-sm">
                <Landmark size={16} /> Payment method
              </div>
              {methods.length > 0 ? (
                <ul className="space-y-1">
                  {methods.map((m, i) => (
                    <li key={m.id || i} className="text-[12px] text-white/80">
                      {(m.type || 'method').toUpperCase()}
                      {m.is_default ? ' · default' : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-white/40 text-[11px]">Add how you want to receive gift earnings after live.</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMethodType('bank')}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${methodType === 'bank' ? 'bg-[#6F3FF5] text-white elix-accent' : 'bg-white/10 text-white'}`}
                >
                  Bank
                </button>
                <button
                  type="button"
                  onClick={() => setMethodType('paypal')}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${methodType === 'paypal' ? 'bg-[#6F3FF5] text-white elix-accent' : 'bg-white/10 text-white'}`}
                >
                  PayPal
                </button>
              </div>
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Account name"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] outline-none"
              />
              <input
                value={accountDetail}
                onChange={(e) => setAccountDetail(e.target.value)}
                placeholder={methodType === 'paypal' ? 'PayPal email' : 'IBAN / account number'}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] outline-none"
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveMethod()}
                className="w-full py-2.5 rounded-lg bg-[#6F3FF5] text-white elix-accent text-[12px] font-bold disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save payout method'}
              </button>
            </div>

            <div className="rounded-xl border border-[#D8D9DD]/25 bg-white/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[#F5F5F7] font-bold text-sm">
                <Banknote size={16} /> Withdraw GBP
              </div>
              <input
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="Amount in GBP (e.g. 10.00)"
                inputMode="decimal"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] outline-none"
              />
              <button
                type="button"
                disabled={withdrawing}
                onClick={() => void withdraw()}
                className="w-full py-2.5 rounded-lg bg-white/10 border border-[#D8D9DD]/40 text-[#F5F5F7] text-[12px] font-bold disabled:opacity-50"
              >
                {withdrawing ? 'Submitting...' : 'Request GBP withdrawal'}
              </button>
              <p className="text-[10px] text-white/40">
                Only available GBP earnings can be withdrawn. Coin Diamonds are not cash. Status: Pending → Approved → Processing → Paid.
              </p>
            </div>

            {gbpWithdrawals.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                <p className="text-[#F5F5F7] font-bold text-sm">GBP withdrawal history</p>
                {gbpWithdrawals.slice(0, 10).map((r) => (
                  <div key={r.id} className="flex flex-col gap-0.5 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <span className="text-white/70 tabular-nums">{formatPence(Number(r.amount_pence) || 0)}</span>
                      <span className="text-white/50">
                        {GBP_STATUS_LABEL[r.status] || r.status}
                      </span>
                    </div>
                    {r.payout_provider_ref ? (
                      <span className="text-white/35 font-mono text-[10px] truncate">
                        {String(r.payout_provider_ref)}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {ledger.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                <p className="text-[#F5F5F7] font-bold text-sm">Ledger history</p>
                {ledger.slice(0, 15).map((r) => (
                  <div key={r.id} className="flex justify-between gap-2 text-[11px]">
                    <span className="text-white/60 truncate">{r.revenue_source}</span>
                    <span className="text-white/70 tabular-nums">{formatPence(Number(r.creator_amount_pence) || 0)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
