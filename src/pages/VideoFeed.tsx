import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import InlineLiveViewer from "../components/InlineLiveViewer";
import EnhancedVideoPlayer from "../components/EnhancedVideoPlayer";
import { useVideoStore } from "../store/useVideoStore";
import { useAuthStore } from "../store/useAuthStore";
import { getWsUrl } from "../lib/api";
import { request } from "../lib/apiClient";

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
};

/** Backend may return snake_case or camelCase; we accept both. */
interface RawStream {
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
}

type FeedItem =
  | { kind: "live"; stream: LiveStreamCard }
  | { kind: "video"; videoId: string };

/* AutoJoinLiveSlide removed: auto-navigating caused an infinite loop when
   pressing X returned to /feed — the live card at the same index would
   immediately re-trigger navigation. Users now tap LivePreviewCard to join. */

/* ------------------------------------------------------------------ */
/*  Lightweight per-room WebSocket monitor                             */
/*  Opens a subscribe-only WS to each active room so we receive       */
/*  "stream_ended" the instant the host disconnects — no polling lag.  */
/* ------------------------------------------------------------------ */

class RoomMonitor {
  private sockets = new Map<string, WebSocket>();
  private reconnectAttempts = new Map<string, number>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private activeKeys = new Set<string>();
  private onStreamEnded: (streamKey: string) => void;
  private token: string;

  constructor(token: string, onStreamEnded: (streamKey: string) => void) {
    this.token = token;
    this.onStreamEnded = onStreamEnded;
  }

  /** Reconcile: open sockets for new rooms, close sockets for removed rooms */
  sync(activeKeys: string[]) {
    const desired = new Set(activeKeys);
    this.activeKeys = desired;

    // Close sockets for rooms no longer active
    for (const [key, ws] of this.sockets) {
      if (!desired.has(key)) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        this.sockets.delete(key);
      }
    }

    // Open sockets for new rooms
    for (const key of activeKeys) {
      if (this.sockets.has(key)) continue;
      this.openSocket(key);
    }
  }

  private openSocket(roomKey: string) {
    if (!this.token) return;
    try {
      const wsUrl = getWsUrl();
      const ws = new WebSocket(
        `${wsUrl}/live/${roomKey}?token=${encodeURIComponent(this.token)}`,
      );

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.event === "stream_ended") {
            this.onStreamEnded(msg.data?.stream_key || roomKey);
          }
        } catch {
          /* malformed frame */
        }
      };

      ws.onerror = () => {
        /* silent */
      };

      ws.onclose = () => {
        if (this.sockets.get(roomKey) !== ws) return;
        this.sockets.delete(roomKey);
        if (!this.token || !this.activeKeys.has(roomKey)) return;
        const n = (this.reconnectAttempts.get(roomKey) ?? 0) + 1;
        if (n > 12) return;
        this.reconnectAttempts.set(roomKey, n);
        const base = 1000 * Math.pow(2, n - 1);
        const delay = Math.min(30_000, base + Math.floor(Math.random() * 400));
        const timer = setTimeout(() => {
          this.reconnectTimers.delete(roomKey);
          if (this.token && this.activeKeys.has(roomKey) && !this.sockets.has(roomKey)) {
            this.openSocket(roomKey);
          }
        }, delay);
        this.reconnectTimers.set(roomKey, timer);
      };

      // Send keepalive to prevent server-side timeout
      const keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("ping");
        } else {
          clearInterval(keepAlive);
        }
      }, 25_000);

      this.sockets.set(roomKey, ws);
    } catch {
      /* connection failed — polling is still the fallback */
    }
  }

  destroy() {
    for (const [, ws] of this.sockets) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    this.sockets.clear();
  }
}

/** Map stream_started payload from server to LiveStreamCard */
function streamStartedToCard(data: Record<string, unknown>): LiveStreamCard {
  const key = (data.stream_key ?? data.room_id ?? "") as string;
  const userId = (data.user_id ?? "") as string;
  const title = (data.title ?? data.display_name ?? "") as string;
  const label = userId ? String(userId).slice(0, 8) : "Creator";
  return {
    streamKey: key,
    name: title || label,
    avatar: userId
      ? `https://ui-avatars.com/api/?name=${encodeURIComponent(label)}&background=121212&color=C9A96E`
      : "",
    viewers: 0,
    title: title || undefined,
    thumbnail: "",
    userId,
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function VideoFeed() {
  const location = useLocation();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [liveStreams, setLiveStreams] = useState<LiveStreamCard[]>([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const removedKeysRef = useRef<Set<string>>(new Set());
  const monitorRef = useRef<RoomMonitor | null>(null);

  const session = useAuthStore((s) => s.session);
  const token = session?.access_token || "";

  const { videos, fetchVideos, loading: videosLoading } = useVideoStore();

  /* ---- Remove a live stream instantly ---- */
  const removeLiveStream = useCallback((streamKey: string) => {
    removedKeysRef.current.add(streamKey);
    setLiveStreams((prev) => prev.filter((s) => s.streamKey !== streamKey));
    // Keep it suppressed for 20s so polling doesn't re-add a stale entry
    setTimeout(() => removedKeysRef.current.delete(streamKey), 20_000);
  }, []);

  /* ---- Fetch live streams from REST ---- */
  const fetchLiveStreams = useCallback(async () => {
    try {
      const { data: body, error } = await request("/api/live/streams");

      if (error) {
        setLiveStreams([]);
        setLiveLoading(false);
        return;
      }
      const streams: RawStream[] = Array.isArray(body?.streams)
        ? (body.streams as RawStream[])
        : [];

      // When API returns [], still merge with prev so streams from stream_started stay visible
      const removed = removedKeysRef.current;
      // Hide streams that were just ended on this device (creator closed live)
      let lastEndedRoom: string | null = null;
      let lastEndedAt = 0;
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem("elix_last_ended_stream");
          if (raw) {
            const parsed = JSON.parse(raw) as { roomId?: string; endedAt?: number };
            if (parsed?.roomId && typeof parsed.endedAt === "number") {
              lastEndedRoom = parsed.roomId;
              lastEndedAt = parsed.endedAt;
            }
          }
        } catch {
          /* ignore */
        }
      }
      const hideOwnRecentlyEnded = (roomId: string | undefined | null) => {
        if (!roomId || !lastEndedRoom) return false;
        const fresh = Date.now() - lastEndedAt < 5 * 60 * 1000; // 5 minutes
        return fresh && roomId === lastEndedRoom;
      };

      const mapped: LiveStreamCard[] = streams
        .filter((s: RawStream) => {
          const key =
            s.stream_key ?? s.streamKey ?? s.room_id ?? s.roomId ?? s.id;
          if (!key || removed.has(key)) return false;
          if (hideOwnRecentlyEnded(key)) return false;
          return true;
        })
        .map((s: RawStream) => {
          const key =
            s.stream_key ?? s.streamKey ?? s.room_id ?? s.roomId ?? s.id;
          const userId =
            s.user_id ?? s.userId ?? s.hostUserId ?? "";
          const title =
            s.title ?? s.display_name ?? s.displayName ?? undefined;
          const viewers = Number(
            s.viewer_count ?? s.viewerCount ?? 0
          );
          return {
            streamKey: key,
            name: title || (userId ? `User ${String(userId).slice(0, 8)}` : "Creator"),
            avatar: "",
            viewers,
            title: title || undefined,
            thumbnail: "",
            userId,
          } as LiveStreamCard;
        });

      // Merge with current list so streams added by stream_started (realtime) don't disappear
      // when the poll runs before LiveKit has the room (creator still connecting)
      setLiveStreams((prev) => {
        const fromApi = new Set(mapped.map((s) => s.streamKey));
        const keptFromPrev = prev.filter(
          (s) => !fromApi.has(s.streamKey) && !removed.has(s.streamKey)
        );
        return [...mapped, ...keptFromPrev];
      });
    } catch {
      setLiveStreams([]);
    }
    setLiveLoading(false);
  }, []);

  /* ---- Bootstrap: polling + WebSocket monitor ---- */
  useEffect(() => {
    setLiveLoading(true);
    fetchLiveStreams();
    fetchVideos();

    // Poll every 3 seconds for fast discovery of NEW streams
    const poll = setInterval(fetchLiveStreams, 3_000);

    // Create room monitor for instant stream_ended detection
    if (token) {
      monitorRef.current = new RoomMonitor(token, (endedKey) => {
        removeLiveStream(endedKey);
      });
    }

    return () => {
      clearInterval(poll);
      monitorRef.current?.destroy();
      monitorRef.current = null;
    };
  }, [fetchLiveStreams, fetchVideos, removeLiveStream, token]);

  /* ---- Enrich live stream names/avatars from profiles ---- */
  useEffect(() => {
    const needsEnrichment = liveStreams.filter(s => s.userId && (!s.name || s.name.startsWith('User ') || s.name === 'Creator'));
    if (needsEnrichment.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const stream of needsEnrichment) {
        if (cancelled || !stream.userId) continue;
        try {
          const { data: profile, error: profError } = await request(`/api/profiles/${stream.userId}`);
          if (profError || cancelled) continue;
          const displayName = profile?.display_name || profile?.username || profile?.name;
          const avatar = profile?.avatar_url || profile?.avatar;
          if (cancelled) return;
          if (displayName || avatar) {
            setLiveStreams(prev => prev.map(s =>
              s.streamKey === stream.streamKey
                ? { ...s, name: displayName || s.name, avatar: avatar || s.avatar }
                : s
            ));
          }
        } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, [liveStreams.map(s => s.streamKey).join(',')]);

  /* ---- Feed channel: when a creator starts live, they appear on For You immediately; reconnect on close ---- */
  useEffect(() => {
    if (!token) return;
    const wsUrl = getWsUrl();
    const url = `${wsUrl}/live/__feed__?token=${encodeURIComponent(token)}`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      try {
        ws = new WebSocket(url);
      } catch {
        reconnectTimer = setTimeout(connect, 3000);
        return;
      }
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          const event = msg?.event;
          const data = msg?.data || {};
          if (event === "stream_started") {
            const uid = String(data.user_id ?? "");
            if (!uid) return;
            const key = (data.stream_key ?? data.room_id) as string;
            if (!key) return;
            if (removedKeysRef.current.has(key)) return;
            setLiveStreams((prev) => {
              if (prev.some((s) => s.streamKey === key)) return prev;
              const next = [streamStartedToCard(data), ...prev];
              return next;
            });
          } else if (event === "stream_ended") {
            const key = (data.stream_key ?? data.room_id) as string;
            if (key) removeLiveStream(key);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        ws = null;
        if (!cancelled) reconnectTimer = setTimeout(connect, 3000);
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
  const visibleLiveStreams = useMemo(() => liveStreams, [liveStreams]);

  useEffect(() => {
    monitorRef.current?.sync(visibleLiveStreams.map((s) => s.streamKey));
  }, [visibleLiveStreams]);

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

  useEffect(() => {
    const container = containerRef.current;
    if (!container || feedItems.length === 0) return;

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
  }, [feedKey]);

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
    if (cur < prev && activeIndex >= cur && cur >= 0) {
      setActiveIndex(cur - 1);
      containerRef.current?.scrollTo({
        top: (cur - 1) * (containerRef.current?.clientHeight || 0),
        behavior: "smooth",
      });
    }
  }, [feedItems.length, activeIndex]);

  const loading = liveLoading || videosLoading;

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */
  return (
    <div className="h-full min-h-0 w-full flex flex-col bg-[#0A0B0E]">
      {/* Fills main between fixed TopNav and BottomNav; each slide is one viewport tall */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 w-full overflow-y-scroll snap-y snap-mandatory relative"
        style={{ scrollSnapType: "y mandatory" }}
        onScroll={handleScroll}
      >
        {feedItems.map((item, index) => {
          const slideStyle: React.CSSProperties = {
            scrollSnapAlign: "start",
            scrollSnapStop: "always",
            boxSizing: "border-box",
            paddingTop: "0",
            paddingBottom: "3mm",
          };

          if (item.kind === "live") {
            return (
              <div
                key={`live-${item.stream.streamKey}`}
                data-feed-index={index}
                className="h-full w-full shrink-0 snap-start flex flex-col items-center bg-[#0A0B0E]"
                style={slideStyle}
              >
                <div className="w-full max-w-[480px] flex-1 min-h-0 relative overflow-hidden bg-[#0A0B0E]">
                  <InlineLiveViewer
                    streamKey={item.stream.streamKey}
                    isActive={activeIndex === index}
                    creatorName={item.stream.name}
                    creatorAvatar={item.stream.avatar}
                    viewerCount={item.stream.viewers}
                  />
                </div>
              </div>
            );
          }

          return (
            <div
              key={`video-${item.videoId}-${index}`}
              data-feed-index={index}
              className="h-full w-full shrink-0 snap-start flex flex-col items-center bg-[#0A0B0E]"
              style={slideStyle}
            >
              <div className="w-full max-w-[480px] flex-1 min-h-0 relative overflow-hidden bg-[#0A0B0E]">
                <EnhancedVideoPlayer
                  videoId={item.videoId}
                  isActive={activeIndex === index}
                  onVideoEnd={() => handleVideoEnd(index)}
                />
              </div>
            </div>
          );
        })}

      {/* ---- Loading spinner ---- */}
      {loading && feedItems.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-8 h-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ---- Empty state: For You is for watching only — no "go live" here ---- */}
      {!loading && feedItems.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
          <div className="w-20 h-20 rounded-full bg-[#13151A] border border-white/10 flex items-center justify-center mb-4 pointer-events-none">
            <span className="text-3xl">📡</span>
          </div>
          <p className="text-white/60 font-semibold text-base mb-1 text-center">
            Nothing here yet
          </p>
          <p className="text-white/30 text-sm mb-4 text-center">
            Videos and livestreams from everyone appear here. When creators post or go live, it shows up right away.
          </p>
          <button
            type="button"
            onClick={() => {
              setLiveLoading(true);
              fetchLiveStreams();
              fetchVideos();
            }}
            className="px-5 py-2 bg-white/10 border border-white/20 rounded-full text-white/80 text-sm font-bold active:scale-95 transition-transform"
          >
            Refresh
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
