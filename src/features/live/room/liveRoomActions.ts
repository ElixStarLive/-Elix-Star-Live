/**
 * Live room signalling WS *out* — stream start/end, battle boosters.
 */

import { LIVE_WS_OUT, liveWsSend } from '../../../lib/live';

type LivePayload = Record<string, unknown>;

export function liveStreamStart(payload: LivePayload): void {
  liveWsSend(LIVE_WS_OUT.stream_start, payload);
}

export function liveBoosterActivated(payload: LivePayload): void {
  liveWsSend(LIVE_WS_OUT.booster_activated, payload);
}

export function liveMistActivated(payload: LivePayload): void {
  liveWsSend(LIVE_WS_OUT.mist_activated, payload);
}
