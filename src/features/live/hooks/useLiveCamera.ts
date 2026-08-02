/**
 * Host / battle-joiner camera ownership — getUserMedia, flip, mute, preview bind.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearCachedCameraStream,
  getCachedCameraStream,
  setCachedCameraStream,
} from '../../../lib/cameraStream';
import { prepareLiveVideoEl } from '../../../lib/prepareLiveVideoEl';

export type LiveCameraApi = ReturnType<typeof useLiveCamera>;

export function useLiveCamera(opts: {
  enabled: boolean;
  facing?: 'user' | 'environment';
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const recoverInFlightRef = useRef(false);
  const recoverAtRef = useRef(0);

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>(
    opts.facing ?? 'user',
  );
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const bindHostCameraPreview = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el) return;
    let stream = cameraStreamRef.current;
    if (!stream) {
      const cached = getCachedCameraStream();
      if (cached?.getVideoTracks()?.some((t) => t.readyState === 'live')) {
        cameraStreamRef.current = cached;
        stream = cached;
      }
    }
    if (stream && el.srcObject !== stream) {
      el.srcObject = stream;
    }
    prepareLiveVideoEl(el);
  }, []);

  const stopCamera = useCallback(() => {
    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
    }
    cameraStreamRef.current = null;
    setCameraStream(null);
    clearCachedCameraStream();
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const acquireCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const prev = cameraStreamRef.current;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: cameraFacing },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (prev && prev !== stream) {
        prev.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        });
      }
      cameraStreamRef.current = stream;
      setCachedCameraStream(stream);
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        prepareLiveVideoEl(videoRef.current);
      }
      const mic = stream.getAudioTracks()[0];
      if (mic) mic.enabled = !isMicMuted;
      const cam = stream.getVideoTracks()[0];
      if (cam) cam.enabled = !isCamOff;
      return stream;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Camera access denied';
      setCameraError(msg);
      return null;
    }
  }, [cameraFacing, isMicMuted, isCamOff]);

  useEffect(() => {
    if (!opts.enabled) return;
    let cancelled = false;
    (async () => {
      const cached = getCachedCameraStream();
      if (cached?.getVideoTracks()?.some((t) => t.readyState === 'live')) {
        cameraStreamRef.current = cached;
        setCameraStream(cached);
        if (videoRef.current) {
          videoRef.current.srcObject = cached;
          prepareLiveVideoEl(videoRef.current);
        }
        return;
      }
      if (!cancelled) await acquireCamera();
    })();
    return () => {
      cancelled = true;
    };
    // Re-run when facing flips; acquireCamera closes previous tracks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, cameraFacing]);

  useEffect(() => {
    if (!opts.enabled) return;
    return () => {
      stopCamera();
    };
  }, [opts.enabled, stopCamera]);

  useEffect(() => {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !isMicMuted;
    });
  }, [isMicMuted]);

  const toggleMic = useCallback(() => {
    setIsMicMuted((m) => {
      const next = !m;
      cameraStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      return next;
    });
  }, []);

  const toggleCam = useCallback(() => {
    setIsCamOff((off) => {
      const next = !off;
      cameraStreamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = !next;
      });
      return next;
    });
  }, []);

  const flipCamera = useCallback(() => {
    setCameraFacing((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  const restoreHostCameraPreview = useCallback(() => {
    const el = videoRef.current;
    const stream = cameraStreamRef.current || getCachedCameraStream();
    if (!el || !stream) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    prepareLiveVideoEl(el);
  }, []);

  return {
    videoRef,
    cameraStreamRef,
    cameraStream,
    cameraFacing,
    isMicMuted,
    isCamOff,
    cameraError,
    bindHostCameraPreview,
    restoreHostCameraPreview,
    acquireCamera,
    stopCamera,
    toggleMic,
    toggleCam,
    flipCamera,
    setIsMicMuted,
    setIsCamOff,
    recoverInFlightRef,
    recoverAtRef,
  };
}
