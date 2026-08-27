import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Radio, User } from 'lucide-react';
import { fetchLiveStreams, type LiveStream } from '../features/live/liveApi';

export default function Live() {
  const [streams, setStreams] = useState<LiveStream[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchLiveStreams().then(({ data }) => {
      if (cancelled) return;
      if (data) setStreams(data.streams);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-fluid-xl font-bold">Live</h1>
        <Link
          to="/live/start"
          className="flex items-center gap-1 rounded-xl border border-white/40 px-3 py-2 text-fluid-sm font-bold"
        >
          <Plus className="h-4 w-4" /> Go Live
        </Link>
      </header>
      {loading ? (
        <p className="text-white/60">Loading…</p>
      ) : streams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Radio className="mb-4 h-12 w-12 text-white/30" />
          <p className="text-fluid-sm text-white/60">No live streams right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {streams.map((stream) => (
            <Link
              key={stream.id}
              to={`/live/${stream.id}`}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
            >
              {stream.avatarUrl ? (
                <img src={stream.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                  <User className="h-7 w-7 text-white/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white">{stream.displayName}</p>
                <p className="text-fluid-sm text-white/60">{stream.title || 'Live stream'}</p>
              </div>
              <span className="text-fluid-xs text-rose-300">● {stream.viewerCount}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
