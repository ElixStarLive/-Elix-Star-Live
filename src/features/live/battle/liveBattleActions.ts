/**
 * Host/spectator battle WS *out* actions — single owner for production event names.
 * Payloads match what controllers previously sent via websocket.send (server contract).
 */

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

