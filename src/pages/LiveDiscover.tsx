import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { useNavigate } from 'react-router-dom';
import { Radio, RefreshCw } from 'lucide-react';
import { getWsUrl } from '../lib/api';
import { request } from '../lib/apiClient';
import { useAuthStore } from '../store/useAuthStore';
import {
  isGenericLiveCreatorName,
  liveNameFromStreamFields,
  profileToLiveDisplay,
} from '../lib/liveCreatorDisplay';

const InlineLiveViewer = React.lazy(() => import('../components/InlineLiveViewer'));

type LiveCreator = {
  id: string;
  userId?: string;
  name: string;
  avatar?: string;
  viewers: number;
  title?: string;
};

function isUiAvatarsUrl(url: string | undefined): boolean {
  return !!url && /ui-avatars\.com/i.test(url);
}

async function enrichLiveCreator(creator: LiveCreator): Promise<LiveCreator> {
  if (!creator.userId) return creator;
  const needsName = isGenericLiveCreatorName(creator.name);
  const needsAvatar = !creator.avatar || isUiAvatarsUrl(creator.avatar);
  if (!needsName && !needsAvatar) return creator;
  try {
    const { data, error } = await request(`/api/profiles/${encodeURIComponent(creator.userId)}`);
    if (error || !data) return creator;
    const { name, avatar } = profileToLiveDisplay(data);
    if (!name && !avatar) return creator;
    return {
      ...creator,
      name: needsName && name ? name : creator.name,
      avatar: avatar || (isUiAvatarsUrl(creator.avatar) ? undefined : creator.avatar),
      title:
        creator.title && !isGenericLiveCreatorName(creator.title)
          ? creator.title
          : name || creator.title,
    };
  } catch {
    return creator;
  }
}

export default function LiveDiscover() {
  const navigate = useNavigate();
  const [creators, setCreators] = useState<LiveCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set());
  const removedKeysRef = useRef<Set<string>>(new Set());
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleIdsRef = useRef<Set<string>>(new Set());

  const fetchLiveStreams = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await request('/api/live/streams');
      if (error || !data) {
        setCreators([]);
        setLoading(false);
        return;
      }

      const streams = Array.isArray(data.streams) ? data.streams : [];
      const removed = removedKeysRef.current;

      const mapped: LiveCreator[] = streams
        .filter((s: { stream_key?: string; streamKey?: string; room_id?: string; roomId?: string; id: string }) => {
          const key = s.stream_key ?? s.streamKey ?? s.room_id ?? s.roomId ?? s.id;
          return key && !removed.has(key);
        })
        .map((s: { stream_key?: string; streamKey?: string; room_id?: string; roomId?: string; id: string; user_id?: string; userId?: string; hostUserId?: string; title?: string; display_name?: string; displayName?: string; viewer_count?: number; viewerCount?: number }) => {
          const id = s.stream_key ?? s.streamKey ?? s.room_id ?? s.roomId ?? s.id;
          const userId = s.user_id ?? s.userId ?? s.hostUserId ?? '';
          const name = liveNameFromStreamFields(
            s.title,
            s.display_name ?? s.displayName,
            userId,
          );
          return {
            id,
            userId: userId || undefined,
            name,
            avatar: undefined,
            viewers: Number(s.viewer_count ?? s.viewerCount ?? 0),
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

  useEffect(() => {
    const needs = creators.filter(
      (c) =>
        c.userId &&
        (isGenericLiveCreatorName(c.name) || !c.avatar || isUiAvatarsUrl(c.avatar)),
    );
    if (needs.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const creator of needs) {
        if (cancelled) return;
        const enriched = await enrichLiveCreator(creator);
        if (
          enriched.name === creator.name &&
          enriched.avatar === creator.avatar &&
          enriched.title === creator.title
        ) {
          continue;
        }
        setCreators((prev) => prev.map((c) => (c.id === creator.id ? enriched : c)));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creators.map((c) => `${c.id}:${c.name}:${c.userId ?? ''}:${c.avatar ?? ''}`).join(',')]);

  const removeLiveStream = useCallback((key: string) => {
    removedKeysRef.current.add(key);
    setCreators((prev) => prev.filter((c) => c.id !== key));
    setTimeout(() => removedKeysRef.current.delete(key), 10000);
  }, []);

  const token = useAuthStore((s) => s.session?.access_token) ?? '';

  useEffect(() => {
    fetchLiveStreams();
    const poll = setInterval(fetchLiveStreams, 3_000);
    return () => clearInterval(poll);
  }, [fetchLiveStreams]);

  // Activate live preview only for cards on screen (same pattern as For You active slide)
  useEffect(() => {
    observerRef.current?.disconnect();
    visibleIdsRef.current = new Set();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.streamId;
          if (!id) continue;
          const on = entry.isIntersecting && entry.intersectionRatio >= 0.35;
          if (on) {
            if (!visibleIdsRef.current.has(id)) {
              visibleIdsRef.current.add(id);
              changed = true;
            }
          } else if (visibleIdsRef.current.delete(id)) {
            changed = true;
          }
        }
        if (changed) {
          // Confirmed Android risk: multiple InlineLiveViewer LiveKit rooms = OOM/crash.
          // Allow only one active LiveKit preview at a time.
          const first = visibleIdsRef.current.values().next().value as string | undefined;
          setActiveIds(first ? new Set([first]) : new Set());
        }
      },
      { threshold: [0, 0.35, 0.6], rootMargin: '40px 0px' },
    );
    for (const el of cardRefs.current.values()) {
      observerRef.current.observe(el);
    }
    return () => observerRef.current?.disconnect();
  }, [creators.map((c) => c.id).join(',')]);

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
            const userId = (data.user_id ?? '') as string;
            const name = liveNameFromStreamFields(
              data.title,
              data.display_name ?? data.displayName,
              userId,
            );
            const nextCreator: LiveCreator = {
              id: key,
              userId: userId || undefined,
              name,
              avatar: undefined,
              viewers: 0,
              title: typeof data.title === 'string' ? data.title : name,
            };
            setCreators((prev) => {
              if (prev.some((c) => c.id === key)) return prev;
              return [nextCreator, ...prev];
            });
            void enrichLiveCreator(nextCreator).then((enriched) => {
              if (
                enriched.name === nextCreator.name &&
                enriched.avatar === nextCreator.avatar &&
                enriched.title === nextCreator.title
              ) {
                return;
              }
              setCreators((prev) => prev.map((c) => (c.id === key ? enriched : c)));
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
      } catch { /* intentionally empty */ }
    };
  }, [token, removeLiveStream]);

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    const prev = cardRefs.current.get(id);
    if (prev && observerRef.current) observerRef.current.unobserve(prev);
    if (el) {
      el.dataset.streamId = id;
      cardRefs.current.set(id, el);
      observerRef.current?.observe(el);
    } else {
      cardRefs.current.delete(id);
    }
  }, []);

  return (
    <div className="app-live-column bg-[#111111]">
      {/* Header inside column — close stays within max-w container */}
      <div
        className="flex-shrink-0 w-full px-3 flex items-center justify-between z-20"
        style={{
          paddingTop: 'var(--topnav-anchor-top)',
          minHeight: 'calc(var(--topnav-anchor-top) + var(--topnav-bar-height))',
        }}
      >
        <button
          type="button"
          onClick={fetchLiveStreams}
          className="p-1"
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={18} className={`text-white ${loading ? 'animate-spin' : ''}`} />
        </button>
        <h1 className="text-sm font-bold text-white">
          Live
          {creators.length > 0 ? (
            <span className="text-white/40 font-medium text-xs ml-1.5">{creators.length}</span>
          ) : null}
        </h1>
        <button
          type="button"
          onClick={() => navigate('/feed')}
          className="p-1"
          title="Back"
        >
          <RoyceBackIcon />
        </button>
      </div>

      {/* Content — same column as header */}
      <div
        className="flex-1 min-h-0 w-full overflow-y-auto"
        style={{ paddingBottom: 'var(--bottom-ui-reserve)' }}
      >
        <div className="w-full max-w-[480px] mx-auto">
          {loading && creators.length === 0 ? (
            <div className="flex items-center justify-center py-32">
              <div className="w-8 h-8 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : creators.length > 0 ? (
            <div className="grid grid-cols-2 gap-1 px-1 pb-[env(safe-area-inset-bottom,20px)]">
              {creators.map((c, i) => {
                const previewActive = activeIds.has(c.id);
                return (
                <div
                  key={c.id}
                  ref={(el) => setCardRef(c.id, el)}
                  className={`relative overflow-hidden bg-black ${
                    i === 0 && creators.length > 2 ? 'col-span-2 aspect-[2/1.2]' : 'aspect-[3/4]'
                  }`}
                >
                  {previewActive ? (
                    <Suspense fallback={<div className="absolute inset-0 bg-[#111111]" />}>
                      <InlineLiveViewer
                        streamKey={c.id}
                        isActive
                        creatorName={c.name}
                        creatorAvatar={c.avatar}
                        viewerCount={c.viewers}
                      />
                    </Suspense>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate(`/watch/${c.id}`)}
                      className="absolute inset-0 w-full h-full"
                      aria-label={`Watch ${c.name}`}
                    >
                      {c.avatar ? (
                        <img
                          src={c.avatar}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1c22] to-[#0e1015] flex items-center justify-center">
                          <span className="text-[#D4AF37] font-bold text-2xl">
                            {(c.name || 'L').slice(0, 1).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-white/20 text-white text-[9px] font-extrabold uppercase tracking-wider">
                        Live
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-2.5">
                        <p className="text-white font-bold text-xs truncate">{c.name}</p>
                      </div>
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          ) : (
            /* Empty state — no Go Live button, just info */
            <div className="flex flex-col items-center justify-center py-32 px-8 text-center">
              <div className="w-20 h-20 rounded-full bg-white/[0.02] border border-white/5 flex items-center justify-center mb-5">
                <Radio className="w-8 h-8 text-white/10" />
              </div>
              <p className="text-white/60 font-bold text-base mb-1">No one is live right now</p>
              <p className="text-white/25 text-xs mb-6 max-w-[240px]">
                Check back later to watch creators streaming live
              </p>
              <button
                type="button"
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
