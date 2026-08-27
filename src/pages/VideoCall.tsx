import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, X } from 'lucide-react';

export default function VideoCall() {
  const navigate = useNavigate();
  const location = useLocation();
  const [callId, setCallId] = useState('');

  const exit = () => {
    const from = (location.state as { from?: string } | null)?.from ?? '/feed';
    navigate(from, { replace: true });
  };

  const start = () => {
    if (!callId.trim()) return;
    // LiveKit call will be wired once credentials are configured.
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Video Call</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="space-y-4 p-4">
        <div className="flex items-center gap-2 text-white/70">
          <Phone className="h-5 w-5" />
          <p className="text-fluid-sm">Start or join a video call.</p>
        </div>

        <div className="space-y-2">
          <label className="text-fluid-sm text-white/70">Call ID</label>
          <input
            type="text"
            value={callId}
            onChange={(e) => setCallId(e.target.value)}
            placeholder="Enter call ID"
            className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
          />
        </div>

        <button
          type="button"
          onClick={start}
          disabled
          className="w-full rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold disabled:opacity-60"
        >
          LiveKit call not configured
        </button>
      </main>
    </div>
  );
}
