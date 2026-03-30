import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AvatarRing } from '../components/AvatarRing';
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  SwitchCamera,
} from 'lucide-react';
import { useCallStore } from '../store/useCallStore';
import { endCall as sendCallEnded, getCallRoomName } from '../lib/callService';
import { request } from '../lib/apiClient';
import { Room, RoomEvent, Track, RemoteTrackPublication, RemoteParticipant } from 'livekit-client';

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function VideoCall() {
  const navigate = useNavigate();
  const {
    callId,
    status,
    remoteUser,
    isAudioMuted,
    isVideoOff,
    callStartTime,
    endReason,
    toggleAudio,
    toggleVideo,
  } = useCallStore();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const roomRef = useRef<Room | null>(null);

  const stopLocalMedia = useCallback(() => {
    setLocalStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!callId || !remoteUser) return;

    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
          audio: true,
        });
        if (!cancelled) setLocalStream(stream);
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          if (!cancelled) setLocalStream(stream);
        } catch {
          /* camera blocked — still show call UI */
        }
      }
    })();

    return () => {
      cancelled = true;
      stopLocalMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial capture only; switchCamera replaces stream
  }, [callId, remoteUser?.id, stopLocalMedia]);

  useEffect(() => {
    const el = localVideoRef.current;
    if (!el || !localStream) return;
    el.srcObject = localStream;
    return () => {
      el.srcObject = null;
    };
  }, [localStream]);

  useEffect(() => {
    if (!localStream) return;
    localStream.getAudioTracks().forEach((t) => {
      t.enabled = !isAudioMuted;
    });
  }, [isAudioMuted, localStream]);

  useEffect(() => {
    if (!localStream) return;
    localStream.getVideoTracks().forEach((t) => {
      t.enabled = !isVideoOff;
    });
  }, [isVideoOff, localStream]);

  useEffect(() => {
    if (!callId || status !== 'connecting') return;
    if (!localStream) return;
    if (roomRef.current) return;

    let cancelled = false;
    const roomName = getCallRoomName(callId);

    (async () => {
      try {
        const { data, error } = await request(`/api/live/token?room=${encodeURIComponent(roomName)}&identity=call`);
        if (cancelled) return;
        if (error || !data?.token) {
          useCallStore.getState().setStatus('ended');
          return;
        }
        const livekitUrl = data.url || import.meta.env.VITE_LIVEKIT_URL;
        if (!livekitUrl) {
          useCallStore.getState().setStatus('ended');
          return;
        }

        const room = new Room();
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track: any, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
          if (cancelled) return;
          if (track.kind === Track.Kind.Video) {
            const mediaStream = new MediaStream([track.mediaStreamTrack]);
            setRemoteStream(mediaStream);
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
          if (track.kind === Track.Kind.Video) {
            setRemoteStream(null);
          }
        });

        room.on(RoomEvent.Connected, () => {
          if (!cancelled) {
            useCallStore.getState().setStatus('connected');
          }
        });

        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) {
            setRemoteStream(null);
          }
        });

        await room.connect(livekitUrl, data.token);

        const videoTrack = localStream.getVideoTracks()[0];
        const audioTrack = localStream.getAudioTracks()[0];
        if (videoTrack) {
          await room.localParticipant.publishTrack(videoTrack);
        }
        if (audioTrack) {
          await room.localParticipant.publishTrack(audioTrack);
        }
      } catch {
        if (!cancelled) {
          useCallStore.getState().setStatus('ended');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (roomRef.current) {
        roomRef.current.disconnect().catch(() => {});
        roomRef.current = null;
      }
      setRemoteStream(null);
    };
  }, [callId, status, localStream]);

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || !remoteStream) return;
    el.srcObject = remoteStream;
    return () => { el.srcObject = null; };
  }, [remoteStream]);

  useEffect(() => {
    if (status !== 'connected' || !callStartTime) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - callStartTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [status, callStartTime]);

  useEffect(() => {
    if (status === 'ended') {
      const timer = setTimeout(() => {
        stopLocalMedia();
        useCallStore.getState().reset();
        navigate(-1);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, navigate, stopLocalMedia]);

  const switchCamera = useCallback(async () => {
    if (!localStream) return;
    const next = facingMode === 'user' ? 'environment' : 'user';
    localStream.getTracks().forEach((t) => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: next } },
        audio: true,
      });
      setFacingMode(next);
      setLocalStream(stream);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setFacingMode(next);
        setLocalStream(stream);
      } catch {
        /* ignore */
      }
    }
  }, [localStream, facingMode]);

  if (!callId || !remoteUser) {
    return (
      <div className="min-h-[100dvh] h-[100dvh] w-full bg-[#13151A] flex justify-center text-white overflow-hidden">
        <div className="w-full max-w-[480px] mx-auto flex items-center justify-center px-4">
          <p>No active call</p>
        </div>
      </div>
    );
  }

  const handleHangup = async () => {
    if (roomRef.current) {
      roomRef.current.disconnect().catch(() => {});
      roomRef.current = null;
    }
    stopLocalMedia();
    setRemoteStream(null);
    if (callId) {
      await sendCallEnded(callId);
    } else {
      useCallStore.getState().reset();
    }
    navigate(-1);
  };

  const statusLabel =
    status === 'outgoing'
      ? 'Calling...'
      : status === 'incoming'
        ? 'Incoming call...'
        : status === 'connecting'
          ? 'Connecting...'
          : status === 'reconnecting'
            ? 'Reconnecting...'
            : status === 'ended'
              ? endReason || 'Call ended'
              : formatDuration(elapsed);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#13151A] pb-[var(--feed-main-pb)]">
      {/* Same width column as BottomNav (max-w-[480px] centered) — full-bleed bg on sides */}
      <div className="flex flex-1 min-h-0 flex-col w-full max-w-[480px] mx-auto">
      {/* Remote video (full screen) */}
      <div className="flex-1 min-h-0 relative w-full">
        {remoteStream && status === 'connected' ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4">
            {remoteUser.avatar ? (
              <AvatarRing src={remoteUser.avatar} alt={remoteUser.username} size={96} />
            ) : (
              <div className="w-24 h-24 rounded-full bg-[#13151A] border border-[#C9A96E]/40 flex items-center justify-center text-3xl text-white">
                {remoteUser.username[0]?.toUpperCase()}
              </div>
            )}
            <p className="text-white text-lg font-semibold">
              {remoteUser.username}
            </p>
            <p className="text-white/60 text-sm">{statusLabel}</p>
          </div>
        )}

        {/* Timer / Status */}
        {status === 'connected' && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-[#13151A]/50 px-4 py-1 rounded-full">
            <p className="text-white text-sm font-mono">{statusLabel}</p>
          </div>
        )}

        {/* Local video PiP */}
        {localStream && (
          <div className="absolute top-20 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/20 bg-[#13151A] shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
            />
            {isVideoOff && (
              <div className="w-full h-full flex items-center justify-center bg-[#1C1E24]">
                <VideoOff className="w-6 h-6 text-white/50" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="w-full bg-[#13151A]/80 backdrop-blur-sm pb-10 pt-6 px-6 shrink-0">
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={toggleAudio}
            className={`w-14 h-14 rounded-full flex items-center justify-center ${
              isAudioMuted ? 'bg-red-500/80' : 'bg-white/20'
            }`}
          >
            {isAudioMuted ? (
              <MicOff className="w-6 h-6 text-white" />
            ) : (
              <Mic className="w-6 h-6 text-white" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-full flex items-center justify-center ${
              isVideoOff ? 'bg-red-500/80' : 'bg-white/20'
            }`}
          >
            {isVideoOff ? (
              <VideoOff className="w-6 h-6 text-white" />
            ) : (
              <Video className="w-6 h-6 text-white" />
            )}
          </button>

          <button
            type="button"
            onClick={switchCamera}
            title="Switch camera"
            className="w-14 h-14 rounded-full bg-[#13151A] border border-[#C9A96E]/40 flex items-center justify-center"
          >
            <SwitchCamera className="w-6 h-6 text-white" />
          </button>

          <button
            type="button"
            onClick={handleHangup}
            title="End call"
            className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg"
          >
            <PhoneOff className="w-7 h-7 text-white" />
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
