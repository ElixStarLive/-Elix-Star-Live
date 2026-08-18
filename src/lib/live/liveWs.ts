/**
 * Live WebSocket event names that match production server contracts.
 * Dead / invented client-only names are intentionally omitted.
 */

import { websocket } from '../websocket';

/** Server → client events used by Live UI (see LIVE_CONNECTION_MAP). */
export const LIVE_WS_IN = {
  connected: 'connected',
  room_state: 'room_state',
  user_joined: 'user_joined',
  user_left: 'user_left',
  stream_ended: 'stream_ended',
  chat_message: 'chat_message',
  heart_sent: 'heart_sent',
  gift_sent: 'gift_sent',
  gift_goal_sync: 'gift_goal_sync',
  booster_caught: 'booster_caught',
  battle_state_sync: 'battle_state_sync',
  battle_tick: 'battle_tick',
  battle_score: 'battle_score',
  battle_ended: 'battle_ended',
  battle_error: 'battle_error',
  battle_invite: 'battle_invite',
  battle_invite_sent: 'battle_invite_sent',
  battle_invite_declined: 'battle_invite_declined',
  battle_invite_roster: 'battle_invite_roster',
  battle_invite_roster_invalidate: 'battle_invite_roster_invalidate',
  battle_invite_expired: 'battle_invite_expired',
  battle_participant_removed: 'battle_participant_removed',
  battle_accept_ack: 'battle_accept_ack',
  /** Server emits viewer_count (not viewer_count_update). */
  viewer_count: 'viewer_count',
  cohost_invite: 'cohost_invite',
  /** Server emits `cohost_invite_ack` to the inviting host. */
  cohost_invite_ack: 'cohost_invite_ack',
  /** Server emits `cohost_invite_accepted` (see websocket handlers). */
  cohost_invite_accepted: 'cohost_invite_accepted',
  cohost_request: 'cohost_request',
  cohost_layout_sync: 'cohost_layout_sync',
  /** Server tells one participant their seat was freed (per-user, never room-wide). */
  cohost_seat_released: 'cohost_seat_released',
  booster_activated: 'booster_activated',
  mist_activated: 'mist_activated',
  engagement_sync: 'engagement_sync',
  ws_reconnect_exhausted: 'ws_reconnect_exhausted',
  ws_error: 'ws_error',
} as const;

/** Client → server Live actions. Paid gifts must NOT use gift_sent — use giftSend REST. */
export const LIVE_WS_OUT = {
  ping: 'ping',
  stream_start: 'stream_start',
  stream_end: 'stream_end',
  chat_message: 'chat_message',
  heart_sent: 'heart_sent',
  gift_sent: 'gift_sent',
  gift_goal_set: 'gift_goal_set',
  gift_goal_clear: 'gift_goal_clear',
  battle_create: 'battle_create',
  battle_join: 'battle_join',
  battle_end: 'battle_end',
  battle_get_state: 'battle_get_state',
  battle_spectator_vote: 'battle_spectator_vote',
  battle_invite_send: 'battle_invite_send',
  battle_invite_accept: 'battle_invite_accept',
  battle_invite_decline: 'battle_invite_decline',
  battle_invite_roster_get: 'battle_invite_roster_get',
  battle_remove_participant: 'battle_remove_participant',
  cohost_invite_send: 'cohost_invite_send',
  cohost_invite_accept: 'cohost_invite_accept',
  /** Invitee says no: the server gives that seat back to the stage. */
  cohost_invite_decline: 'cohost_invite_decline',
  cohost_request_send: 'cohost_request_send',
  cohost_request_accept: 'cohost_request_accept',
  cohost_request_decline: 'cohost_request_decline',
  /** Presentation only (layout preset + featured tile) — never seat membership. */
  cohost_layout_sync: 'cohost_layout_sync',
  /** Host frees one seat. Server revokes publish for that user alone. */
  cohost_seat_release: 'cohost_seat_release',
  /** Seated co-host leaves their own seat and remains a spectator. */
  cohost_seat_leave: 'cohost_seat_leave',
  /** Host ends co-host mode: server releases every seat individually. */
  cohost_seats_clear: 'cohost_seats_clear',
  booster_activated: 'booster_activated',
  mist_activated: 'mist_activated',
} as const;

export function liveWsSend(
  type: (typeof LIVE_WS_OUT)[keyof typeof LIVE_WS_OUT],
  payload?: Record<string, unknown>,
): void {
  websocket.send(type, payload ?? {});
}
