/**
 * Host/spectator battle WS *out* actions — single owner for production event names.
 * Payloads match what controllers previously sent via websocket.send (server contract).
 */

import { websocket } from '../../../lib/websocket';
import { LIVE_WS_OUT, liveWsSend } from '../../../lib/live';

/** Opaque production payload — server validates fields. */
type BattlePayload = Record<string, unknown>;

export function battleInviteSend(payload: BattlePayload): void {
  liveWsSend(LIVE_WS_OUT.battle_invite_send, payload);
}

export function battleInviteAccept(payload: BattlePayload): void {
  liveWsSend(LIVE_WS_OUT.battle_invite_accept, payload);
}

export function battleInviteDecline(payload: BattlePayload): void {
  liveWsSend(LIVE_WS_OUT.battle_invite_decline, payload);
}

export function battleCreate(payload: BattlePayload): void {
  liveWsSend(LIVE_WS_OUT.battle_create, payload);
}

export function battleJoin(payload?: BattlePayload): void {
  liveWsSend(LIVE_WS_OUT.battle_join, payload ?? {});
}

export function battleEnd(payload?: BattlePayload): void {
  liveWsSend(LIVE_WS_OUT.battle_end, payload ?? {});
}

export function battleRemoveParticipant(payload: { targetUserId: string }): void {
  liveWsSend(LIVE_WS_OUT.battle_remove_participant, payload);
}

export function battleInviteRosterGet(payload?: BattlePayload): void {
  liveWsSend(LIVE_WS_OUT.battle_invite_roster_get, payload ?? {});
}

export function battleGetState(): void {
  liveWsSend(LIVE_WS_OUT.battle_get_state, {});
}

export function battleSpectatorVote(payload: {
  target: 'host' | 'opponent' | 'player3' | 'player4';
}): void {
  liveWsSend(LIVE_WS_OUT.battle_spectator_vote, payload);
}

/** Invite signalling still uses typed websocket for ack listeners in controllers. */
export function battleInviteOn(
  event:
    | 'battle_invite'
    | 'battle_invite_ack'
    | 'battle_invite_declined'
    | 'battle_invite_accepted'
    | 'battle_invite_roster'
    | 'battle_invite_roster_invalidate'
    | 'battle_invite_expired'
    | 'battle_participant_removed'
    | 'battle_accept_ack'
    | 'battle_error',
  handler: (data: unknown) => void,
): () => void {
  websocket.on(event, handler);
  return () => websocket.off(event, handler);
}

