import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Gift, Key, Radio, User } from 'lucide-react';
import { fetchLiveStream, fetchLiveToken, type LiveStream } from '../features/live/liveApi';
import { fetchGifts, sendGift, type GiftPackage } from '../features/gifts/giftsApi';

export default function LiveWatch() {
  const { streamId } = useParams<{ streamId: string }>();
  const navigate = useNavigate();
  const [stream, setStream] = useState<(LiveStream & { streamKey: string }) | null>(null);
  const [gifts, setGifts] = useState<GiftPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [liveToken, setLiveToken] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);

  const fetchToken = async () => {
    if (!streamId) return;
    setTokenLoading(true);
    const { data } = await fetchLiveToken(streamId);
    setTokenLoading(false);
    if (data) {
      setLiveToken(data.token);
      setLiveUrl(data.url);
    }
  };

  useEffect(() => {
    if (!streamId) return;
    let cancelled = false;
    fetchLiveStream(streamId).then(({ data }) => {
      if (cancelled) return;
      if (data) setStream(data.stream);
      setLoading(false);
    });
    fetchGifts().then(({ data }) => {
      if (cancelled) return;
      if (data) setGifts(data.gifts);
    });
    return () => {
      cancelled = true;
    };
  }, [streamId]);

  const onGift = async (gift: GiftPackage) => {
    if (!streamId) return;
    setSending(gift.id);
    await sendGift(streamId, gift.id, 'test');
    setSending(null);
  };

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
                <button
                  type="button"
                  onClick={fetchToken}
                  disabled={tokenLoading}
                  className="mt-2 flex items-center gap-2 rounded-xl border border-white/40 px-4 py-2 text-fluid-sm font-bold disabled:opacity-60"
                >
                  <Key className="h-4 w-4" />
                  {tokenLoading ? '…' : 'Get Token'}
                </button>
                {liveToken && <p className="max-w-full truncate text-fluid-xs">Token: {liveToken.slice(0, 24)}…</p>}
                {liveUrl && <p className="text-fluid-xs">{liveUrl}</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center justify-center gap-2">
                <Gift className="h-5 w-5 text-yellow-300" />
                <h2 className="text-fluid-base font-bold">Gifts</h2>
              </div>
              {gifts.length === 0 ? (
                <p className="text-white/60">No gifts available.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {gifts.map((gift) => (
                    <button
                      key={gift.id}
                      type="button"
                      onClick={() => onGift(gift)}
                      disabled={sending === gift.id}
                      className="rounded-xl border border-white/10 bg-white/5 p-2 text-fluid-xs font-semibold disabled:opacity-60"
                    >
                      <span className="block text-2xl">{gift.animation || '🎁'}</span>
                      <span className="block mt-1">{gift.name}</span>
                      <span className="block text-white/50">+{gift.battlePoints}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
