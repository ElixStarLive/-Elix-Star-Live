/**
 * Bind site for live moderation WS events (host).
 */

import { websocket } from '../../../lib/websocket';

export type LiveModerationWsHandlers = {
  onWarning?: (data: unknown) => void;
  onPause?: (data: unknown) => void;
  onSuspend?: (data: unknown) => void;
};

export function bindLiveModerationWs(handlers: LiveModerationWsHandlers): () => void {
  const pairs: Array<[string, (data: unknown) => void]> = [];
  if (handlers.onWarning) pairs.push(['moderation_warning', handlers.onWarning]);
  if (handlers.onPause) pairs.push(['moderation_pause', handlers.onPause]);
  if (handlers.onSuspend) pairs.push(['moderation_suspend', handlers.onSuspend]);

  for (const [type, fn] of pairs) {
    websocket.on(type, fn);
  }
  return () => {
    for (const [type, fn] of pairs) {
      websocket.off(type, fn);
    }
  };
}
