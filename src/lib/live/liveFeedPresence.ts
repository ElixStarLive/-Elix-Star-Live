/**
 * Lobby / For You feed presence over `/live/__feed__`.
 * Separate from the room singleton (cannot share one socket with an active live room).
 * Same server contract as before — ownership moved out of page components.
 */

import { getWsUrl } from '../api';

export type FeedPresenceHandlers = {
  onStreamStarted?: (data: Record<string, unknown>) => void;
  onStreamEnded?: (data: Record<string, unknown>) => void;
};

/**
 * Connect to the feed discovery socket. Returns a disposer.
 */
export function connectLiveFeedPresence(
  token: string,
  handlers: FeedPresenceHandlers,
): () => void {
  if (!token) return () => {};

  const url = `${getWsUrl()}/live/__feed__?token=${encodeURIComponent(token)}`;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let cancelled = false;

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const connect = () => {
    if (cancelled) return;
    try {
      ws = new WebSocket(url);
    } catch {
      reconnectAttempt += 1;
      const base = 1000 * Math.pow(2, Math.min(reconnectAttempt - 1, 8));
      const delay = Math.min(30_000, base + Math.floor(Math.random() * 400));
      reconnectTimer = setTimeout(connect, delay);
      return;
    }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as {
          event?: string;
          data?: Record<string, unknown>;
        };
        const event = msg?.event;
        const data = msg?.data || {};
        if (event === 'stream_started') handlers.onStreamStarted?.(data);
        if (event === 'stream_ended') handlers.onStreamEnded?.(data);
      } catch {
        /* malformed frame */
      }
    };

    ws.onopen = () => {
      reconnectAttempt = 0;
    };

    ws.onclose = () => {
      if (cancelled) return;
      reconnectAttempt += 1;
      const base = 1000 * Math.pow(2, Math.min(reconnectAttempt - 1, 8));
      const delay = Math.min(30_000, base + Math.floor(Math.random() * 400));
      clearReconnect();
      reconnectTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return () => {
    cancelled = true;
    clearReconnect();
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      ws = null;
    }
  };
}
