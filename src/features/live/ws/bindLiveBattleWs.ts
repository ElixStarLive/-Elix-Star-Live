/**
 * Single bind site for Live battle / booster / mist room WS events.
 * Controllers pass handlers; this owns on/off lifecycle against production names.
 */

import { LIVE_WS_IN } from '../../../lib/live';
import { bindLiveWsEventPairs, type LiveWsEventPair } from './bindLiveWsEventPairs';

export type LiveBattleWsHandlers = {
  onStateSync?: (data: unknown) => void;
  onTick?: (data: { timeLeft?: number }) => void;
  onScore?: (data: unknown) => void;
  onEnded?: (data: unknown) => void;
  onBoosterActivated?: (data: unknown) => void;
  onBoosterCaught?: (data: unknown) => void;
  onMistActivated?: (data: unknown) => void;
};

export function bindLiveBattleWs(handlers: LiveBattleWsHandlers): () => void {
  const pairs: LiveWsEventPair[] = [];

  if (handlers.onStateSync) {
    pairs.push([LIVE_WS_IN.battle_state_sync, handlers.onStateSync]);
  }
  if (handlers.onTick) {
    pairs.push([
      LIVE_WS_IN.battle_tick,
      handlers.onTick as (data: unknown) => void,
    ]);
  }
  if (handlers.onScore) {
    pairs.push([LIVE_WS_IN.battle_score, handlers.onScore]);
  }
  if (handlers.onEnded) {
    pairs.push([LIVE_WS_IN.battle_ended, handlers.onEnded]);
  }
  if (handlers.onBoosterActivated) {
    pairs.push([LIVE_WS_IN.booster_activated, handlers.onBoosterActivated]);
  }
  if (handlers.onBoosterCaught) {
    pairs.push([LIVE_WS_IN.booster_caught, handlers.onBoosterCaught]);
  }
  if (handlers.onMistActivated) {
    pairs.push([LIVE_WS_IN.mist_activated, handlers.onMistActivated]);
  }

  return bindLiveWsEventPairs(pairs);
}
