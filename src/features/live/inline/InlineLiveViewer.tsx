import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RemoteTrack, Room } from "livekit-client";
import { getLiveKitUrl } from "../../../lib/api";
import { useAuthStore } from "../../../store/useAuthStore";
import { LiveKitTrack } from "../../../lib/liveKitSession";
import { websocket } from "../../../lib/websocket";
import { apiLiveToken, LiveRoomLifecycle } from "../../../lib/live";
import { bindLiveRoomWs } from "../ws/bindLiveRoomWs";
import { bindLiveBattleWs } from "../ws/bindLiveBattleWs";
import { bindLiveCohostWs } from "../ws/bindLiveCohostWs";
import { INLINE_LIVE_PLACEHOLDER_AVATAR_PX } from "../../../lib/profileFrame";
import {
  prepareLiveVideoEl,
  LIVE_WEBRTC_VIDEO_CLASS,
  LIVE_VIDEO_TRANSPARENT_POSTER,
} from "../../../lib/prepareLiveVideoEl";
import { Radio } from "lucide-react";

interface InlineLiveViewerProps {
  streamKey: string;
  isActive: boolean;
  creatorName?: string;
  creatorAvatar?: string;
  viewerCount?: number;
  className?: string;
}

type PreviewMode = "normal" | "battle" | "cohost";

type CohostTile = {
  userId: string;
  name: string;
  avatar: string;
  status: string;
};

function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = (a || "").trim().toLowerCase();
  const nb = (b || "").trim().toLowerCase();
  return !!na && !!nb && na === nb;
}

/**
 * For You live slide: mirrors normal / co-host / battle layouts in real time
 * (LiveKit + ephemeral room WS). Tap joins `/watch/:streamKey` for full chat/scores.
 */
export default function InlineLiveViewer({
  streamKey,
  isActive,
  creatorName = "Creator",
  creatorAvatar,
  viewerCount = 0,
  className = "",
}: InlineLiveViewerProps) {
  const navigate = useNavigate();
  const hostVideoRef = useRef<HTMLVideoElement>(null);
  const opponentVideoRef = useRef<HTMLVideoElement>(null);
  const coHostVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const lifecycleRef = useRef(new LiveRoomLifecycle());
  const roomRef = useRef<Room | null>(null);
  const connectedKeyRef = useRef<string>("");
  const modeRef = useRef<PreviewMode>("normal");
  const hostIdRef = useRef<string>(streamKey);
  const opponentIdRef = useRef<string>("");
  const routeVideoTrackRef = useRef<(track: RemoteTrack, identity: string) => void>(() => {});
  const reattachAllRef = useRef<(room: Room) => void>(() => {});

  const [hasStream, setHasStream] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [mode, setMode] = useState<PreviewMode>("normal");
  const [hostUserId, setHostUserId] = useState(streamKey);
  const [coHosts, setCoHosts] = useState<CohostTile[]>([]);
  const [battle, setBattle] = useState<{
    opponentName: string;
    hostScore: number;
    opponentScore: number;
    timeLeft: number;
    status: string;
  } | null>(null);

  modeRef.current = mode;
  hostIdRef.current = hostUserId || streamKey;

  const findCoHostEl = useCallback((identity: string): HTMLVideoElement | null => {
    const direct = coHostVideoRefs.current.get(identity);
    if (direct) return direct;
    for (const [uid, el] of coHostVideoRefs.current) {
      if (sameId(uid, identity)) return el;
    }
    return null;
  }, []);

  const attachToEl = useCallback((track: RemoteTrack, el: HTMLVideoElement | null) => {
    if (!el || track.kind !== "video") return;
    track.attach(el);
    prepareLiveVideoEl(el);
    setHasStream(true);
    // Android LiveKit often skips `playing`; force-show once a frame exists so
    // For You live cards are not stuck visibility:hidden (looks like "no live").
    const showIfFramed = () => {
      if (el.videoWidth > 0) el.style.visibility = "visible";
    };
    showIfFramed();
    el.addEventListener("playing", showIfFramed, { once: true });
    el.addEventListener("loadeddata", showIfFramed, { once: true });
    el.addEventListener("resize", showIfFramed);
    // LiveKit on Android can hold videoWidth at 0 — reveal the attached stream
    // anyway so the card shows live video instead of the avatar placeholder.
    setTimeout(() => {
      if (el.srcObject) el.style.visibility = "visible";
    }, 700);
  }, []);

  const routeVideoTrack = useCallback(
    (track: RemoteTrack, identity: string) => {
      if (track.kind !== "video" || !identity) return;
      const m = modeRef.current;
      const hostId = hostIdRef.current || streamKey;

      if (sameId(identity, hostId) || sameId(identity, streamKey)) {
        attachToEl(track, hostVideoRef.current);
        return;
      }

      if (m === "battle") {
        if (sameId(identity, opponentIdRef.current) || !opponentIdRef.current) {
          if (!opponentIdRef.current) opponentIdRef.current = identity;
          attachToEl(track, opponentVideoRef.current);
          return;
        }
      }

      const tile = findCoHostEl(identity);
      if (tile) {
        attachToEl(track, tile);
        return;
      }

      // Unknown remote before layout sync — put on host pane if empty, else ignore.
      if (hostVideoRef.current && !hostVideoRef.current.srcObject) {
        attachToEl(track, hostVideoRef.current);
      }
    },
    [attachToEl, findCoHostEl, streamKey],
  );

  const reattachAll = useCallback(
    (room: Room) => {
      for (const [, p] of room.remoteParticipants) {
        const identity = p.identity || "";
        for (const [, pub] of p.videoTrackPublications) {
          if (pub.track && pub.isSubscribed) {
            routeVideoTrack(pub.track as RemoteTrack, identity);
          }
        }
      }
    },
    [routeVideoTrack],
  );

  routeVideoTrackRef.current = routeVideoTrack;
  reattachAllRef.current = reattachAll;

  useEffect(() => {
    if (!isActive || !streamKey) {
      lifecycleRef.current.liveKit?.disconnect();
      roomRef.current = null;
      connectedKeyRef.current = "";
      websocket.disconnectIfRoom(streamKey);
      setHasStream(false);
      setConnecting(false);
      setMode("normal");
      setCoHosts([]);
      setBattle(null);
      return;
    }

    const connKey = `${streamKey}-active`;
    if (connectedKeyRef.current === connKey && lifecycleRef.current.liveKit?.connected) return;
    connectedKeyRef.current = connKey;

    let mounted = true;
    let gotVideo = false;
    const lifecycle = lifecycleRef.current;

    const cleanup = () => {
      lifecycle.liveKit?.disconnect();
      roomRef.current = null;
      websocket.disconnectIfRoom(streamKey);
    };

    const timeoutId = setTimeout(() => {
      if (!mounted || gotVideo) return;
      cleanup();
      if (mounted) {
        setConnecting(false);
        setIsOffline(true);
      }
    }, 10000);

    const onStreamEnded = () => {
      if (!mounted) return;
      setIsOffline(true);
      setHasStream(false);
      cleanup();
    };

    const onCohostLayout = (raw: unknown) => {
      if (!mounted) return;
      const data = (raw ?? {}) as Record<string, unknown>;
      const list = Array.isArray(data.coHosts) ? data.coHosts : [];
      const tiles: CohostTile[] = list.map((h: Record<string, unknown>) => ({
        userId: String(h.userId ?? h.id ?? ""),
        name: String(h.name ?? "User"),
        avatar: String(h.avatar ?? ""),
        status: String(h.status ?? "invited"),
      })).filter((h) => h.userId);
      const hid = typeof data.hostUserId === "string" && data.hostUserId
        ? data.hostUserId
        : streamKey;
      setHostUserId(hid);
      hostIdRef.current = hid;
      const live = tiles.filter(
        (h) =>
          !sameId(h.userId, hid) &&
          (h.status === "live" || h.status === "accepted"),
      );
      setCoHosts(live);
      if (modeRef.current !== "battle") {
        const next: PreviewMode = live.length > 0 ? "cohost" : "normal";
        setMode(next);
        modeRef.current = next;
      }
      if (roomRef.current) reattachAllRef.current(roomRef.current);
    };

    const applyBattlePayload = (raw: unknown, fromTick: boolean) => {
      if (!mounted) return;
      const data = (raw ?? {}) as Record<string, unknown>;
      const status = String(data.status || "");
      if (status === "ENDED") {
        setBattle(null);
        opponentIdRef.current = "";
        if (modeRef.current === "battle") {
          setMode("normal");
          modeRef.current = "normal";
        }
        return;
      }
      if (!(status === "ACTIVE" || status === "WAITING" || fromTick)) return;
      const oppId = String(data.opponentUserId || "");
      opponentIdRef.current = oppId;
      setMode("battle");
      modeRef.current = "battle";
      setBattle({
        opponentName: String(data.opponentName || "Opponent"),
        hostScore: Number(data.hostScore) || 0,
        opponentScore: Number(data.opponentScore) || 0,
        timeLeft: Number(data.timeLeft) || 0,
        status: status || "ACTIVE",
      });
      if (typeof data.hostUserId === "string" && data.hostUserId) {
        setHostUserId(data.hostUserId);
        hostIdRef.current = data.hostUserId;
      }
      if (roomRef.current) reattachAllRef.current(roomRef.current);
    };
    const onBattleStateSync = (raw: unknown) => applyBattlePayload(raw, false);
    const onBattleTick = (raw: unknown) => applyBattlePayload(raw, true);

    const unbindRoomWs = bindLiveRoomWs({
      onStreamEnded: onStreamEnded,
    });
    const unbindCohostWs = bindLiveCohostWs({
      onLayoutSync: onCohostLayout,
    });
    const unbindBattleWs = bindLiveBattleWs({
      onStateSync: onBattleStateSync,
      onTick: onBattleTick,
    });

    (async () => {
      if (mounted) {
        setConnecting(true);
        setIsOffline(false);
        setHasStream(false);
        setMode("normal");
        setCoHosts([]);
        setBattle(null);
        opponentIdRef.current = "";
        hostIdRef.current = streamKey;
        setHostUserId(streamKey);
      }
      try {
        const tok = await apiLiveToken(streamKey, false);
        if (tok.error || !tok.creds || !mounted) {
          if (mounted) {
            setIsOffline(true);
            setConnecting(false);
          }
          cleanup();
          return;
        }

        let url = tok.creds.url.trim();
        if (!url) url = getLiveKitUrl();
        const lkToken = tok.creds.token;
        if (!url || !lkToken || !mounted) {
          if (mounted) {
            setIsOffline(true);
            setConnecting(false);
          }
          cleanup();
          return;
        }

        const { error, session } = await lifecycle.connectLiveKitOnly(
          { url, token: lkToken },
          {
            onTrackSubscribed: ({ track, participant }) => {
              if (!mounted || track.kind !== LiveKitTrack.Kind.Video) return;
              gotVideo = true;
              routeVideoTrackRef.current(track, participant?.identity || "");
            },
            onParticipantDisconnected: (participant) => {
              if (!mounted) return;
              const identity = participant?.identity || "";
              if (!sameId(identity, streamKey) && !sameId(identity, hostIdRef.current)) return;
              setHasStream(false);
              setIsOffline(true);
              cleanup();
            },
            onDisconnected: () => {
              if (!mounted) return;
              setIsOffline(true);
              setHasStream(false);
              setConnecting(false);
            },
          },
        );
        if (!mounted || error || !session) {
          cleanup();
          return;
        }
        roomRef.current = session.raw;

        const authToken = useAuthStore.getState().session?.access_token;
        if (authToken) {
          websocket.connect(streamKey, authToken);
        }

        if (session.raw) reattachAllRef.current(session.raw);
        if (gotVideo || (session.raw && hasAnyVideo(session.raw))) {
          gotVideo = true;
          setHasStream(true);
        }
      } catch {
        if (mounted) {
          setHasStream(false);
          setIsOffline(true);
          cleanup();
        }
      } finally {
        if (mounted) setConnecting(false);
      }
    })();

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      connectedKeyRef.current = "";
      unbindRoomWs();
      unbindCohostWs();
      unbindBattleWs();
      cleanup();
      setHasStream(false);
      setConnecting(false);
    };
    // Route/reattach callbacks are refs — reconnect only when slide ownership changes.
  }, [isActive, streamKey]);

  // Re-route when layout mode / cohost tiles change.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !isActive) return;
    reattachAll(room);
  }, [mode, coHosts, battle?.status, isActive, reattachAll]);

  const formattedViewers =
    viewerCount >= 1_000_000
      ? `${(viewerCount / 1_000_000).toFixed(1)}M`
      : viewerCount >= 1_000
        ? `${(viewerCount / 1_000).toFixed(1)}K`
        : String(viewerCount);

  const openWatch = useCallback(() => {
    navigate(`/watch/${streamKey}`);
  }, [navigate, streamKey]);

  const liveCohosts = coHosts.slice(0, 8);
  const displayAvatar = creatorAvatar || "";

  const placeholder = (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#09090B] gap-4 pointer-events-none z-[1]">
      {displayAvatar ? (
        <div
          className="rounded-full overflow-hidden shrink-0"
          style={{ width: INLINE_LIVE_PLACEHOLDER_AVATAR_PX, height: INLINE_LIVE_PLACEHOLDER_AVATAR_PX }}
        >
          <img src={displayAvatar} alt="" className="w-full h-full object-cover object-center" />
        </div>
      ) : (
        <div
          className="rounded-full bg-[#6F3FF5]/20 flex items-center justify-center shrink-0"
          style={{ width: INLINE_LIVE_PLACEHOLDER_AVATAR_PX, height: INLINE_LIVE_PLACEHOLDER_AVATAR_PX }}
        >
          <span className="text-3xl font-bold text-[#F5F5F7]/80">
            {(creatorName || "C").charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <p className="text-white font-semibold text-base truncate max-w-[80%]">{creatorName}</p>
      {connecting && !isOffline ? (
        <>
          <div className="w-8 h-8 border-2 border-[#D8D9DD] border-t-transparent rounded-full animate-spin" />
          <span className="text-white/60 text-sm">Connecting to live...</span>
        </>
      ) : isOffline ? (
        <span className="text-white/50 text-sm">Stream ended</span>
      ) : null}
    </div>
  );

  const videoClass = `absolute inset-0 w-full h-full object-cover pointer-events-none ${LIVE_WEBRTC_VIDEO_CLASS}`;

  return (
    <div
      className={`relative w-full h-full bg-[#09090B] cursor-pointer ${className}`}
      style={{ background: "#09090B" }}
      onClick={openWatch}
    >
      {/* ── Normal live: single full-bleed host ── */}
      {mode === "normal" && (
        <div className="absolute inset-0">
          <video
            ref={hostVideoRef}
            className={videoClass}
            autoPlay
            playsInline
            muted
            controls={false}
            poster={LIVE_VIDEO_TRANSPARENT_POSTER}
            style={{ opacity: hasStream ? 1 : 0, transition: "opacity 0.35s ease", backgroundColor: "#09090B" }}
          />
          {!hasStream && placeholder}
        </div>
      )}

      {/* ── Battle: 50% video / 50% chat of the For You card (chat messages hidden until join) ── */}
      {mode === "battle" && (
        <div
          className="absolute inset-0 flex flex-col bg-[#09090B] overflow-hidden"
          data-elix-foryou-battle-root="1"
        >
          <div
            className="relative w-full overflow-hidden border-b border-white/10"
            data-elix-foryou-battle="video-half"
            style={{ flex: "1 1 50%", height: "50%", maxHeight: "50%", minHeight: 0 }}
          >
            <div className="absolute inset-0 flex flex-row w-full h-full">
              <div className="w-1/2 h-full relative bg-[#09090B] overflow-hidden min-h-0">
                <video
                  ref={hostVideoRef}
                  className={videoClass}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                  style={{ backgroundColor: "#09090B" }}
                />
                <span className="absolute bottom-1 left-1 z-10 text-white/80 text-[8px] font-bold bg-black/50 rounded px-1 truncate max-w-[90%]">
                  {creatorName}
                </span>
              </div>
              <div className="w-1/2 h-full relative bg-[#09090B] overflow-hidden min-h-0">
                <video
                  ref={opponentVideoRef}
                  className={videoClass}
                  autoPlay
                  playsInline
                  muted
                  controls={false}
                  poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                  style={{ backgroundColor: "#09090B" }}
                />
                {!battle?.opponentName ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none z-[1]">
                    <span className="text-white/30 text-lg font-light">+</span>
                    <span className="text-white/40 text-[10px] font-semibold">Waiting</span>
                  </div>
                ) : (
                  <span className="absolute bottom-1 right-1 z-10 text-white/80 text-[8px] font-bold bg-black/50 rounded px-1 truncate max-w-[90%]">
                    {battle.opponentName}
                  </span>
                )}
              </div>
            </div>
            {!hasStream && placeholder}
          </div>

          <div
            className="relative w-full flex flex-col bg-[#09090B] overflow-hidden"
            data-elix-foryou-battle="chat-half"
            style={{ flex: "1 1 50%", height: "50%", maxHeight: "50%", minHeight: 0 }}
          >
            {/* Messages intentionally empty/hidden until user joins /watch */}
            <div className="flex-1 min-h-0" style={{ visibility: "hidden" }} aria-hidden />
            <div className="flex-none px-3 pb-3 pt-1 pointer-events-none">
              <p className="text-white font-bold text-sm truncate mb-1.5">{creatorName}</p>
              <div className="flex items-center gap-2 mb-2">
                <Radio size={14} className="text-white/60" />
                <span className="text-white/70 text-xs font-semibold">Tap to join battle</span>
              </div>
              <div className="w-full rounded-full bg-white/5 border border-white/10 px-3 py-2 text-[11px] text-white/25">
                Say something…
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Co-host: host left + live tiles right (same idea as live stream) ── */}
      {mode === "cohost" && (
        <div className="absolute inset-0 flex flex-row">
          <div className="w-1/2 h-full relative bg-[#09090B] overflow-hidden">
            <video
              ref={hostVideoRef}
              className={videoClass}
              autoPlay
              playsInline
              muted
              controls={false}
              poster={LIVE_VIDEO_TRANSPARENT_POSTER}
              style={{ opacity: hasStream ? 1 : 0, backgroundColor: "#09090B" }}
            />
            {!hasStream && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#09090B] z-[1]">
                {displayAvatar ? (
                  <img src={displayAvatar} alt="" className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#6F3FF5]/20 flex items-center justify-center">
                    <span className="text-[#F5F5F7] font-bold text-2xl">
                      {(creatorName || "C").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <span className="text-white font-bold text-xs">{creatorName}</span>
              </div>
            )}
          </div>
          <div className="w-1/2 h-full grid grid-cols-2 grid-rows-4 gap-0.5 p-0.5 bg-black">
            {Array.from({ length: 8 }).map((_, i) => {
              const h = liveCohosts[i];
              if (!h) {
                return (
                  <div
                    key={`empty-${i}`}
                    className="relative min-h-0 overflow-hidden rounded-none border border-[#D8D9DD]/25 bg-[#09090B] flex flex-col items-center justify-center"
                  >
                    <span className="text-white/30 text-lg font-light">+</span>
                    <span className="text-white/30 text-[8px] font-semibold">Add</span>
                  </div>
                );
              }
              return (
                <div
                  key={h.userId}
                  className="relative min-h-0 overflow-hidden rounded-none border border-[#D8D9DD]/35 bg-[#09090B]"
                >
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 z-[1] bg-[#09090B]">
                    {h.avatar ? (
                      <img src={h.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#09090B] flex items-center justify-center border border-[#D8D9DD]/40">
                        <span className="text-[#F5F5F7]/70 text-xs font-bold">
                          {(h.name || "?").charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <video
                    ref={(el) => {
                      if (el) {
                        coHostVideoRefs.current.set(h.userId, el);
                        const room = roomRef.current;
                        if (room) {
                          for (const [, p] of room.remoteParticipants) {
                            if (!sameId(p.identity, h.userId)) continue;
                            for (const [, pub] of p.videoTrackPublications) {
                              if (pub.track && pub.isSubscribed) {
                                attachToEl(pub.track as RemoteTrack, el);
                              }
                            }
                          }
                        }
                      } else {
                        coHostVideoRefs.current.delete(h.userId);
                      }
                    }}
                    className={`absolute inset-0 w-full h-full object-cover z-[2] ${LIVE_WEBRTC_VIDEO_CLASS}`}
                    autoPlay
                    playsInline
                    muted
                    controls={false}
                    poster={LIVE_VIDEO_TRANSPARENT_POSTER}
                    style={{ backgroundColor: "#09090B" }}
                  />
                  <span className="absolute bottom-0.5 left-0.5 z-[3] text-white/80 text-[7px] font-bold bg-black/50 rounded px-0.5 truncate max-w-[95%]">
                    {h.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isOffline && (
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 pt-2 pointer-events-none"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 8px) + 8px)" }}
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#E53935]">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-white text-[10px] font-bold">LIVE</span>
            </div>
            {mode === "battle" && (
              <div className="px-2 py-1 rounded-md bg-black/50 text-[#FF6B6B] text-[10px] font-bold">
                BATTLE
              </div>
            )}
            {mode === "cohost" && (
              <div className="px-2 py-1 rounded-md bg-black/50 text-[#F5F5F7] text-[10px] font-bold">
                CO-HOST
              </div>
            )}
            <div className="px-2 py-1 rounded-md bg-black/50 text-white/90 text-[10px] font-semibold">
              {formattedViewers} watching
            </div>
          </div>
        </div>
      )}

      {!isOffline && mode !== "battle" && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 pb-safe bg-gradient-to-t from-black/80 to-transparent pt-12 pointer-events-none">
          <p className="text-white font-bold text-sm truncate mb-1">{creatorName}</p>
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-white/60" />
            <span className="text-white/70 text-xs font-semibold">
              {mode === "cohost" ? "Tap to join co-host live" : "Tap to join live"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function hasAnyVideo(room: Room): boolean {
  for (const [, p] of room.remoteParticipants) {
    for (const [, pub] of p.videoTrackPublications) {
      if (pub.track && pub.isSubscribed) return true;
    }
  }
  return false;
}
