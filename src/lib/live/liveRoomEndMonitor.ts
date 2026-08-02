/**
 * Per-room feed monitor: watches `/live/{roomKey}` for `stream_ended` only.
 * Cannot share the room singleton (may already be on another live room).
 * Same server contract as the previous VideoFeed RoomMonitor.
 */

import { getWsUrl } from '../api';

export type LiveRoomEndMonitorHandlers = {
  onStreamEnded: (streamKey: string) => void;
};

/**
 * Maintain WebSocket listeners for a set of live room keys.
 * Returns `{ setActiveKeys, dispose }`.
 */
export function createLiveRoomEndMonitor(
  getToken: () => string,
  handlers: LiveRoomEndMonitorHandlers,
) {
  const sockets = new Map<string, WebSocket>();
  const activeKeys = new Set<string>();
  const reconnectAttempts = new Map<string, number>();
  const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const keepAlives = new Map<string, ReturnType<typeof setInterval>>();

  const clearTimer = (key: string) => {
    const t = reconnectTimers.get(key);
    if (t) {
      clearTimeout(t);
      reconnectTimers.delete(key);
    }
  };

  const closeSocket = (key: string) => {
    clearTimer(key);
    const ka = keepAlives.get(key);
    if (ka) {
      clearInterval(ka);
      keepAlives.delete(key);
    }
    const ws = sockets.get(key);
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      sockets.delete(key);
    }
  };

  const openSocket = (roomKey: string) => {
    const token = getToken();
    if (!token) return;
    try {
      const ws = new WebSocket(
        `${getWsUrl()}/live/${roomKey}?token=${encodeURIComponent(token)}`,
      );
      sockets.set(roomKey, ws);
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string) as {
            event?: string;
            data?: { stream_key?: string };
          };
          if (msg.event === 'stream_ended') {
            handlers.onStreamEnded(msg.data?.stream_key || roomKey);
          }
        } catch {
          /* malformed */
        }
      };
      const keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              event: 'ping',
              data: {},
              timestamp: new Date().toISOString(),
            }),
          );
        } else {
          clearInterval(keepAlive);
          keepAlives.delete(roomKey);
        }
      }, 25_000);
      keepAlives.set(roomKey, keepAlive);
      ws.onclose = () => {
        const ka = keepAlives.get(roomKey);
        if (ka) {
          clearInterval(ka);
          keepAlives.delete(roomKey);
        }
        if (sockets.get(roomKey) !== ws) return;
        sockets.delete(roomKey);
        if (!getToken() || !activeKeys.has(roomKey)) return;
        const n = (reconnectAttempts.get(roomKey) ?? 0) + 1;
        if (n > 12) return;
        reconnectAttempts.set(roomKey, n);
        const base = 1000 * Math.pow(2, n - 1);
        const delay = Math.min(30_000, base + Math.floor(Math.random() * 400));
        const timer = setTimeout(() => {
          reconnectTimers.delete(roomKey);
          if (getToken() && activeKeys.has(roomKey) && !sockets.has(roomKey)) {
            openSocket(roomKey);
          }
        }, delay);
        reconnectTimers.set(roomKey, timer);
      };
    } catch {
      /* open failed */
    }
  };

  return {
    setActiveKeys(keys: string[]) {
      const next = new Set(keys.filter(Boolean));
      for (const key of [...activeKeys]) {
        if (!next.has(key)) {
          activeKeys.delete(key);
          closeSocket(key);
          reconnectAttempts.delete(key);
        }
      }
      for (const key of next) {
        if (activeKeys.has(key)) continue;
        activeKeys.add(key);
        reconnectAttempts.set(key, 0);
        openSocket(key);
      }
    },
    dispose() {
      for (const key of [...activeKeys]) {
        closeSocket(key);
      }
      activeKeys.clear();
      reconnectAttempts.clear();
    },
  };
}
