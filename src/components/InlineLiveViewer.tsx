import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Room, RoomEvent, RemoteTrackPublication } from "livekit-client";
import { apiUrl, getLiveKitUrl } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";
import { INLINE_LIVE_PLACEHOLDER_AVATAR_PX } from "../lib/profileFrame";
import { Radio } from "lucide-react";

interface InlineLiveViewerProps {
  streamKey: string;
  isActive: boolean;
  creatorName?: string;
  creatorAvatar?: string;
  viewerCount?: number;
  className?: string;
}

export default function InlineLiveViewer({
  streamKey,
  isActive,
  creatorName = "Creator",
  creatorAvatar,
  viewerCount = 0,
  className = "",
}: InlineLiveViewerProps) {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const connectedKeyRef = useRef<string>("");
  const [hasStream, setHasStream] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    if (!isActive || !streamKey) {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
        connectedKeyRef.current = "";
      }
      setHasStream(false);
      setConnecting(false);
      return;
    }
    const connKey = `${streamKey}-${isActive}`;
    if (connectedKeyRef.current === connKey && roomRef.current) return;
    connectedKeyRef.current = connKey;

    let mounted = true;
    let gotVideo = false;
    const room = new Room({ adaptiveStream: true });
    roomRef.current = room;

    const cleanup = () => {
      room.disconnect();
      if (roomRef.current === room) roomRef.current = null;
    };

    const timeoutId = setTimeout(() => {
      if (!mounted || gotVideo) return;
      cleanup();
      if (mounted) {
        setConnecting(false);
        setIsOffline(true);
      }
    }, 8000);

    (async () => {
      if (mounted) {
        setConnecting(true);
        setIsOffline(false);
        setHasStream(false);
      }
      try {
        const token = useAuthStore.getState().session?.access_token;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const res = await fetch(
          apiUrl(`/api/live/token?room=${encodeURIComponent(streamKey)}`),
          { method: "GET", credentials: "include", headers }
        );
        if (!res.ok || !mounted) {
          if (mounted) { setIsOffline(true); setConnecting(false); }
          cleanup();
          return;
        }

        const data = await res.json().catch(() => ({}));
        let url = (data?.url ?? "").trim();
        if (!url) url = getLiveKitUrl();
        const lkToken = data?.token;
        if (!url || !lkToken || !mounted) {
          if (mounted) { setIsOffline(true); setConnecting(false); }
          cleanup();
          return;
        }

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (!mounted || track.kind !== "video") return;
          const el = videoRef.current;
          if (el) {
            track.attach(el);
            gotVideo = true;
            setHasStream(true);
          }
        });
        room.on(RoomEvent.TrackUnpublished, (pub: RemoteTrackPublication) => {
          if (!mounted || pub.kind !== "video") return;
          setHasStream(false);
          setIsOffline(true);
          cleanup();
        });
        room.on(RoomEvent.ParticipantDisconnected, () => {
          if (!mounted) return;
          setHasStream(false);
          setIsOffline(true);
          cleanup();
        });
        room.on(RoomEvent.Disconnected, () => {
          if (!mounted) return;
          setIsOffline(true);
          setHasStream(false);
          setConnecting(false);
        });

        await room.connect(url, lkToken);
        if (!mounted) { cleanup(); return; }

        for (const [, participant] of room.remoteParticipants) {
          for (const [, publication] of participant.videoTrackPublications) {
            if (publication.track && publication.isSubscribed && videoRef.current) {
              publication.track.attach(videoRef.current);
              gotVideo = true;
              setHasStream(true);
              break;
            }
          }
          if (gotVideo) break;
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
      roomRef.current = null;
      room.disconnect();
      setHasStream(false);
      setConnecting(false);
    };
  }, [isActive, streamKey]);

  const formattedViewers =
    viewerCount >= 1_000_000
      ? (viewerCount / 1_000_000).toFixed(1) + "M"
      : viewerCount >= 1_000
        ? (viewerCount / 1_000).toFixed(1) + "K"
        : String(viewerCount);

  return (
    <div
      className={`relative w-full h-full bg-[#13151A] cursor-pointer ${className}`}
      style={{ background: "#13151A" }}
      onClick={() => navigate(`/watch/${streamKey}`)}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        autoPlay
        playsInline
        muted
        style={{
          opacity: hasStream ? 1 : 0,
          transition: "opacity 0.35s ease",
        }}
      />

      {!hasStream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#13151A] gap-4 pointer-events-none">
          {creatorAvatar ? (
            <div
              className="rounded-full overflow-hidden border-2 border-[#C9A96E]/50 shrink-0"
              style={{ width: INLINE_LIVE_PLACEHOLDER_AVATAR_PX, height: INLINE_LIVE_PLACEHOLDER_AVATAR_PX }}
            >
              <img
                src={creatorAvatar}
                alt=""
                className="w-full h-full object-cover object-center"
              />
            </div>
          ) : (
            <div
              className="rounded-full bg-[#C9A96E]/20 flex items-center justify-center shrink-0"
              style={{ width: INLINE_LIVE_PLACEHOLDER_AVATAR_PX, height: INLINE_LIVE_PLACEHOLDER_AVATAR_PX }}
            >
              <span className="text-3xl font-bold text-[#C9A96E]/80">
                {(creatorName || "C").charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <p className="text-white font-semibold text-base truncate max-w-[80%]">{creatorName}</p>
          {connecting && !isOffline ? (
            <>
              <div className="w-8 h-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
              <span className="text-white/60 text-sm">Connecting to live...</span>
            </>
          ) : isOffline ? (
            <span className="text-white/50 text-sm">Stream ended</span>
          ) : null}
        </div>
      )}

      {/* Top: LIVE badge + viewer count — hidden when stream ended */}
      {!isOffline && (
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 pt-2 pointer-events-none"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 8px) + 8px)" }}
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/90">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-white text-[10px] font-bold">LIVE</span>
            </div>
            <div className="px-2 py-1 rounded-md bg-black/50 text-white/90 text-[10px] font-semibold">
              {formattedViewers} watching
            </div>
          </div>
        </div>
      )}

      {/* Bottom: creator name + tap hint — hidden when stream ended */}
      {!isOffline && (
        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 pb-safe bg-gradient-to-t from-black/80 to-transparent pt-12 pointer-events-none">
          <p className="text-white font-bold text-sm truncate mb-1">{creatorName}</p>
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-red-400" />
            <span className="text-white/70 text-xs font-semibold">Tap to join live</span>
          </div>
        </div>
      )}
    </div>
  );
}
