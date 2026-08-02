/**
 * Host LiveKit registration + connect + publish — clean owner.
 * Room WebSocket stays with the host room/chat bind path (one WS).
 * Room() only via LiveRoomLifecycle → liveKitSession.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from 'livekit-client';
import { ConnectionState } from 'livekit-client';
import { getLiveKitUrl } from '../../../../lib/api';
import {
  apiLiveStart,
  LiveRoomLifecycle,
  type LiveKitCreds,
} from '../../../../lib/live';
import type { LiveKitSessionHandlers } from '../../../../lib/liveKitSession';
import { showToast } from '../../../../lib/toast';

export function useHostLiveSession(opts: {
  enabled: boolean;
  roomId: string;
  displayName: string;
  getCameraStream: () => MediaStream | null;
  /** Re-run publish when this identity changes (e.g. new MediaStream). */
  cameraStream: MediaStream | null;
  /** Stable ref — updated by host controller each render with track-attach handlers. */
  liveKitHandlersRef: React.MutableRefObject<LiveKitSessionHandlers>;
}) {
  const lifecycleRef = useRef(new LiveRoomLifecycle());
  const registeredRef = useRef(false);
  const roomRef = useRef<Room | null>(null);

  const [creds, setCreds] = useState<LiveKitCreds | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!opts.enabled || !opts.roomId || registeredRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const started = await apiLiveStart({
          room: opts.roomId,
          displayName: opts.displayName,
        });
        if (cancelled) return;
        if (started.error || !started.creds) {
          showToast(started.error || 'Failed to start stream');
          return;
        }
        registeredRef.current = true;
        lifecycleRef.current.markHostRegistered();
        const url = started.creds.url.trim() || getLiveKitUrl();
        if (!started.creds.token || !url) {
          showToast('Live server missing token or LIVEKIT_URL. Check server .env and restart.');
          return;
        }
        setCreds({ token: started.creds.token, url });
      } catch {
        if (!cancelled) showToast('Failed to start live stream. Please try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opts.enabled, opts.roomId, opts.displayName]);

  const publishFromCamera = useCallback(async () => {
    const stream = opts.getCameraStream();
    if (!stream || !lifecycleRef.current.liveKit?.connected) return;
    try {
      await lifecycleRef.current.publishFromStream(stream);
    } catch (e) {
      console.warn('[LiveKit] publish failed:', e);
    }
  }, [opts.getCameraStream]);

  useEffect(() => {
    if (!opts.enabled || !creds) return;
    const lifecycle = lifecycleRef.current;
    let cancelled = false;
    (async () => {
      const h = opts.liveKitHandlersRef.current;
      const { error, session } = await lifecycle.connectLiveKitOnly(creds, {
        ...h,
        onConnected: () => {
          setConnected(true);
          opts.liveKitHandlersRef.current.onConnected?.();
        },
        onDisconnected: () => {
          setConnected(false);
          roomRef.current = null;
          opts.liveKitHandlersRef.current.onDisconnected?.();
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
      roomRef.current = session.raw;
      setConnected(true);
      await publishFromCamera();
    })();
    return () => {
      cancelled = true;
      roomRef.current = null;
      setConnected(false);
      lifecycle.liveKit?.disconnect();
    };
  }, [opts.enabled, creds, publishFromCamera]);

  // Republish when camera stream recreates
  useEffect(() => {
    if (!opts.enabled || !opts.cameraStream) return;
    let cancelled = false;
    let attempts = 0;
    const run = () => {
      if (cancelled || attempts > 12) return;
      attempts += 1;
      const room = roomRef.current;
      if (!room || room.state !== ConnectionState.Connected) {
        window.setTimeout(run, 500);
        return;
      }
      void publishFromCamera();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [opts.enabled, opts.cameraStream, publishFromCamera]);

  const endHostBroadcast = useCallback(async (roomId: string) => {
    const result = await lifecycleRef.current.endHostBroadcast(roomId);
    if (result.restEnded) registeredRef.current = false;
    if (!result.restEnded && result.error) showToast(result.error);
    setCreds(null);
    setConnected(false);
    roomRef.current = null;
    return result;
  }, []);

  return {
    lifecycleRef,
    registeredRef,
    liveKitRoomRef: roomRef,
    creds,
    connected,
    publishFromCamera,
    endHostBroadcast,
    setCamEnabled: async (on: boolean) => {
      await lifecycleRef.current.liveKit?.setCamEnabled(on);
    },
    setMicEnabled: async (on: boolean) => {
      await lifecycleRef.current.liveKit?.setMicEnabled(on);
    },
  };
}
