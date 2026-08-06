import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { RoyceBackIcon } from '../components/royce';
import { useNavigate } from 'react-router-dom';
import { Radio, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { apiLiveStreams, connectLiveFeedPresence } from '../lib/live';
import { showToast } from '../lib/toast';
import {
  isGenericLiveCreatorName,
  isUiAvatarsUrl,
  liveNameFromStreamFields,
  profileToLiveDisplay,
  sanitizeLiveAvatar,
} from '../lib/liveCreatorDisplay';
import { apiFetchProfileById } from '../features/feed/feedApi';

const InlineLiveViewer = React.lazy(() => import('../components/InlineLiveViewer'));

type LiveCreator = {
  id: string;
  userId?: string;
  name: string;
  avatar?: string;
  viewers: number;
  title?: string;
};

async function enrichLiveCreator(creator: LiveCreator): Promise<LiveCreator> {
  if (!creator.userId) return creator;
  const needsName = isGenericLiveCreatorName(creator.name);
  const needsAvatar = !sanitizeLiveAvatar(creator.avatar);
  if (!needsName && !needsAvatar) return creator;
  try {
    const { body, error } = await apiFetchProfileById(creator.userId);
    if (error || !body) return creator;
    const { name, avatar } = profileToLiveDisplay(body);
    if (!name && !avatar) return creator;
    const cleanAvatar = sanitizeLiveAvatar(avatar);
    return {
      ...creator,
      name: needsName && name ? name : creator.name,
      avatar: cleanAvatar || sanitizeLiveAvatar(creator.avatar),
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

  const goFeed = useCallback(() => {
    navigate('/feed');
  }, [navigate]);

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
      const { streams, error } = await apiLiveStreams();
      if (error) {
        // Keep prior lobby data — do not wipe to empty on a failed refresh.
        showToast(error || 'Could not load live streams');
        return;
      }

      const removed = removedKeysRef.current;

      const mapped: LiveCreator[] = streams
        .filter((raw) => {
          const s = raw as { stream_key?: string; streamKey?: string; room_id?: string; roomId?: string; id?: string };
          const key = s.stream_key ?? s.streamKey ?? s.room_id ?? s.roomId ?? s.id;
          return !!key && !removed.has(key);
        })
        .map((raw) => {
          const s = raw as {
            stream_key?: string;
            streamKey?: string;
            room_id?: string;
            roomId?: string;
            id?: string;
            user_id?: string;
            userId?: string;
            hostUserId?: string;
            title?: string;
            display_name?: string;
            displayName?: string;
            viewer_count?: number;
            viewerCount?: number;
          };
          const id = s.stream_key ?? s.streamKey ?? s.room_id ?? s.roomId ?? s.id ?? '';
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not load live streams';
      showToast(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const needs = creators.filter(
      (c) =>
        c.userId &&
        (isGenericLiveCreatorName(c.name) || !sanitizeLiveAvatar(c.avatar) || isUiAvatarsUrl(c.avatar)),
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

  // First visible card should preview immediately (same as For You active slide).
  useEffect(() => {
    if (creators.length === 0) return;
    setActiveIds((prev) => (prev.size > 0 ? prev : new Set([creators[0].id])));
  }, [creators]);

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
    return connectLiveFeedPresence(token, {
      onStreamStarted: (data) => {
        const key = (data.stream_key ?? data.room_id) as string;
        if (!key || removedKeysRef.current.has(key)) return;
        const userId = (data.user_id ?? '') as string;
        const name = liveNameFromStreamFields(
          data.title as string | undefined,
          (data.display_name ?? data.displayName) as string | undefined,
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
      },
      onStreamEnded: (data) => {
        const key = (data.stream_key ?? data.room_id) as string;
        if (key) removeLiveStream(key);
      },
    });
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
    <div className="app-live-column bg-transparent">
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
          onClick={goFeed}
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
              <div className="w-8 h-8 border-2 border-[#6F3FF5]/25 border-t-[#6F3FF5] rounded-full animate-spin elix-loader" />
            </div>
          ) : creators.length > 0 ? (
            <div className="grid grid-cols-2 gap-1 px-1 pb-[env(safe-area-inset-bottom,20px)]">
              {creators.map((c, i) => (
                <div
                  key={c.id}
                  ref={(el) => setCardRef(c.id, el)}
                  className={`relative overflow-hidden bg-transparent ${
                    i === 0 && creators.length > 2 ? 'col-span-2 aspect-[2/1.2]' : 'aspect-[3/4]'
                  }`}
                >
                  <Suspense fallback={<div className="absolute inset-0 bg-transparent" />}>
                    <InlineLiveViewer
                      streamKey={c.id}
                      isActive={activeIds.has(c.id)}
                      creatorName={c.name}
                      creatorAvatar={c.avatar}
                      viewerCount={c.viewers}
                    />
                  </Suspense>
                </div>
              ))}
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
