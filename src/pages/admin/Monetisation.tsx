import React, { useCallback, useEffect, useState } from 'react';
import { Banknote } from 'lucide-react';
import { showToast } from '../../lib/toast';
import { request } from '../../lib/apiClient';

type MonetisationConfig = {
  giftCreatorPct: number;
  giftPlatformPct: number;
  giftSettlementHours: number;
  giftMonetisationEnabled: boolean;
  subCreatorPct: number;
  subPlatformPct: number;
  subSettlementHours: number;
  subMonetisationEnabled: boolean;
  rewardsEnabled: boolean;
  rewardsMinFollowers: number;
  rewardsMinPrev30dQualifiedViews: number;
  rewardsMaxPencePerCreator: number;
  rewardsMonthlyBudgetPence: number;
  rewardsMinWatchSeconds: number;
  rewardsSettlementHours: number;
  rewardsAutoApprove: boolean;
  withdrawMinPence: number;
  withdrawMaxPence: number | null;
  milestones: Array<{ minQualifiedViews: number; rewardPence: number }>;
};

export default function AdminMonetisation() {
  const [cfg, setCfg] = useState<MonetisationConfig | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null);
  const [withdrawals, setWithdrawals] = useState<Record<string, unknown>[]>([]);
  const [reconcileRuns, setReconcileRuns] = useState<Record<string, unknown>[]>([]);
  const [reason, setReason] = useState('Admin update');
  const [loading, setLoading] = useState(true);
  const [csvText, setCsvText] = useState('');
  const [csvStore, setCsvStore] = useState<'apple' | 'google'>('apple');
  const [manualNote, setManualNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r, w, rec, dash] = await Promise.all([
        request('/api/admin/monetisation/config'),
        request('/api/admin/monetisation/reports/summary'),
        request('/api/admin/monetisation/withdrawals-gbp'),
        request('/api/admin/monetisation/reconciliation'),
        request('/api/admin/monetisation/reports/dashboard'),
      ]);
      setCfg(((c.data as Record<string, unknown>)?.config as MonetisationConfig) || null);
      setReport((r.data as Record<string, unknown>) || null);
      setWithdrawals(
        Array.isArray((w.data as Record<string, unknown>)?.withdrawals)
          ? ((w.data as Record<string, unknown>).withdrawals as Record<string, unknown>[])
          : [],
      );
      setReconcileRuns(
        Array.isArray((rec.data as Record<string, unknown>)?.runs)
          ? ((rec.data as Record<string, unknown>).runs as Record<string, unknown>[])
          : [],
      );
      setDashboard((dash.data as Record<string, unknown>) || null);
    } catch {
      showToast('Failed to load monetisation admin');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchField = async (field: string, value: string | number | boolean | null) => {
    try {
      const { error } = await request('/api/admin/monetisation/config', {
        method: 'PATCH',
        body: JSON.stringify({ field, value, reason }),
      });
      if (error) throw new Error(error.message);
      showToast('Saved');
      await load();
    } catch {
      showToast('Save failed');
    }
  };

  const runReconcile = async () => {
    try {
      await request('/api/admin/monetisation/reconciliation/run', {
        method: 'POST',
        body: '{}',
      });
      showToast('Reconciliation run finished');
      await load();
    } catch {
      showToast('Reconciliation failed');
    }
  };

  const setWdStatus = async (id: string, toStatus: string) => {
    try {
      const { error } = await request(
        `/api/admin/monetisation/withdrawals-gbp/${encodeURIComponent(id)}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ toStatus, note: reason }),
        },
      );
      if (error) throw new Error(error.message);
      showToast('Withdrawal updated');
      await load();
    } catch {
      showToast('Withdrawal update failed');
    }
  };

  const submitProvider = async (id: string) => {
    try {
      const { error } = await request(
        `/api/admin/monetisation/withdrawals-gbp/${encodeURIComponent(id)}/submit-provider`,
        { method: 'POST', body: '{}' },
      );
      if (error) throw new Error(error.message);
      showToast('Submitted to payout provider');
      await load();
    } catch {
      showToast('Provider submit failed (sandbox Stripe required)');
    }
  };

  const markManualOffline = async (id: string) => {
    if (manualNote.trim().length < 8) {
      showToast('Manual exception note required (min 8 chars)');
      return;
    }
    try {
      const { error } = await request(
        `/api/admin/monetisation/withdrawals-gbp/${encodeURIComponent(id)}/mark-paid-manual`,
        {
          method: 'POST',
          body: JSON.stringify({ note: manualNote.trim() }),
        },
      );
      if (error) throw new Error(error.message);
      showToast('Marked paid as MANUAL_OFFLINE_EXCEPTION');
      await load();
    } catch {
      showToast('Manual mark-paid failed');
    }
  };

  const importReport = async () => {
    if (csvText.trim().length < 10) {
      showToast('Paste official report CSV first');
      return;
    }
    try {
      const { error } = await request('/api/admin/monetisation/financial-reports/import', {
        method: 'POST',
        body: JSON.stringify({
          store: csvStore,
          reportType: 'earnings',
          sourceFilename: `${csvStore}-paste.csv`,
          csvText,
        }),
      });
      if (error) throw new Error(error.message);
      showToast('Financial report imported');
      setCsvText('');
      await load();
    } catch {
      showToast('Report import failed');
    }
  };

  if (loading || !cfg) {
    return (
      <div className="min-h-screen bg-[#121215] flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#121215] text-white p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Banknote className="w-8 h-8" />
          Monetisation
        </h1>

        <label className="block text-sm text-white/70">
          Audit reason
          <input
            className="mt-1 w-full max-w-xl bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Gifts / Subscriptions</h2>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <Field
              label="Gift creator %"
              value={cfg.giftCreatorPct}
              onSave={(v) => void patchField('giftCreatorPct', Number(v))}
            />
            <Field
              label="Gift platform %"
              value={cfg.giftPlatformPct}
              onSave={(v) => void patchField('giftPlatformPct', Number(v))}
            />
            <Field
              label="Gift settlement hours"
              value={cfg.giftSettlementHours}
              onSave={(v) => void patchField('giftSettlementHours', Number(v))}
            />
            <Field
              label="Sub creator %"
              value={cfg.subCreatorPct}
              onSave={(v) => void patchField('subCreatorPct', Number(v))}
            />
            <Field
              label="Sub platform %"
              value={cfg.subPlatformPct}
              onSave={(v) => void patchField('subPlatformPct', Number(v))}
            />
            <Field
              label="Withdraw min (pence)"
              value={cfg.withdrawMinPence}
              onSave={(v) => void patchField('withdrawMinPence', Number(v))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Gift monetisation"
              on={cfg.giftMonetisationEnabled}
              onToggle={() => void patchField('giftMonetisationEnabled', !cfg.giftMonetisationEnabled)}
            />
            <Toggle
              label="Sub monetisation"
              on={cfg.subMonetisationEnabled}
              onToggle={() => void patchField('subMonetisationEnabled', !cfg.subMonetisationEnabled)}
            />
            <Toggle
              label="Rewards enabled"
              on={cfg.rewardsEnabled}
              onToggle={() => void patchField('rewardsEnabled', !cfg.rewardsEnabled)}
            />
            <Toggle
              label="Rewards auto-approve"
              on={cfg.rewardsAutoApprove}
              onToggle={() => void patchField('rewardsAutoApprove', !cfg.rewardsAutoApprove)}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Creator Rewards</h2>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <Field
              label="Min followers"
              value={cfg.rewardsMinFollowers}
              onSave={(v) => void patchField('rewardsMinFollowers', Number(v))}
            />
            <Field
              label="Min prev 30d qualified views"
              value={cfg.rewardsMinPrev30dQualifiedViews}
              onSave={(v) => void patchField('rewardsMinPrev30dQualifiedViews', Number(v))}
            />
            <Field
              label="Max reward pence"
              value={cfg.rewardsMaxPencePerCreator}
              onSave={(v) => void patchField('rewardsMaxPencePerCreator', Number(v))}
            />
            <Field
              label="Monthly budget pence (0=unlimited)"
              value={cfg.rewardsMonthlyBudgetPence}
              onSave={(v) => void patchField('rewardsMonthlyBudgetPence', Number(v))}
            />
            <Field
              label="Min watch seconds"
              value={cfg.rewardsMinWatchSeconds}
              onSave={(v) => void patchField('rewardsMinWatchSeconds', Number(v))}
            />
          </div>
          <div className="rounded-lg border border-white/10 p-3 text-xs space-y-1">
            <p className="font-bold text-white/80">Milestones (views → pence)</p>
            {cfg.milestones.map((m) => (
              <p key={m.minQualifiedViews} className="tabular-nums text-white/70">
                {m.minQualifiedViews.toLocaleString()} → {m.rewardPence}p
              </p>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Ops dashboard</h2>
          <pre className="text-xs bg-black/40 border border-white/10 rounded-lg p-3 overflow-auto max-h-72">
            {JSON.stringify(dashboard, null, 2)}
          </pre>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Revenue report</h2>
          <pre className="text-xs bg-black/40 border border-white/10 rounded-lg p-3 overflow-auto max-h-64">
            {JSON.stringify(report, null, 2)}
          </pre>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Financial report import</h2>
          <p className="text-xs text-white/50">
            Paste official Apple / Google earnings CSV. Commission is never invented — see docs/STORE_FINANCIAL_SETTLEMENT.md.
          </p>
          <select
            className="bg-black/40 border border-white/10 rounded px-2 py-1 text-sm"
            value={csvStore}
            onChange={(e) => setCsvStore(e.target.value as 'apple' | 'google')}
          >
            <option value="apple">Apple</option>
            <option value="google">Google</option>
          </select>
          <textarea
            className="w-full h-28 bg-black/40 border border-white/10 rounded-lg p-2 text-xs font-mono"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Paste CSV…"
          />
          <button
            type="button"
            onClick={() => void importReport()}
            className="px-3 py-2 rounded-lg bg-[#FF3B3F] text-black text-sm font-bold"
          >
            Import report
          </button>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Reconciliation</h2>
            <button
              type="button"
              onClick={() => void runReconcile()}
              className="px-3 py-2 rounded-lg bg-[#FF3B3F] text-black text-sm font-bold"
            >
              Run now
            </button>
          </div>
          <pre className="text-xs bg-black/40 border border-white/10 rounded-lg p-3 overflow-auto max-h-48">
            {JSON.stringify(reconcileRuns.slice(0, 5), null, 2)}
          </pre>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">GBP withdrawals</h2>
          <input
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-xs"
            placeholder="Manual offline exception note (required for manual paid)"
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
          />
          <div className="space-y-2">
            {withdrawals.length === 0 ? (
              <p className="text-white/40 text-sm">No GBP withdrawals</p>
            ) : (
              withdrawals.map((w) => (
                <div
                  key={String(w.id)}
                  className="flex flex-wrap items-center gap-2 border border-white/10 rounded-lg p-3 text-sm"
                >
                  <span className="font-mono text-xs">{String(w.id)}</span>
                  <span>{String(w.creator_user_id)}</span>
                  <span className="tabular-nums">{Number(w.amount_pence || 0)}p</span>
                  <span>{String(w.status)}</span>
                  <span className="text-xs text-white/40">{String(w.payment_rail || 'none')}</span>
                  {['pending', 'approved', 'processing'].includes(String(w.status)) ? (
                    <>
                      <button
                        type="button"
                        className="px-2 py-1 rounded bg-white/10"
                        onClick={() => void setWdStatus(String(w.id), 'approved')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded bg-[#FF3B3F] text-black font-bold"
                        onClick={() => void submitProvider(String(w.id))}
                      >
                        Submit Stripe payout
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded bg-white/10"
                        onClick={() => void markManualOffline(String(w.id))}
                      >
                        Manual offline paid
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded bg-white/10"
                        onClick={() => void setWdStatus(String(w.id), 'rejected')}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onSave,
}: {
  label: string;
  value: number;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="block bg-white/5 border border-white/10 rounded-lg p-3">
      <span className="text-white/50 text-xs uppercase">{label}</span>
      <div className="flex gap-2 mt-1">
        <input
          className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1.5 tabular-nums"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className="px-2 py-1 rounded bg-[#FF3B3F] text-black text-xs font-bold"
          onClick={() => onSave(draft)}
        >
          Save
        </button>
      </div>
    </label>
  );
}

function Toggle({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-3 py-2 rounded-lg text-xs font-bold ${on ? 'bg-[#FF3B3F] text-black' : 'bg-white/10 text-white'}`}
    >
      {label}: {on ? 'ON' : 'OFF'}
    </button>
  );
}
