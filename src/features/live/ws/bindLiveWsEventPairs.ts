/**
 * Shared websocket.on/off lifecycle for Live WS binder modules.
 */

import { websocket } from '../../../lib/websocket';

export type LiveWsEventPair = [string, (data: unknown) => void];

export function bindLiveWsEventPairs(pairs: LiveWsEventPair[]): () => void {
  for (const [type, fn] of pairs) {
    websocket.on(type, fn);
  }
  return () => {
    for (const [type, fn] of pairs) {
      websocket.off(type, fn);
    }
  };
}
