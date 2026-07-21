import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wallet, Landmark, Banknote } from 'lucide-react';
import { RoyceBackIcon } from '../components/royce';
import { request } from '../lib/apiClient';
import { showToast } from '../lib/toast';

type Balance = {
  pending_coins: number;
  available_coins: number;
  locked_coins: number;
  total_earned: number;
  total_withdrawn: number;
};

type PayoutMethod = {
  id?: string;
  type?: string;
  details?: Record<string, unknown>;
  is_default?: boolean;
};

export default function CreatorPayout() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<Balance | null>(null);
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [methodType, setMethodType] = useState<'bank' | 'paypal'>('bank');
  const [accountName, setAccountName] = useState('');
  const [accountDetail, setAccountDetail] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [balRes, methRes] = await Promise.all([
        request<Balance>('/api/creator/balance'),
        request<{ methods?: PayoutMethod[] }>('/api/creator/payout-methods'),
      ]);
      if (balRes.data) setBalance(balRes.data);
      setMethods(Array.isArray(methRes.data?.methods) ? methRes.data.methods : []);
    } catch {
      showToast('Could not load payout info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

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
      const { error } = await request('/api/creator/payout-method', {
        method: 'POST',
        body: JSON.stringify({ type: methodType, details }),
      });
      if (error) {
        showToast(error.message || 'Could not save payout method');
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
    const amount = Math.floor(Number(withdrawAmount) || 0);
    if (amount <= 0) {
      showToast('Enter a valid amount');
      return;
    }
    if (!methods.length) {
      showToast('Add a payout method first');
      return;
    }
    setWithdrawing(true);
    try {
      const { data, error } = await request<{ error?: string }>('/api/creator/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
      if (error) {
        showToast(error.message || 'Withdraw failed');
        return;
      }
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        showToast(String(data.error));
        return;
      }
      showToast('Withdraw request submitted');
      setWithdrawAmount('');
      await reload();
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#111111] flex flex-col max-w-[480px] mx-auto">
      <div className="flex items-center justify-between px-3 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back">
          <RoyceBackIcon />
        </button>
        <h1 className="text-sm font-bold text-[#D4AF37] absolute left-1/2 -translate-x-1/2">Creator Payout</h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-[#C9A227]/25 bg-white/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[#D4AF37] font-bold text-sm">
                <Wallet size={16} /> Gift earnings
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <p className="text-white/40 uppercase text-[9px]">Available</p>
                  <p className="text-[#D4AF37] font-bold text-lg tabular-nums">{(balance?.available_coins ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">Pending</p>
                  <p className="text-white font-bold text-lg tabular-nums">{(balance?.pending_coins ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">Total earned</p>
                  <p className="text-white/80 font-semibold tabular-nums">{(balance?.total_earned ?? 0).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-white/40 uppercase text-[9px]">Withdrawn</p>
                  <p className="text-white/80 font-semibold tabular-nums">{(balance?.total_withdrawn ?? 0).toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[#C9A227]/25 bg-white/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[#D4AF37] font-bold text-sm">
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
                  className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${methodType === 'bank' ? 'bg-[#D4AF37] text-black' : 'bg-white/10 text-white'}`}
                >
                  Bank
                </button>
                <button
                  type="button"
                  onClick={() => setMethodType('paypal')}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-bold ${methodType === 'paypal' ? 'bg-[#D4AF37] text-black' : 'bg-white/10 text-white'}`}
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
                className="w-full py-2.5 rounded-lg bg-[#D4AF37] text-black text-[12px] font-bold disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save payout method'}
              </button>
            </div>

            <div className="rounded-xl border border-[#C9A227]/25 bg-white/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[#D4AF37] font-bold text-sm">
                <Banknote size={16} /> Withdraw
              </div>
              <input
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="Amount in coins"
                inputMode="numeric"
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] outline-none"
              />
              <button
                type="button"
                disabled={withdrawing}
                onClick={() => void withdraw()}
                className="w-full py-2.5 rounded-lg bg-white/10 border border-[#C9A227]/40 text-[#D4AF37] text-[12px] font-bold disabled:opacity-50"
              >
                {withdrawing ? 'Submitting...' : 'Request withdraw'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
