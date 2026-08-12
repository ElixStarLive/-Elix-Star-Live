/**
 * Host / battle-joiner camera ownership — getUserMedia, flip, mute, preview bind.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearCachedCameraStream,
  getCachedCameraStream,
  setCachedCameraStream,
} from '../../../lib/cameraStream';
import {
  buildCameraGetUserMediaVideoConstraints,
  enforceLiveCaptureOnStream,
} from '../../../lib/live/liveMediaProfile';
import { prepareLiveVideoEl } from '../../../lib/prepareLiveVideoEl';

export type LiveCameraApi = ReturnType<typeof useLiveCamera>;

export function useLiveCamera(opts: {
  enabled: boolean;
  facing?: 'user' | 'environment';
  /**
   * When false, do not auto getUserMedia on enable (caller acquires after auth).
   * Default true — host broadcast path.
   */
  autoAcquire?: boolean;
}) {
  const autoAcquire = opts.autoAcquire !== false;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const recoverInFlightRef = useRef(false);
  const recoverAtRef = useRef(0);
  const isMicMutedRef = useRef(false);
  const isCamOffRef = useRef(false);

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>(
    opts.facing ?? 'user',
  );
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  isMicMutedRef.current = isMicMuted;
  isCamOffRef.current = isCamOff;

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

  const acquireCamera = useCallback(async (): Promise<MediaStream | null> => {
    try {
      setCameraError(null);

      // Create→Live handoff only for front camera. Never reuse cache on flip
      // (cache would still hold the previous facing's live tracks).
      if (cameraFacing !== 'user') {
        clearCachedCameraStream();
      } else {
        const cached = getCachedCameraStream();
        if (cached) {
          const cachedVideo = cached.getVideoTracks()[0];
          if (cachedVideo?.readyState === 'live') {
            cameraStreamRef.current = cached;
            setCameraStream(cached);
            cached.getAudioTracks().forEach((t) => {
              t.enabled = !isMicMutedRef.current;
            });
            cached.getVideoTracks().forEach((t) => {
              t.enabled = !isCamOffRef.current;
            });
            // Create hands off unconstrained capture (often 1080p/60). Live owns
            // 720p/30 — apply before preview/publish so Normal Live does not encode max.
            await enforceLiveCaptureOnStream(cached, cameraFacing);
            if (videoRef.current) {
              videoRef.current.srcObject = cached;
              prepareLiveVideoEl(videoRef.current);
            }
            return cached;
          }
          clearCachedCameraStream();
        }
      }

      let stream: MediaStream | null = null;
      const videoConstraints = buildCameraGetUserMediaVideoConstraints(cameraFacing);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch {
          setCameraError('Camera access denied');
          return null;
        }
      }

      const previous = cameraStreamRef.current;
      cameraStreamRef.current = stream;
      setCachedCameraStream(stream);
      setCameraStream(stream);
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !isMicMutedRef.current;
      });
      stream.getVideoTracks().forEach((t) => {
        t.enabled = !isCamOffRef.current;
      });

      // Browser may ignore getUserMedia ideals — enforce Live 720p/30 on the live track.
      await enforceLiveCaptureOnStream(stream, cameraFacing);

      // Widest view when the device exposes zoom.
      try {
        const vTrack = stream.getVideoTracks()[0];
        const caps = vTrack?.getCapabilities?.() as
          | Record<string, { min?: number; max?: number }>
          | undefined;
        if (caps?.zoom && typeof caps.zoom.min === 'number') {
          await vTrack.applyConstraints({
            advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet],
          });
        }
      } catch {
        /* zoom not supported */
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        prepareLiveVideoEl(videoRef.current);
      }

      // Warm-swap: attach new stream first, then stop the previous facing.
      if (previous && previous !== stream) {
        previous.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        });
      }
      return stream;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Camera access denied';
      setCameraError(msg);
      return null;
    }
  }, [cameraFacing]);

  useEffect(() => {
    if (!opts.enabled || !autoAcquire) return;
    let cancelled = false;
    (async () => {
      if (!cancelled) await acquireCamera();
    })();
    // Facing flip must NOT stop tracks in cleanup — that races the new getUserMedia
    // and blacks the preview. Only cancel in-flight acquire; acquireCamera stops the
    // old stream after the new one is attached.
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, autoAcquire, cameraFacing]);

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
    const stream =
      cameraStreamRef.current ||
      (() => {
        const cached = getCachedCameraStream();
        if (cached?.getVideoTracks()?.some((t) => t.readyState === 'live')) {
          cameraStreamRef.current = cached;
          return cached;
        }
        return null;
      })();
    if (!el || !stream) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    prepareLiveVideoEl(el);
    el.style.transform = 'scaleX(-1)';
    void el.play().catch(() => {});
  }, []);

  return {
    videoRef,
    cameraStreamRef,
    cameraStream,
    setCameraStream,
    cameraFacing,
    setCameraFacing,
    isMicMuted,
    isCamOff,
    cameraError,
    setCameraError,
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
