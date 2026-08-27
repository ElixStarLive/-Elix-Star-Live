import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Users, X } from 'lucide-react';
import { inviteCoHost } from '../features/live/liveApi';

export default function CoHost() {
  const { streamId } = useParams<{ streamId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [cohostId, setCohostId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const exit = () => {
    const from = (location.state as { from?: string } | null)?.from ?? '/live';
    navigate(from, { replace: true });
  };

  const onInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!streamId || !cohostId.trim()) return;
    setLoading(true);
    setMessage(null);
    const { error } = await inviteCoHost(streamId, cohostId.trim());
    setLoading(false);
    setMessage(error ? error.message : 'Co-host invited.');
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Co-host</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="p-4">
        <div className="mb-4 flex items-center gap-2 text-white/70">
          <Users className="h-5 w-5" />
          <p className="text-fluid-sm">Invite a co-host to your live stream.</p>
        </div>

        <form onSubmit={onInvite} className="space-y-4">
          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Co-host User ID</label>
            <input
              type="text"
              value={cohostId}
              onChange={(e) => setCohostId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold disabled:opacity-60"
          >
            {loading ? 'Inviting…' : 'Invite Co-host'}
          </button>
        </form>

        {message && (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-fluid-sm text-center text-white/80">
            {message}
          </p>
        )}
      </main>
    </div>
  );
}
