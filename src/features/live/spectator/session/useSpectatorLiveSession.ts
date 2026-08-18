/**
 * Spectator/cohost LiveKit subscribe/publish — clean owner.
 * Room WS stays with spectator bind path. Room() only via LiveRoomLifecycle.
 *
 * `publish` is the seat this client ALREADY holds when the connection opens, so
 * an already-seated co-host joins as a publisher in one connection. A seat
 * granted or released later is a server-side permission change on this same
 * LiveKit connection (`canPublish`) — never a reconnect, so co-hosting never
 * interrupts the stream for this viewer.
 *
 * The server owns publishing: if it refuses a publish token we stay in the room
 * as a spectator rather than losing the live.
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
  const [canPublish, setCanPublish] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Read at connect time only: a seat gained mid-session must not tear the room
  // down, so `publish` is deliberately not a reconnect trigger.
  const publishRef = useRef(opts.publish);
  publishRef.current = opts.publish;

  useEffect(() => {
    if (!opts.enabled || !opts.roomId) return;
    const lifecycle = lifecycleRef.current;
    let cancelled = false;
    (async () => {
      setJoinError(null);
      setCanPublish(false);

      let publishToken = false;
      let creds: { token: string; url: string } | null = null;

      if (publishRef.current) {
        const asPublisher = await apiLiveToken(opts.roomId, true);
        if (cancelled) return;
        if (asPublisher.creds) {
          creds = asPublisher.creds;
          publishToken = true;
        } else {
          // Server is the authority on who may publish. Surface why, then fall
          // through to a watch token so a stale seat never costs them the live.
          const err = asPublisher.error || '';
          if (err.includes('401')) showToast('Co-host authorization expired. Rejoin from invite.');
          else if (err.includes('403')) showToast('Host approval required before you can co-host');
        }
      }

      if (!creds) {
        const asViewer = await apiLiveToken(opts.roomId, false);
        if (cancelled) return;
        if (asViewer.error || !asViewer.creds) {
          const err = asViewer.error || 'Could not get watch token';
          setJoinError(err);
          if (err.includes('401')) showToast('Please log in to watch');
          else if (err.includes('503')) showToast('Live video is not configured on server');
          else showToast(err);
          return;
        }
        creds = asViewer.creds;
      }

      const url = creds.url.trim() || getLiveKitUrl();
      if (!url || !creds.token) {
        const err = 'Missing LiveKit URL. Set LIVEKIT_URL on server.';
        setJoinError(err);
        showToast(err);
        return;
      }
      const h = opts.liveKitHandlersRef.current;
      const { error, session } = await lifecycle.connectLiveKitOnly(
        { url, token: creds.token },
        {
          ...h,
          onConnected: () => {
            setConnected(true);
            opts.liveKitHandlersRef.current.onConnected?.();
          },
          onDisconnected: () => {
            setConnected(false);
            setCanPublish(false);
            roomRef.current = null;
            opts.liveKitHandlersRef.current.onDisconnected?.();
          },
          onLocalPublishPermissionChanged: (allowed) => {
            // LiveKit's stated permission is the server's current answer, so a
            // released seat stands this client down mid-session. The signed
            // token only speaks for the window before LiveKit states one —
            // OR-ing it in would have made publish authority permanent for
            // anyone who joined holding a seat.
            setCanPublish(allowed ?? publishToken);
            opts.liveKitHandlersRef.current.onLocalPublishPermissionChanged?.(allowed);
          },
        },
        {
          surface: 'spectator',
          roomId: opts.roomId,
          publish: publishToken,
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
      setCanPublish(session.publishPermission ?? publishToken);
    })();
    return () => {
      cancelled = true;
      roomRef.current = null;
      setConnected(false);
      setCanPublish(false);
      lifecycle.liveKit?.disconnect();
    };
  }, [opts.enabled, opts.roomId, opts.retryKey, opts.liveKitHandlersRef]);

  const disconnect = useCallback(async () => {
    lifecycleRef.current.liveKit?.disconnect();
    roomRef.current = null;
    setConnected(false);
    setCanPublish(false);
  }, []);

  const publishFromStream = useCallback(async (stream: MediaStream) => {
    await lifecycleRef.current.publishFromStream(stream);
  }, []);

  return {
    lifecycleRef,
    liveKitRoomRef: roomRef,
    connected,
    canPublish,
    joinError,
    disconnect,
    publishFromStream,
    setMicEnabled: async (on: boolean) => {
      await lifecycleRef.current.liveKit?.setMicEnabled(on);
    },
  };
}
