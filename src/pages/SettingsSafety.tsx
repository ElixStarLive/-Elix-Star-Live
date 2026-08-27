import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, X } from 'lucide-react';

export default function SettingsSafety() {
  const navigate = useNavigate();
  const location = useLocation();

  const exit = () => {
    const from = (location.state as { from?: string } | null)?.from ?? '/settings';
    navigate(from, { replace: true });
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Safety</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="space-y-4 p-4 text-white/80">
        <div className="flex items-center gap-2 text-white">
          <Shield className="h-6 w-6 text-green-300" />
          <h2 className="text-fluid-lg font-bold">Safety Centre</h2>
        </div>

        <p className="text-fluid-sm">
          We want Elix Star Live to be a safe and positive place for everyone.
        </p>

        <ul className="list-disc space-y-2 pl-5 text-fluid-sm text-white/70">
          <li>Be respectful and kind in comments, live streams, and messages.</li>
          <li>Do not share personal or sensitive information publicly.</li>
          <li>Harassment, hate speech, and explicit content are not allowed.</li>
          <li>Only send gifts and purchases with permission if using a shared device.</li>
          <li>Report anything that makes you uncomfortable.</li>
        </ul>

        <div className="space-y-2 pt-4">
          <button
            type="button"
            onClick={() => navigate('/settings/blocked', { replace: true })}
            className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left text-fluid-sm font-semibold hover:bg-white/10"
          >
            Blocked accounts
          </button>
          <button
            type="button"
            onClick={() => navigate('/report', { replace: true })}
            className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left text-fluid-sm font-semibold hover:bg-white/10"
          >
            Report a problem
          </button>
        </div>
      </main>
    </div>
  );
}
