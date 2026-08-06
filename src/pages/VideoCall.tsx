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
import { LiveKitSession, LiveKitTrack } from '../lib/liveKitSession';
import { showToast } from '../lib/toast';
import { apiLiveTokenWithIdentity } from '../lib/live';

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
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const sessionRef = useRef<LiveKitSession | null>(null);

  const stopLocalMedia = useCallback(() => {
    setLocalStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  const goBackAfterCall = useCallback(() => navigate(-1), [navigate]);

  useEffect(() => {
    if (!callId || !remoteUser) return;

    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode } },
          audio: true,
        });
        // Unmounted while acquiring — stop tracks so the camera/mic indicator
        // does not stay on after leaving the call setup.
        if (!cancelled) setLocalStream(stream);
        else stream.getTracks().forEach((t) => t.stop());
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          if (!cancelled) setLocalStream(stream);
          else stream.getTracks().forEach((t) => t.stop());
        } catch {
          if (!cancelled) {
            showToast('Camera or microphone unavailable');
          }
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
    if (sessionRef.current) return;

    let cancelled = false;
    const roomName = getCallRoomName(callId);

    const session = new LiveKitSession({
      onConnected: () => {
        if (!cancelled) useCallStore.getState().setStatus('connected');
      },
      onDisconnected: () => {
        if (!cancelled) setRemoteHasVideo(false);
      },
      onTrackSubscribed: ({ track }) => {
        if (cancelled) return;
        if (track.kind === LiveKitTrack.Kind.Video && remoteVideoRef.current) {
          track.attach(remoteVideoRef.current);
          void remoteVideoRef.current.play().catch(() => {});
          setRemoteHasVideo(true);
        } else if (track.kind === LiveKitTrack.Kind.Audio) {
          track.attach();
        }
      },
      onTrackUnsubscribed: ({ track }) => {
        if (track.kind === LiveKitTrack.Kind.Video) {
          setRemoteHasVideo(false);
          track.detach();
        }
      },
    });
    sessionRef.current = session;

    (async () => {
      try {
        // Contract guard: call token fetch keeps publish=1 for caller media publish.
        const { creds, error } = await apiLiveTokenWithIdentity(roomName, true, 'call');
        if (cancelled) return;
        if (error || !creds?.token) {
          showToast(error || 'Could not join call');
          useCallStore.getState().endCall('Could not join call');
          return;
        }
        const livekitUrl = creds.url || import.meta.env.VITE_LIVEKIT_URL;
        if (!livekitUrl) {
          showToast('Call media is not configured');
          useCallStore.getState().endCall('Call media is not configured');
          return;
        }

        await session.connect(livekitUrl, creds.token);
        if (cancelled) return;
        await session.publishFromStream(localStream);
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Call connection failed';
          showToast(msg);
          useCallStore.getState().endCall(msg);
        }
      }
    })();

    return () => {
      cancelled = true;
      session.disconnect();
      sessionRef.current = null;
      setRemoteHasVideo(false);
    };
  }, [callId, status, localStream]);

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
        goBackAfterCall();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, goBackAfterCall, stopLocalMedia]);

  const switchCamera = useCallback(async () => {
    if (!localStream) return;
    const next = facingMode === 'user' ? 'environment' : 'user';
    localStream.getTracks().forEach((t) => t.stop());
    // Session already connected — republish fresh tracks so the remote peer
    // does not keep seeing the stopped camera track.
    const republish = async (stream: MediaStream) => {
      setFacingMode(next);
      setLocalStream(stream);
      const session = sessionRef.current;
      if (!session) return;
      try {
        await session.publishFromStream(stream);
      } catch {
        showToast('Could not switch camera for the other person');
      }
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: next } },
        audio: true,
      });
      await republish(stream);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        await republish(stream);
      } catch {
        showToast('Could not switch camera');
      }
    }
  }, [localStream, facingMode]);

  if (!callId || !remoteUser) {
    return (
      <div className="min-h-[100dvh] h-[100dvh] w-full bg-transparent flex justify-center text-white overflow-hidden">
        <div className="w-full max-w-[480px] mx-auto flex items-center justify-center px-4">
          <p>No active call</p>
        </div>
      </div>
    );
  }

  const handleHangup = async () => {
    sessionRef.current?.disconnect();
    sessionRef.current = null;
    stopLocalMedia();
    setRemoteHasVideo(false);
    useCallStore.getState().setStatus('ended');
    try {
      if (callId) {
        await sendCallEnded(callId);
      } else {
        useCallStore.getState().reset();
      }
    } catch { /* best-effort cleanup */ }
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
    <div className="fixed inset-0 z-50 flex flex-col bg-transparent pb-[var(--bottom-ui-reserve)]">
      {/* Same width column as BottomNav (max-w-[480px] centered) — full-bleed bg on sides */}
      <div className="flex flex-1 min-h-0 flex-col w-full max-w-[480px] mx-auto">
      {/* Remote video (full screen) */}
      <div className="flex-1 min-h-0 relative w-full">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover ${remoteHasVideo && status === 'connected' ? '' : 'hidden'}`}
        />
        {!(remoteHasVideo && status === 'connected') && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-4">
            {remoteUser.avatar ? (
              <AvatarRing src={remoteUser.avatar} alt={remoteUser.username} size={96} />
            ) : (
              <div className="w-24 h-24 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center text-3xl text-white">
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
          <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-transparent/50 px-4 py-1 rounded-full">
            <p className="text-white text-sm font-mono">{statusLabel}</p>
          </div>
        )}

        {/* Local video PiP */}
        {localStream && (
          <div className="absolute top-20 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/20 bg-transparent shadow-lg">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
            />
            {isVideoOff && (
              <div className="w-full h-full flex items-center justify-center bg-transparent">
                <VideoOff className="w-6 h-6 text-white/50" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="w-full bg-transparent/80 backdrop-blur-sm pb-10 pt-6 px-6 shrink-0">
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={toggleAudio}
            className={`w-14 h-14 rounded-full flex items-center justify-center ${
              isAudioMuted ? 'bg-white/20/80' : 'bg-white/20'
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
              isVideoOff ? 'bg-white/20/80' : 'bg-white/20'
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
            className="w-14 h-14 rounded-full bg-transparent border border-[#D8D9DD]/40 flex items-center justify-center"
          >
            <SwitchCamera className="w-6 h-6 text-white" />
          </button>

          <button
            type="button"
            onClick={handleHangup}
            title="End call"
            className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center shadow-lg"
          >
            <PhoneOff className="w-7 h-7 text-white" />
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
