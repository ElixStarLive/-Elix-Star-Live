/**
 * Lobby / For You feed presence over `/live/__feed__`.
 *
 * One transport owner: the shared `websocket` singleton (same as App presence).
 * Pages register stream_started / stream_ended handlers only — they must not open
 * a second raw WebSocket to `__feed__`.
 */

import { websocket } from '../websocket';

export type FeedPresenceHandlers = {
  onStreamStarted?: (data: Record<string, unknown>) => void;
  onStreamEnded?: (data: Record<string, unknown>) => void;
};

function isLiveRoomId(roomId: string | null): boolean {
  if (!roomId) return false;
  if (roomId === '__feed__') return false;
  return true;
}

/**
 * Subscribe to feed discovery events on the existing `__feed__` singleton.
 * Returns a disposer that removes listeners only (does not tear down App presence).
 */
export function connectLiveFeedPresence(
  token: string,
  handlers: FeedPresenceHandlers,
): () => void {
  if (!token) return () => {};

  // While in a live room the singleton must stay on that room; App reconnects __feed__ after exit.
  // Also: For You InlineLiveViewer joins the stream room — do not steal it back to __feed__.
  if (!isLiveRoomId(websocket.getCurrentRoomId())) {
    websocket.connect('__feed__', token, { persistent: true });
  }

  const onStarted = (data: unknown) => {
    handlers.onStreamStarted?.((data || {}) as Record<string, unknown>);
  };
  const onEnded = (data: unknown) => {
    handlers.onStreamEnded?.((data || {}) as Record<string, unknown>);
  };

  websocket.on('stream_started', onStarted);
  websocket.on('stream_ended', onEnded);

  return () => {
    websocket.off('stream_started', onStarted);
    websocket.off('stream_ended', onEnded);
  };
}
