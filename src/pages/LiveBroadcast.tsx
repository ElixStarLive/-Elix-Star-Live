import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Radio, X } from 'lucide-react';
import { request, type ApiResult } from '../lib/apiClient';

export default function LiveBroadcast() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState<{ id: string; streamKey: string } | null>(null);

  const exit = () => {
    navigate('/live', { replace: true });
  };

  const onStart = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    const { data, error } = await request<{ id: string; streamKey: string }>('/api/live', {
      method: 'POST',
      body: JSON.stringify({ title: title.trim() }),
    }) as ApiResult<{ id: string; streamKey: string }>;
    setLoading(false);
    if (error) return;
    setStream(data ?? null);
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Go Live</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="p-4">
        {stream ? (
          <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <Radio className="mx-auto h-12 w-12 text-rose-300" />
            <h2 className="text-fluid-lg font-bold">You are live</h2>
            <p className="text-fluid-sm text-white/60">Stream ID: {stream.id}</p>
            <p className="text-fluid-sm text-white/60">Stream key: {stream.streamKey}</p>
            <div className="aspect-video w-full rounded-2xl bg-white/5 p-4">
              <div className="flex h-full flex-col items-center justify-center gap-2 text-white/50">
                <Radio className="h-10 w-10" />
                <p className="text-fluid-sm">LiveKit broadcaster integration will connect here.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={exit}
              className="rounded-xl border border-white/40 px-6 py-3 text-fluid-sm font-bold"
            >
              Finish
            </button>
          </div>
        ) : (
          <form onSubmit={onStart} className="space-y-4">
            <div className="space-y-2">
              <label className="text-fluid-sm text-white/70">Stream Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's your live about?"
                className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl border border-rose-500/50 bg-rose-500/10 py-3 text-fluid-sm font-bold text-rose-200 disabled:opacity-60"
            >
              {loading ? 'Starting…' : 'Start Live Stream'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
