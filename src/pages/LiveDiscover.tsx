import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Radio, RefreshCw } from 'lucide-react';
import { apiUrl, getWsUrl } from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';
import { LIVE_FEED_CARD_AVATAR_PX } from '../lib/profileFrame';

type LiveCreator = {
  id: string;
  name: string;
  viewers: number;
  thumbnail?: string;
  title?: string;
};

export default function LiveDiscover() {
  const navigate = useNavigate();
  const [creators, setCreators] = useState<LiveCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const removedKeysRef = useRef<Set<string>>(new Set());

  const fetchLiveStreams = useCallback(async () => {
    setLoading(true);
    try {
      const url = apiUrl('/api/live/streams');

      const res = await fetch(url, { method: 'GET', credentials: 'include' });
      if (!res.ok) {
        setCreators([]);
        setLoading(false);
        return;
      }

      const body = await res.json().catch(() => ({ streams: [] as any[] }));
      const streams = Array.isArray(body.streams) ? body.streams : [];
      const removed = removedKeysRef.current;

      const mapped: LiveCreator[] = streams
        .filter((s: any) => {
          const key = s.stream_key ?? s.streamKey ?? s.room_id ?? s.roomId ?? s.id;
          return key && !removed.has(key);
        })
        .map((s: any) => {
          const id = s.stream_key ?? s.streamKey ?? s.room_id ?? s.roomId ?? s.id;
          const userId = s.user_id ?? s.userId ?? s.hostUserId ?? '';
          const label = userId ? String(userId).slice(0, 8) : 'Creator';
          const name = s.title ?? s.display_name ?? s.displayName ?? label;
          return {
            id,
            name,
            viewers: Number(s.viewer_count ?? s.viewerCount ?? 0),
            thumbnail: userId ? `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=121212&color=C9A96E` : undefined,
            title: s.title ?? s.display_name ?? s.displayName ?? undefined,
          };
        });

      setCreators(mapped);
    } catch {
      setCreators([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const removeLiveStream = useCallback((key: string) => {
    removedKeysRef.current.add(key);
    setCreators(prev => prev.filter(c => c.id !== key));
    setTimeout(() => removedKeysRef.current.delete(key), 10000);
  }, []);

  const token = useAuthStore((s) => s.session?.access_token) ?? '';

  useEffect(() => {
    fetchLiveStreams();
    const poll = setInterval(fetchLiveStreams, 3_000);
    return () => clearInterval(poll);
  }, [fetchLiveStreams]);

  // When a creator starts live, show them on this page immediately (same as For You feed); reconnect on close
  useEffect(() => {
    if (!token) return;
    const url = `${getWsUrl()}/live/__feed__?token=${encodeURIComponent(token)}`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      try {
        ws = new WebSocket(url);
      } catch {
        reconnectAttempt++;
        const base = 1000 * Math.pow(2, Math.min(reconnectAttempt - 1, 8));
        const delay = Math.min(30_000, base + Math.floor(Math.random() * 400));
        reconnectTimer = setTimeout(connect, delay);
        return;
      }
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          const event = msg?.event;
          const data = msg?.data || {};
          if (event === 'stream_started') {
            const key = (data.stream_key ?? data.room_id) as string;
            if (!key || removedKeysRef.current.has(key)) return;
            setCreators((prev) => {
              if (prev.some((c) => c.id === key)) return prev;
              const userId = (data.user_id ?? '') as string;
              const label = userId ? String(userId).slice(0, 8) : 'Creator';
              const name = (data.title ?? data.display_name ?? label) as string;
              return [
                {
                  id: key,
                  name,
                  viewers: 0,
                  thumbnail: userId ? `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=121212&color=C9A96E` : undefined,
                  title: name,
                },
                ...prev,
              ];
            });
          } else if (event === 'stream_ended') {
            const key = (data.stream_key ?? data.room_id) as string;
            if (key) removeLiveStream(key);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onopen = () => {
        reconnectAttempt = 0;
      };
      ws.onclose = () => {
        ws = null;
        if (!cancelled) {
          reconnectAttempt++;
          const base = 1000 * Math.pow(2, Math.min(reconnectAttempt - 1, 8));
          const delay = Math.min(30_000, base + Math.floor(Math.random() * 400));
          reconnectTimer = setTimeout(connect, delay);
        }
      };
    }
    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        if (ws) ws.close();
      } catch {}
    };
  }, [token, removeLiveStream]);

  const formatViewers = (n: number) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  return (
    <div className="fixed inset-0 bg-[#0A0B0E] flex justify-center overflow-hidden">
      <div
        className="relative w-full max-w-[480px] flex flex-col h-[100dvh] max-h-[100dvh]"
        style={{ marginTop: 0 }}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2">
          <div className="flex items-center gap-2.5">
            <button
              onClick={fetchLiveStreams}
              className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center"
              title="Refresh"
            >
              <RefreshCw size={12} className={`text-white/40 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <span className="text-white font-bold text-base">Live</span>
            {creators.length > 0 && (
              <span className="text-white/30 text-xs font-medium">{creators.length} streaming</span>
            )}
          </div>
          <button onClick={() => navigate('/feed')} className="p-1" title="Back">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && creators.length === 0 ? (
            <div className="flex items-center justify-center py-32">
              <div className="w-8 h-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : creators.length > 0 ? (
            <div className="grid grid-cols-2 gap-1 px-1 pb-[env(safe-area-inset-bottom,20px)]">
              {creators.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/watch/${c.id}`)}
                  className={`relative overflow-hidden active:scale-[0.97] transition-transform ${
                    i === 0 && creators.length > 2 ? 'col-span-2 aspect-[2/1.2]' : 'aspect-[3/4]'
                  }`}
                >
                  {/* Background */}
                  {c.thumbnail ? (
                    <img
                      src={c.thumbnail}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[#1a1c22] to-[#0e1015] flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-[#C9A96E]/10 border border-[#C9A96E]/20 flex items-center justify-center">
                        <span className="text-[#C9A96E] font-bold text-2xl">{c.name.slice(0, 1).toUpperCase()}</span>
                      </div>
                    </div>
                  )}

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* LIVE badge + viewer count */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-red-500 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      Live
                    </span>
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/50 text-white/80 text-[9px] font-semibold">
                      <Eye size={10} />
                      {formatViewers(c.viewers)}
                    </span>
                  </div>

                  {/* Creator info at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 p-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="rounded-full border-2 border-red-500/60 overflow-hidden flex-shrink-0 bg-[#1a1c22]"
                        style={{ width: LIVE_FEED_CARD_AVATAR_PX, height: LIVE_FEED_CARD_AVATAR_PX }}
                      >
                        {c.thumbnail ? (
                          <img src={c.thumbnail} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/60 text-xs font-bold">
                            {c.name.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-bold text-xs truncate">{c.name}</p>
                        {c.title && (
                          <p className="text-white/50 text-[10px] truncate">{c.title}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* Empty state — no Go Live button, just info */
            <div className="flex flex-col items-center justify-center h-full pb-20 px-8 text-center">
              <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center mb-5">
                <Radio className="w-8 h-8 text-white/10" />
              </div>
              <p className="text-white/60 font-bold text-base mb-1">No one is live right now</p>
              <p className="text-white/25 text-xs mb-6 max-w-[240px]">
                Check back later to watch creators streaming live
              </p>
              <button
                onClick={fetchLiveStreams}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/5 border border-white/10 active:scale-95 transition-all"
              >
                <RefreshCw size={14} className="text-white/50" />
                <span className="text-white/60 font-bold text-sm">Refresh</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
