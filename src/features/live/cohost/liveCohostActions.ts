/**
 * Cohost WS *out* actions — single owner for production event names.
 * Payloads match what controllers previously sent via websocket.send (server contract).
 */

import { LIVE_WS_OUT, liveWsSend } from '../../../lib/live';

/** Opaque production payload — server validates fields. */
type CohostPayload = Record<string, unknown>;

export function cohostInviteSend(payload: CohostPayload): void {
  liveWsSend(LIVE_WS_OUT.cohost_invite_send, payload);
}

export function cohostInviteAccept(payload: CohostPayload): void {
  liveWsSend(LIVE_WS_OUT.cohost_invite_accept, payload);
}

export function cohostRequestSend(payload: CohostPayload): void {
  liveWsSend(LIVE_WS_OUT.cohost_request_send, payload);
}

export function cohostRequestAccept(payload: CohostPayload): void {
  liveWsSend(LIVE_WS_OUT.cohost_request_accept, payload);
}

export function cohostRequestDecline(payload: CohostPayload): void {
  liveWsSend(LIVE_WS_OUT.cohost_request_decline, payload);
}

export function cohostLayoutSync(payload: CohostPayload): void {
  liveWsSend(LIVE_WS_OUT.cohost_layout_sync, payload);
}
