/**
 * Live gift WS *out* — test-coin gift_sent + gift goals only.
 * Paid gifts use sendLivePaidGift → giftSend REST (never gift_sent).
 */

import { LIVE_WS_OUT, liveWsSend } from '../../../lib/live';

type LivePayload = Record<string, unknown>;

/** Test-coin / local simulation broadcast only. */
export function liveGiftSentWs(payload: LivePayload): void {
  liveWsSend(LIVE_WS_OUT.gift_sent, payload);
}

export function liveGiftGoalSet(payload: LivePayload): void {
  liveWsSend(LIVE_WS_OUT.gift_goal_set, payload);
}

export function liveGiftGoalClear(payload?: LivePayload): void {
  liveWsSend(LIVE_WS_OUT.gift_goal_clear, payload ?? {});
}
