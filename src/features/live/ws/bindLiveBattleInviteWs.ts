/**
 * Bind site for battle invite signalling (in) — host/spectator controllers pass handlers.
 */

import { bindLiveWsEventPairs, type LiveWsEventPair } from './bindLiveWsEventPairs';

type LiveBattleInviteWsHandlers = {
  onInvite?: (data: unknown) => void;
  onInviteAck?: (data: unknown) => void;
  onInviteDeclined?: (data: unknown) => void;
  onInviteAccepted?: (data: unknown) => void;
  onInviteRoster?: (data: unknown) => void;
  onInviteRosterInvalidate?: (data: unknown) => void;
  onInviteExpired?: (data: unknown) => void;
  onParticipantRemoved?: (data: unknown) => void;
};

export function bindLiveBattleInviteWs(handlers: LiveBattleInviteWsHandlers): () => void {
  const pairs: LiveWsEventPair[] = [];
  if (handlers.onInvite) pairs.push(['battle_invite', handlers.onInvite]);
  if (handlers.onInviteAck) pairs.push(['battle_invite_ack', handlers.onInviteAck]);
  if (handlers.onInviteDeclined) pairs.push(['battle_invite_declined', handlers.onInviteDeclined]);
  if (handlers.onInviteAccepted) pairs.push(['battle_invite_accepted', handlers.onInviteAccepted]);
  if (handlers.onInviteRoster) pairs.push(['battle_invite_roster', handlers.onInviteRoster]);
  if (handlers.onInviteRosterInvalidate) {
    pairs.push(['battle_invite_roster_invalidate', handlers.onInviteRosterInvalidate]);
  }
  if (handlers.onInviteExpired) pairs.push(['battle_invite_expired', handlers.onInviteExpired]);
  if (handlers.onParticipantRemoved) {
    pairs.push(['battle_participant_removed', handlers.onParticipantRemoved]);
  }

  return bindLiveWsEventPairs(pairs);
}
