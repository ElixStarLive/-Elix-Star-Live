import React, { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
// Lazy so livekit-client (~420kb) is NOT in the first-paint feed chunk; it only
// loads when a live card is actually rendered.
const InlineLiveViewer = React.lazy(() => import("../components/InlineLiveViewer"));
import EnhancedVideoPlayer from "../components/EnhancedVideoPlayer";
import { useVideoStore } from "../store/useVideoStore";
import { useAuthStore } from "../store/useAuthStore";
import {
  isGenericLiveCreatorName,
  isUiAvatarsUrl,
  liveNameFromStreamFields,
  liveStreamEndedKey,
  parseRawLiveStreamCore,
  profileToLiveDisplay,
  sanitizeLiveAvatar,
  type RawLiveStreamFields,
} from "../lib/liveCreatorDisplay";
import { platform } from "../lib/platform";
import { apiLiveStreams, connectLiveFeedPresence } from "../lib/live";
import {
  createLiveSnapshotGate,
  pruneEndedBefore,
  reconcileLivePresence,
} from "../lib/live/liveCardReconcile";
import { reportFailure } from "../lib/reportFailure";
import { apiFetchProfileById as apiFeedFetchProfileById } from "../features/feed/feedApi";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type LiveStreamCard = {
  streamKey: string;
  name: string;
  avatar?: string;
  viewers: number;
  title?: string;
  thumbnail?: string;
  userId?: string;
  /** When this client learned the room was live — orders client vs server truth. */
  discoveredAt: number;
};

type FeedItem =
  | { kind: "live"; stream: LiveStreamCard }
  | { kind: "video"; videoId: string };

/* AutoJoinLiveSlide removed: auto-navigating caused an infinite loop when
   pressing X returned to /feed — the live card at the same index would
   immediately re-trigger navigation. Users now tap LivePreviewCard to join. */

/** Map stream_started payload from server to LiveStreamCard */
function streamStartedToCard(data: Record<string, unknown>): LiveStreamCard {
  const key = (data.stream_key ?? data.room_id ?? "") as string;
  const userId = (data.user_id ?? "") as string;
  const name = liveNameFromStreamFields(data.title, data.display_name ?? data.displayName, userId);
  return {
    streamKey: key,
    name,
    avatar: "",
    viewers: 0,
    title: typeof data.title === "string" ? data.title : undefined,
    thumbnail: "",
    userId,
    discoveredAt: Date.now(),
  };
}

async function enrichLiveStreamCard(card: LiveStreamCard): Promise<LiveStreamCard> {
  if (!card.userId) return card;
  const needsName = isGenericLiveCreatorName(card.name);
  const needsAvatar = !sanitizeLiveAvatar(card.avatar);
  if (!needsName && !needsAvatar) return card;
  try {
    const { body, error } = await apiFeedFetchProfileById(card.userId);
    if (error || !body) return card;
    const { name, avatar } = profileToLiveDisplay(body);
    if (!name && !avatar) return card;
    const cleanAvatar = sanitizeLiveAvatar(avatar);
    return {
      ...card,
      name: needsName && name ? name : card.name,
      avatar: cleanAvatar || sanitizeLiveAvatar(card.avatar),
      title:
        card.title && !isGenericLiveCreatorName(card.title)
          ? card.title
          : name || card.title,
    };
  } catch {
    return card;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function VideoFeed() {
  const location = useLocation();
  const _navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [liveStreams, setLiveStreams] = useState<LiveStreamCard[]>([]);
  const [liveLoading, setLiveLoading] = useState(true);
  // stream_ended times, so a snapshot taken before the end cannot re-add the
  // room. Records are pruned once a newer snapshot has accounted for them.
  const endedAtRef = useRef<Map<string, number>>(new Map());
  /* Several triggers refresh this list, so responses can land out of order. */
  const snapshotGate = useRef(createLiveSnapshotGate());

  const session = useAuthStore((s) => s.session);
  const token = session?.access_token || "";

  const { videos, fetchVideos, fetchMoreForYou, forYouHasMore, loading: videosLoading } = useVideoStore();

  /* Prefetch next For You page before the user reaches the end (live cards prepend). */
  useEffect(() => {
    if (!forYouHasMore || videosLoading) return;
    const liveCount = liveStreams.length;
    const vodIndex = activeIndex - liveCount;
    if (vodIndex >= videos.length - 5) {
      void fetchMoreForYou();
    }
  }, [activeIndex, videos.length, liveStreams.length, forYouHasMore, videosLoading, fetchMoreForYou]);

  /* ---- Remove a live stream (feed presence stream_ended) ---- */
  const removeLiveStream = useCallback((streamKey: string) => {
    endedAtRef.current.set(streamKey, Date.now());
    setLiveStreams((prev) => prev.filter((s) => s.streamKey !== streamKey));
  }, []);

  /* ---- Fetch live streams from REST (server owns live presence) ---- */
  const fetchLiveStreams = useCallback(async () => {
    const ticket = snapshotGate.current.begin();
    const requestedAt = Date.now();
    try {
      const { streams: rawStreams, error } = await apiLiveStreams();

      // Failed or unchanged (304): the server told us nothing about who is
      // live, so this is not a snapshot and the current list stands.
      if (error) {
        setLiveLoading(false);
        return;
      }
      // A newer request was sent after this one, so this answer is no longer
      // the authoritative one and must not roll the list back.
      if (!snapshotGate.current.isCurrent(ticket)) {
        setLiveLoading(false);
        return;
      }
      const streams = rawStreams as RawLiveStreamFields[];

      const snapshot: LiveStreamCard[] = streams
        .filter((s) => !!parseRawLiveStreamCore(s).streamKey)
        .map((s) => {
          const core = parseRawLiveStreamCore(s);
          return {
            streamKey: core.streamKey,
            name: core.name,
            avatar: "",
            viewers: core.viewers,
            title: core.title,
            thumbnail: "",
            userId: core.userId,
            discoveredAt: requestedAt,
          } as LiveStreamCard;
        });

      setLiveStreams((prev) =>
        reconcileLivePresence<LiveStreamCard>({
          snapshot,
          previous: prev,
          keyOf: (s) => s.streamKey,
          discoveredAtOf: (s) => s.discoveredAt,
          requestedAt,
          endedAt: endedAtRef.current,
        }),
      );
      pruneEndedBefore(endedAtRef.current, requestedAt);
    } catch (err) {
      reportFailure("feed_live_streams", err);
    }
    setLiveLoading(false);
  }, []);

  /* ---- Bootstrap: REST hydration (realtime add/remove = feed presence) ---- */
  useEffect(() => {
    setLiveLoading(true);
    fetchLiveStreams();
    fetchVideos();
  }, [fetchLiveStreams, fetchVideos]);

  /* ---- Reconcile: visibility/focus (recover missed WS); realtime = feed presence ---- */
  useEffect(() => {
    if (location.pathname !== "/feed") return;

    const reconcile = () => {
      void fetchLiveStreams();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconcile();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", reconcile);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", reconcile);
    };
  }, [location.pathname, fetchLiveStreams]);

  /* ---- Enrich live stream names/avatars from profiles ---- */
  /* Keyed on identity fields only: enrichment must not re-run when viewer
     counts tick. The ref carries the current cards into that keyed run. */
  const liveStreamIdentityKey = liveStreams
    .map((s) => `${s.streamKey}:${s.name}:${s.userId}`)
    .join(",");
  const liveStreamsRef = useRef(liveStreams);
  liveStreamsRef.current = liveStreams;

  useEffect(() => {
    const needsEnrichment = liveStreamsRef.current.filter(
      (s) =>
        s.userId &&
        (isGenericLiveCreatorName(s.name) || !sanitizeLiveAvatar(s.avatar) || isUiAvatarsUrl(s.avatar)),
    );
    if (needsEnrichment.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const stream of needsEnrichment) {
        if (cancelled || !stream.userId) continue;
        const enriched = await enrichLiveStreamCard(stream);
        if (cancelled || enriched.name === stream.name && enriched.avatar === stream.avatar) continue;
        setLiveStreams((prev) =>
          prev.map((s) => (s.streamKey === stream.streamKey ? enriched : s)),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [liveStreamIdentityKey]);

  /* ---- Feed channel: when a creator starts live, they appear on For You immediately; reconnect on close ---- */
  useEffect(() => {
    if (!token) return;
    return connectLiveFeedPresence(token, {
      onStreamStarted: (data) => {
        const key = String(data.stream_key ?? data.room_id ?? "").trim();
        if (!key) return;
        const uid = String(data.user_id ?? key);
        endedAtRef.current.delete(key);
        const card = streamStartedToCard({ ...data, user_id: uid, stream_key: key });
        setLiveStreams((prev) => {
          if (prev.some((s) => s.streamKey === key)) return prev;
          return [card, ...prev];
        });
        void enrichLiveStreamCard(card).then((enriched) => {
          if (enriched.name === card.name && enriched.avatar === card.avatar) return;
          setLiveStreams((prev) =>
            prev.map((s) => (s.streamKey === key ? enriched : s)),
          );
        });
      },
      onStreamEnded: (data) => {
        const key = liveStreamEndedKey(data);
        if (key) removeLiveStream(key);
      },
    });
  }, [token, removeLiveStream]);

  /* ---- Re-fetch when navigating back to /feed ---- */
  useEffect(() => {
    if (location.pathname === "/feed") {
      setActiveIndex(0);
      fetchLiveStreams();
      fetchVideos();
      setTimeout(() => {
        containerRef.current?.scrollTo({ top: 0, behavior: "auto" });
      }, 0);
    }
  }, [location.pathname, fetchLiveStreams, fetchVideos]);

  /* ---- All live streams visible on For You (everyone) ---- */
  const visibleLiveStreams = liveStreams;

  /* ---- Build unified feed: live first, then videos ---- */
  const feedItems: FeedItem[] = [
    ...visibleLiveStreams.map((stream): FeedItem => ({ kind: "live", stream })),
    ...videos.map((v): FeedItem => ({ kind: "video", videoId: v.id })),
  ];

  /* ---- Active slide: IntersectionObserver (only the most visible slide plays audio/video) ---- */
  const feedKey = [
    ...visibleLiveStreams.map((s) => s.streamKey),
    ...videos.map((v) => v.id),
  ].join("|");

  /* Count changes only when feedKey changes, so listing it adds no re-runs. */
  const feedItemCount = feedItems.length;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || feedItemCount === 0) return;

    const ratios = new Map<Element, number>();
    const pickActive = () => {
      const slides = container.querySelectorAll("[data-feed-index]");
      let bestIdx = 0;
      let bestRatio = -1;
      slides.forEach((el) => {
        const idx = parseInt(el.getAttribute("data-feed-index") || "0", 10);
        const r = ratios.get(el) ?? 0;
        if (r > bestRatio) {
          bestRatio = r;
          bestIdx = idx;
        }
      });
      if (bestRatio < 0.01) return;
      setActiveIndex((prev) => (prev === bestIdx ? prev : bestIdx));
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          ratios.set(e.target, e.intersectionRatio);
        });
        pickActive();
      },
      {
        root: container,
        rootMargin: "0px",
        threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1],
      },
    );

    const slides = container.querySelectorAll("[data-feed-index]");
    slides.forEach((el) => {
      ratios.set(el, 0);
      observer.observe(el);
    });
    pickActive();

    return () => observer.disconnect();
  }, [feedKey, feedItemCount]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const children = container.querySelectorAll("[data-feed-index]");
    const containerRect = container.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;
    let bestIndex = 0;
    let bestDist = Infinity;
    children.forEach((child) => {
      const rect = child.getBoundingClientRect();
      const childCenter = rect.top + rect.height / 2;
      const dist = Math.abs(childCenter - centerY);
      const idx = parseInt(child.getAttribute("data-feed-index") || "0", 10);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = idx;
      }
    });
    if (bestIndex >= 0 && bestIndex < feedItems.length) {
      setActiveIndex((prev) => (prev === bestIndex ? prev : bestIndex));
    }
  };

  const handleVideoEnd = (index: number) => {
    if (!containerRef.current || index >= feedItems.length - 1) return;
    containerRef.current.scrollTo({
      top: (index + 1) * containerRef.current.clientHeight,
      behavior: "smooth",
    });
  };

  /* ---- Keep activeIndex in bounds when items are removed ---- */
  const prevCountRef = useRef(feedItems.length);
  useEffect(() => {
    const prev = prevCountRef.current;
    const cur = feedItems.length;
    prevCountRef.current = cur;
    if (cur < prev && activeIndex >= cur && cur > 0) {
      setActiveIndex(cur - 1);
      containerRef.current?.scrollTo({
        top: (cur - 1) * (containerRef.current?.clientHeight || 0),
        behavior: "smooth",
      });
    }
  }, [feedItems.length, activeIndex]);

  const loading = liveLoading || videosLoading;
  /* Native: no -4mm / +3mm slide hacks (they hide chrome under home bar in WebView). Web keeps prior spacing. */
  const isNativeFeed = platform.isNative;

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <div className="h-full min-h-0 w-full flex flex-col bg-transparent relative">
      {/* Fills main between fixed TopNav and BottomNav; each slide is one viewport tall */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 w-full overflow-y-scroll snap-y snap-mandatory relative"
        style={{
          scrollSnapType: "y mandatory",
          ...(isNativeFeed ? {} : { marginTop: "-4mm" }),
        }}
        onScroll={handleScroll}
      >
        {feedItems.map((item, index) => {
          const slideStyle: React.CSSProperties = {
            scrollSnapAlign: "start",
            scrollSnapStop: "always",
            boxSizing: "border-box",
            paddingTop: "0",
            ...(isNativeFeed ? {} : { paddingBottom: "3mm" }),
          };

          if (item.kind === "live") {
            return (
              <div
                key={`live-${item.stream.streamKey}`}
                data-feed-index={index}
                className="h-full w-full shrink-0 snap-start flex flex-col items-center bg-transparent"
                style={slideStyle}
              >
                <div className="w-full flex-1 min-h-0 relative overflow-hidden bg-transparent">
                  <Suspense fallback={<div className="w-full h-full bg-transparent" />}>
                    <InlineLiveViewer
                      key={`foryou-live-${item.stream.streamKey}-v4`}
                      streamKey={item.stream.streamKey}
                      hostUserId={item.stream.userId || item.stream.streamKey}
                      isActive={activeIndex === index}
                      creatorName={item.stream.name}
                      creatorAvatar={item.stream.avatar}
                      viewerCount={item.stream.viewers}
                    />
                  </Suspense>
                </div>
              </div>
            );
          }

          return (
            <div
              key={`video-${item.videoId}`}
              data-feed-index={index}
              className="h-full w-full shrink-0 snap-start flex flex-col items-center bg-transparent"
              style={slideStyle}
            >
              <div className="w-full flex-1 min-h-0 relative overflow-hidden bg-transparent">
                <EnhancedVideoPlayer
                  videoId={item.videoId}
                  isActive={activeIndex === index}
                  onVideoEnd={() => handleVideoEnd(index)}
                  edgeToBottomNav
                />
              </div>
            </div>
          );
        })}

      {/* ---- Loading spinner ---- */}
      {loading && feedItems.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 border-2 border-[#E6E9EE]/25 border-t-[#E6E9EE] rounded-full animate-spin elix-loader" />
        </div>
      )}

      {/* ---- Empty state: For You is for watching only — no "go live" here ---- */}
      {!loading && feedItems.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
          <span className="text-3xl mb-4 pointer-events-none">📡</span>
          <p className="text-gold-light/70 font-semibold text-base mb-1 text-center">
            Nothing here yet
          </p>
          <p className="text-gold-light/40 text-sm mb-4 text-center">
            Videos and livestreams from everyone appear here. When creators post or go live, it shows up right away.
          </p>
          <button
            type="button"
            onClick={() => {
              setLiveLoading(true);
              fetchLiveStreams();
              fetchVideos();
            }}
            className="px-5 py-2 bg-gold/15 border border-gold/30 rounded-full text-gold-bright text-sm font-bold active:scale-95 transition-transform"
          >
            Refresh
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
