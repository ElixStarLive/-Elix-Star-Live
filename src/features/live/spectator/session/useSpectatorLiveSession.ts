/**
 * Spectator/cohost LiveKit subscribe/publish — clean owner.
 * Room WS stays with spectator bind path. Room() only via LiveRoomLifecycle.
 *
 * Publish upgrades (spectator → cohost) require a new LiveKit JWT. That is a
 * single intentional reconnect of THIS client only — never a second Room owner,
 * never used to paper over unrelated disconnects.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from 'livekit-client';
import { getLiveKitUrl } from '../../../../lib/api';
import { apiLiveToken, LiveRoomLifecycle } from '../../../../lib/live';
import type { LiveKitSessionHandlers } from '../../../../lib/liveKitSession';
import { showToast } from '../../../../lib/toast';

export function useSpectatorLiveSession(opts: {
  enabled: boolean;
  roomId: string;
  publish: boolean;
  /** Bump to force reconnect (retry). */
  retryKey?: number;
  liveKitHandlersRef: React.MutableRefObject<LiveKitSessionHandlers>;
}) {
  const lifecycleRef = useRef(new LiveRoomLifecycle());
  const roomRef = useRef<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!opts.enabled || !opts.roomId) return;
    const lifecycle = lifecycleRef.current;
    let cancelled = false;
    (async () => {
      setJoinError(null);
      // Prefer authorized publish token; if cohost grant is missing, stay in the
      // live as subscribe-only instead of leaving the room disconnected.
      let tok = await apiLiveToken(opts.roomId, opts.publish);
      if (cancelled) return;
      if (opts.publish && (tok.error || !tok.creds)) {
        tok = await apiLiveToken(opts.roomId, false);
        if (cancelled) return;
      }
      if (tok.error || !tok.creds) {
        const err = tok.error || 'Could not get watch token';
        setJoinError(err);
        if (err.includes('401')) showToast('Please log in to watch');
        else if (err.includes('503')) showToast('Live video is not configured on server');
        else showToast(err);
        return;
      }
      const url = tok.creds.url.trim() || getLiveKitUrl();
      if (!url || !tok.creds.token) {
        const err = 'Missing LiveKit URL. Set LIVEKIT_URL on server.';
        setJoinError(err);
        showToast(err);
        return;
      }
      const h = opts.liveKitHandlersRef.current;
      const { error, session } = await lifecycle.connectLiveKitOnly(
        { url, token: tok.creds.token },
        {
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
        },
      );
      if (cancelled) {
        lifecycle.liveKit?.disconnect();
        return;
      }
      if (error || !session) {
        const err = error || 'Could not connect to stream. Is the host live?';
        setJoinError(err);
        showToast(err);
        return;
      }
      roomRef.current = session.raw;
      setConnected(true);
    })();
    return () => {
      cancelled = true;
      roomRef.current = null;
      setConnected(false);
      lifecycle.liveKit?.disconnect();
    };
  }, [opts.enabled, opts.roomId, opts.publish, opts.retryKey, opts.liveKitHandlersRef]);

  const disconnect = useCallback(async () => {
    lifecycleRef.current.liveKit?.disconnect();
    roomRef.current = null;
    setConnected(false);
  }, []);

  const publishFromStream = useCallback(async (stream: MediaStream) => {
    await lifecycleRef.current.publishFromStream(stream);
  }, []);

  return {
    lifecycleRef,
    liveKitRoomRef: roomRef,
    connected,
    joinError,
    disconnect,
    publishFromStream,
    setMicEnabled: async (on: boolean) => {
      await lifecycleRef.current.liveKit?.setMicEnabled(on);
    },
  };
}
