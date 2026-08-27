import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Radio, User } from 'lucide-react';
import { fetchLiveStream, type LiveStream } from '../features/live/liveApi';

export default function LiveWatch() {
  const { streamId } = useParams<{ streamId: string }>();
  const navigate = useNavigate();
  const [stream, setStream] = useState<(LiveStream & { streamKey: string }) | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;
    fetchLiveStream(streamId).then(({ data }) => {
      if (cancelled) return;
      if (data) setStream(data.stream);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [streamId]);

  return (
    <div className="relative min-h-[100dvh] bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-black/80 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={() => navigate('/live')} className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-fluid-base font-bold">Live</h1>
      </header>

      <main className="p-4">
        {loading ? (
          <p className="text-white/60">Loading…</p>
        ) : !stream ? (
          <p className="text-white/60">Stream not found.</p>
        ) : (
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-6">
              {stream.avatarUrl ? (
                <img src={stream.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
                  <User className="h-10 w-10 text-white/40" />
                </div>
              )}
              <div className="text-left">
                <p className="text-fluid-lg font-bold">{stream.displayName}</p>
                <p className="text-fluid-sm text-white/60">{stream.title || 'Live stream'}</p>
                <p className="text-fluid-xs text-rose-300">● {stream.viewerCount} watching</p>
              </div>
            </div>

            <div className="aspect-video w-full rounded-2xl bg-white/5 p-4">
              <div className="flex h-full flex-col items-center justify-center gap-2 text-white/50">
                <Radio className="h-10 w-10" />
                <p className="text-fluid-sm">LiveKit playback will connect here.</p>
                <p className="text-fluid-xs">Stream key: {stream.streamKey}</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
