import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, X } from 'lucide-react';
import { fetchPayoutSettings, patchPayoutSettings, requestPayout, type PayoutSettings } from '../features/users/usersApi';

const METHODS = ['bank_transfer', 'paypal'];

export default function SettingsPayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [settings, setSettings] = useState<PayoutSettings>({ method: '', identifier: '', country: '' });
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPayoutSettings().then(({ data }) => {
      if (cancelled || !data) return;
      setSettings(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const exit = () => {
    const from = (location.state as { from?: string } | null)?.from ?? '/settings';
    navigate(from, { replace: true });
  };

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const { error } = await patchPayoutSettings(settings);
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage('Payout settings saved.');
  };

  const onRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setRequesting(true);
    setMessage(null);
    const { error } = await requestPayout(Number(amount));
    setRequesting(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setAmount('');
    setMessage('Payout request submitted.');
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Payout</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="space-y-6 p-4">
        <div className="flex items-center gap-2 text-white/70">
          <Wallet className="h-5 w-5" />
          <p className="text-fluid-sm">Set your payout method and request a withdrawal.</p>
        </div>

        {loading ? (
          <p className="text-white/60">Loading…</p>
        ) : (
          <form onSubmit={onSave} className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-fluid-base font-bold">Payout Method</h2>
            <div className="space-y-2">
              <label className="text-fluid-sm text-white/70">Method</label>
              <select
                value={settings.method}
                onChange={(e) => setSettings((s) => ({ ...s, method: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none"
              >
                <option value="" className="bg-black">Select</option>
                {METHODS.map((m) => (
                  <option key={m} value={m} className="bg-black capitalize">
                    {m.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-fluid-sm text-white/70">Account / Email</label>
              <input
                type="text"
                value={settings.identifier}
                onChange={(e) => setSettings((s) => ({ ...s, identifier: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
              />
            </div>
            <div className="space-y-2">
              <label className="text-fluid-sm text-white/70">Country</label>
              <input
                type="text"
                value={settings.country}
                onChange={(e) => setSettings((s) => ({ ...s, country: e.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Payout Settings'}
            </button>
          </form>
        )}

        <form onSubmit={onRequest} className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <h2 className="text-fluid-base font-bold">Request Withdrawal</h2>
          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Amount (GBP)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
              placeholder="0.00"
              step="0.01"
              min="1"
              required
            />
          </div>
          <button
            type="submit"
            disabled={requesting}
            className="w-full rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold disabled:opacity-60"
          >
            {requesting ? 'Requesting…' : 'Request Payout'}
          </button>
        </form>

        {message && (
          <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-fluid-sm text-center text-white/80">
            {message}
          </p>
        )}
      </main>
    </div>
  );
}
