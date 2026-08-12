/**
 * Bind site for live moderation WS events (host).
 */

import { bindLiveWsEventPairs, type LiveWsEventPair } from './bindLiveWsEventPairs';

export type LiveModerationWsHandlers = {
  onWarning?: (data: unknown) => void;
  onPause?: (data: unknown) => void;
  onSuspend?: (data: unknown) => void;
};

export function bindLiveModerationWs(handlers: LiveModerationWsHandlers): () => void {
  const pairs: LiveWsEventPair[] = [];
  if (handlers.onWarning) pairs.push(['moderation_warning', handlers.onWarning]);
  if (handlers.onPause) pairs.push(['moderation_pause', handlers.onPause]);
  if (handlers.onSuspend) pairs.push(['moderation_suspend', handlers.onSuspend]);

  return bindLiveWsEventPairs(pairs);
}
