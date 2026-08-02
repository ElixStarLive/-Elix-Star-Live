/**
 * Host LiveKit session — start registration, connect, publish, end broadcast.
 * Only path for host Room lifecycle (via LiveRoomLifecycle → liveKitSession).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLiveKitUrl } from '../../../lib/api';
import {
  apiLiveStart,
  LiveRoomLifecycle,
  type LiveKitCreds,
} from '../../../lib/live';
import type { LiveKitSessionHandlers } from '../../../lib/liveKitSession';
import { showToast } from '../../../lib/toast';
import type { LiveCameraApi } from './useLiveCamera';

export function useHostLiveKit(opts: {
  enabled: boolean;
  roomId: string;
  displayName: string;
  camera: LiveCameraApi;
  handlers?: LiveKitSessionHandlers;
}) {
  const lifecycleRef = useRef(new LiveRoomLifecycle());
  const registeredRef = useRef(false);
  const [creds, setCreds] = useState<LiveKitCreds | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef(opts.handlers);
  handlersRef.current = opts.handlers;

  // Register stream + obtain token
  useEffect(() => {
    if (!opts.enabled || !opts.roomId || registeredRef.current) return;
    let cancelled = false;
    (async () => {
      const started = await apiLiveStart({
        room: opts.roomId,
        displayName: opts.displayName,
      });
      if (cancelled) return;
      if (!started.error && started.creds) {
        registeredRef.current = true;
        lifecycleRef.current.markHostRegistered();
        const url = started.creds.url.trim() || getLiveKitUrl();
        if (started.creds.token && url) {
          setCreds({ token: started.creds.token, url });
        } else {
          showToast('Live server missing token or LIVEKIT_URL. Check server .env and restart.');
        }
      } else {
        showToast(started.error || 'Failed to start stream');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opts.enabled, opts.roomId, opts.displayName]);

  // Connect + publish
  useEffect(() => {
    if (!opts.enabled || !creds) return;
    const lifecycle = lifecycleRef.current;
    let cancelled = false;
    (async () => {
      const { error, session } = await lifecycle.connectLiveKitOnly(creds, {
        ...handlersRef.current,
        onConnected: () => {
          setConnected(true);
          handlersRef.current?.onConnected?.();
        },
        onDisconnected: () => {
          setConnected(false);
          handlersRef.current?.onDisconnected?.();
        },
      });
      if (cancelled) {
        lifecycle.liveKit?.disconnect();
        return;
      }
      if (error || !session) {
        showToast(error || 'Live video could not start');
        return;
      }
      const stream = opts.camera.cameraStreamRef.current;
      if (stream) {
        try {
          await lifecycle.publishFromStream(stream);
        } catch (e) {
          console.warn('[LiveKit] publish failed:', e);
        }
      }
    })();
    return () => {
      cancelled = true;
      setConnected(false);
      lifecycle.liveKit?.disconnect();
    };
  }, [opts.enabled, creds, opts.camera.cameraStreamRef]);

  // Republish when camera stream recreates
  useEffect(() => {
    if (!opts.enabled || !opts.camera.cameraStream) return;
    let cancelled = false;
    let attempts = 0;
    const run = () => {
      if (cancelled || attempts > 12) return;
      attempts += 1;
      const lk = lifecycleRef.current.liveKit;
      if (!lk?.connected) {
        window.setTimeout(run, 500);
        return;
      }
      const stream = opts.camera.cameraStreamRef.current;
      if (stream) {
        void lifecycleRef.current.publishFromStream(stream).catch((e) => {
          console.warn('[LiveKit] republish failed:', e);
        });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [opts.enabled, opts.camera.cameraStream, opts.camera.cameraStreamRef]);

  const publishFromCamera = useCallback(async () => {
    const stream = opts.camera.cameraStreamRef.current;
    if (!stream || !lifecycleRef.current.liveKit?.connected) return;
    await lifecycleRef.current.publishFromStream(stream);
  }, [opts.camera.cameraStreamRef]);

  const endHostBroadcast = useCallback(async (roomId: string) => {
    const result = await lifecycleRef.current.endHostBroadcast(roomId);
    if (result.restEnded) registeredRef.current = false;
    setCreds(null);
    setConnected(false);
    return result;
  }, []);

  const setCamEnabled = useCallback(async (enabled: boolean) => {
    await lifecycleRef.current.liveKit?.setCamEnabled(enabled);
  }, []);

  const setMicEnabled = useCallback(async (enabled: boolean) => {
    await lifecycleRef.current.liveKit?.setMicEnabled(enabled);
  }, []);

  const setRemoteAudioVolume = useCallback((identity: string, volume: number) => {
    lifecycleRef.current.liveKit?.setRemoteAudioVolume(identity, volume);
  }, []);

  return {
    lifecycleRef,
    registeredRef,
    creds,
    connected,
    rawRoom: () => lifecycleRef.current.rawRoom,
    liveKit: () => lifecycleRef.current.liveKit,
    publishFromCamera,
    endHostBroadcast,
    setCamEnabled,
    setMicEnabled,
    setRemoteAudioVolume,
  };
}
