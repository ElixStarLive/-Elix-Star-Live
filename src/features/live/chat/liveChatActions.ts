/**
 * Live chat + heart WS *out* — single owner.
 */

import { LIVE_WS_OUT, liveWsSend } from '../../../lib/live';

type LivePayload = Record<string, unknown>;

export function liveChatSend(payload: LivePayload): void {
  liveWsSend(LIVE_WS_OUT.chat_message, payload);
}

export function liveHeartSend(payload: LivePayload): void {
  liveWsSend(LIVE_WS_OUT.heart_sent, payload);
}
