import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Wallet, Landmark, Banknote } from 'lucide-react';
import { showToast } from '../lib/toast';
import SettingsOptionSheet from '../components/SettingsOptionSheet';
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
import { SETTINGS_HOME, exitToFromLocationState } from '../lib/settingsNav';

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

function S({ t }: { t: string }) {
  return (
    <div className="mt-3.5 mb-1 px-1 text-[10px] uppercase tracking-[0.12em] text-[#8B9099] leading-none">
      {t}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[#8B9099] uppercase text-[9px]">{label}</div>
      <div className="text-[#E6E9EE] font-semibold tabular-nums text-[13px]">{value}</div>
    </div>
  );
}

export default function CreatorPayout() {
  const navigate = useNavigate();
  const location = useLocation();
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

  const exit = useCallback(
    () => navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true }),
    [navigate, location.state],
  );

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
    <SettingsOptionSheet onClose={exit} title="Creator Payout">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
          </div>
        ) : (
          <div className="flex flex-col gap-0 max-w-full min-h-full">
            <S t="Creator earnings (GBP)" />
            <div className="px-2.5 py-2 flex items-center gap-2 text-[#E6E9EE] font-semibold text-[13px]">
              <Wallet size={16} className="royce-icon-gold" /> Creator earnings (GBP)
            </div>
            <p className="px-2.5 text-[11px] text-[#C8CDD5] leading-snug">
              Creators receive 60% of eligible net gift and creator-subscription revenue received by Elix Star
              Live after applicable store fees, taxes, refunds, chargebacks and processing deductions.
            </p>
            <p className="px-2.5 mt-1.5 text-[11px] text-[#8B9099] leading-snug">
              Video rewards use qualified unique views. Repeated watches by the same user do not create
              additional qualified reward views. Test, free and promotional coins never create withdrawable
              earnings. Promote Video purchases are platform advertising revenue only (0% to creators).
            </p>
            <div className="grid grid-cols-2 gap-3 px-2.5 pt-3 text-[12px]">
              <Metric label="GBP available" value={<span className="text-[#D9A62E] font-bold text-lg">{formatPence(balance?.gbp?.available_pence ?? 0)}</span>} />
              <Metric label="GBP pending" value={<span className="font-bold text-lg text-white">{formatPence(balance?.gbp?.pending_pence ?? 0)}</span>} />
              <Metric label="GBP withdrawn" value={formatPence(balance?.gbp?.withdrawn_pence ?? 0)} />
              <Metric
                label="GBP reversed / held"
                value={`${formatPence(balance?.gbp?.reversed_pence ?? 0)} / ${formatPence(balance?.gbp?.held_pence ?? 0)}`}
              />
              <Metric label="Gift earnings" value={formatPence(balance?.earnings_by_source?.gifts_pence ?? 0)} />
              <Metric label="Subscription earnings" value={formatPence(balance?.earnings_by_source?.subscriptions_pence ?? 0)} />
              <Metric label="Rewards earnings" value={formatPence(balance?.earnings_by_source?.rewards_pence ?? 0)} />
              <Metric label="Active subscribers" value={(balance?.active_subscribers ?? 0).toLocaleString()} />
              <Metric label="Qualified views (30d)" value={(balance?.rewards?.qualified_views_30d ?? 0).toLocaleString()} />
              <Metric
                label="Reward milestone"
                value={
                  <>
                    {formatPence(balance?.rewards?.current_reward_pence ?? 0)}
                    {balance?.rewards?.next_milestone_views != null
                      ? ` → ${formatPence(balance.rewards.next_milestone_reward_pence ?? 0)} @ ${balance.rewards.next_milestone_views.toLocaleString()}`
                      : ''}
                  </>
                }
              />
              <Metric label="Diamonds (ops only)" value={(balance?.available_coins ?? 0).toLocaleString()} />
              <Metric label="Diamonds pending" value={(balance?.pending_coins ?? 0).toLocaleString()} />
            </div>

            <S t="Stripe Connect (GBP payouts)" />
            <div className="px-2.5 py-2 flex items-center gap-2 text-[#E6E9EE] font-semibold text-[13px]">
              <Banknote size={16} className="royce-icon-gold" /> Stripe Connect
            </div>
            <p className="px-2.5 text-[11px] text-[#8B9099]">
              Status: {connectStatus}. Connect is required for automatic provider payouts with transaction IDs.
            </p>
            <div className="px-2.5 pt-2">
              <button
                type="button"
                disabled={onboarding || connectStatus === 'ready'}
                onClick={() => void startConnectOnboard()}
                className="w-full py-2.5 rounded-lg bg-[#E6E9EE] text-white elix-accent text-[12px] font-bold disabled:opacity-50"
              >
                {connectStatus === 'ready' ? 'Stripe Connect ready' : onboarding ? 'Opening…' : 'Set up Stripe Connect'}
              </button>
            </div>

            <S t="Payment method" />
            <div className="px-2.5 py-2 flex items-center gap-2 text-[#E6E9EE] font-semibold text-[13px]">
              <Landmark size={16} className="royce-icon-gold" /> Payment method
            </div>
            {methods.length > 0 ? (
              <ul className="px-2.5 space-y-1">
                {methods.map((m, i) => (
                  <li key={m.id || i} className="text-[12px] text-[#C8CDD5]">
                    {(m.type || 'method').toUpperCase()}
                    {m.is_default ? ' · default' : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2.5 text-[#8B9099] text-[11px]">Add how you want to receive gift earnings after live.</p>
            )}
            <div className="flex gap-2 px-2.5 pt-2">
              <button
                type="button"
                onClick={() => setMethodType('bank')}
                className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${methodType === 'bank' ? 'bg-white/10 border-[#E6E9EE]/45 text-white' : 'bg-transparent border-white/10 text-[#C8CDD5]'}`}
              >
                Bank
              </button>
              <button
                type="button"
                onClick={() => setMethodType('paypal')}
                className={`flex-1 py-2 rounded-lg text-[11px] font-bold border ${methodType === 'paypal' ? 'bg-white/10 border-[#E6E9EE]/45 text-white' : 'bg-transparent border-white/10 text-[#C8CDD5]'}`}
              >
                PayPal
              </button>
            </div>
            <div className="px-2.5 pt-2 space-y-2">
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Account name"
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] outline-none"
              />
              <input
                value={accountDetail}
                onChange={(e) => setAccountDetail(e.target.value)}
                placeholder={methodType === 'paypal' ? 'PayPal email' : 'IBAN / account number'}
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] outline-none"
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveMethod()}
                className="w-full py-2.5 rounded-lg bg-white/10 border border-white/10 text-[#E6E9EE] text-[12px] font-bold disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save payout method'}
              </button>
            </div>

            <S t="Withdraw GBP" />
            <div className="px-2.5 py-2 flex items-center gap-2 text-[#E6E9EE] font-semibold text-[13px]">
              <Banknote size={16} className="royce-icon-gold" /> Withdraw GBP
            </div>
            <div className="px-2.5 space-y-2">
              <input
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="Amount in GBP (e.g. 10.00)"
                inputMode="decimal"
                className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] outline-none"
              />
              <button
                type="button"
                disabled={withdrawing}
                onClick={() => void withdraw()}
                className="w-full py-2.5 rounded-lg bg-white/10 border border-white/10 text-[#E6E9EE] text-[12px] font-bold disabled:opacity-50"
              >
                {withdrawing ? 'Submitting...' : 'Request GBP withdrawal'}
              </button>
              <p className="text-[10px] text-[#8B9099]">
                Only available GBP earnings can be withdrawn. Coin Diamonds are not cash. Status: Pending → Approved → Processing → Paid.
              </p>
            </div>

            {gbpWithdrawals.length > 0 ? (
              <>
                <S t="GBP withdrawal history" />
                <div className="px-2.5 space-y-2">
                  {gbpWithdrawals.slice(0, 10).map((r) => (
                    <div key={r.id} className="flex flex-col gap-0.5 text-[11px]">
                      <div className="flex justify-between gap-2">
                        <span className="text-[#C8CDD5] tabular-nums">{formatPence(Number(r.amount_pence) || 0)}</span>
                        <span className="text-[#8B9099]">{GBP_STATUS_LABEL[r.status] || r.status}</span>
                      </div>
                      {r.payout_provider_ref ? (
                        <span className="text-[#8B9099] font-mono text-[10px] truncate">
                          {String(r.payout_provider_ref)}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {ledger.length > 0 ? (
              <>
                <S t="Ledger history" />
                <div className="px-2.5 space-y-2 pb-2">
                  {ledger.slice(0, 15).map((r) => (
                    <div key={r.id} className="flex justify-between gap-2 text-[11px]">
                      <span className="text-[#8B9099] truncate">{r.revenue_source}</span>
                      <span className="text-[#C8CDD5] tabular-nums">{formatPence(Number(r.creator_amount_pence) || 0)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </SettingsOptionSheet>
  );
}
