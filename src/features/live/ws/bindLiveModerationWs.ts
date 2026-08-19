/**
 * Bind site for live moderation WS events (host).
 */

import { bindLiveWsEventPairs, type LiveWsEventPair } from './bindLiveWsEventPairs';

type LiveModerationWsHandlers = {
  onWarning?: (data: unknown) => void;
};

export function bindLiveModerationWs(handlers: LiveModerationWsHandlers): () => void {
  const pairs: LiveWsEventPair[] = [];
  if (handlers.onWarning) pairs.push(['moderation_warning', handlers.onWarning]);

  return bindLiveWsEventPairs(pairs);
}
