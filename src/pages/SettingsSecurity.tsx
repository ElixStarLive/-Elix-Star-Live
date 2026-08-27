import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, X } from 'lucide-react';
import { changePassword } from '../features/users/usersApi';

export default function SettingsSecurity() {
  const navigate = useNavigate();
  const location = useLocation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const exit = () => {
    const from = (location.state as { from?: string } | null)?.from ?? '/settings';
    navigate(from, { replace: true });
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const { error: apiError } = await changePassword({ currentPassword: current, newPassword: next });
    setLoading(false);
    if (apiError) {
      setError(apiError.message);
      return;
    }
    setDone(true);
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Security</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      {done ? (
        <main className="flex flex-1 flex-col items-center justify-center p-4 text-center">
          <Lock className="mb-4 h-12 w-12 text-green-300" />
          <h2 className="text-fluid-lg font-bold">Password changed</h2>
          <p className="mt-2 text-fluid-sm text-white/60">Please sign in again.</p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="mt-6 rounded-xl border border-white/40 px-6 py-3 text-fluid-sm font-bold"
          >
            Go to Login
          </button>
        </main>
      ) : (
        <form onSubmit={onSubmit} className="flex-1 space-y-4 p-4">
          <div className="flex items-center gap-2 text-white/70">
            <Lock className="h-5 w-5" />
            <p className="text-fluid-sm">Change your password.</p>
          </div>

          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Current Password</label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">New Password</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Confirm New Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
              required
            />
          </div>

          {error && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-fluid-sm text-rose-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold disabled:opacity-60"
          >
            {loading ? 'Changing…' : 'Change Password'}
          </button>
        </form>
      )}
    </div>
  );
}
