/**
 * Bind site for battle invite signalling (in) — host/spectator controllers pass handlers.
 */

import { websocket } from '../../../lib/websocket';

export type LiveBattleInviteWsHandlers = {
  onInvite?: (data: unknown) => void;
  onInviteAck?: (data: unknown) => void;
  onInviteDeclined?: (data: unknown) => void;
  onInviteAccepted?: (data: unknown) => void;
};

export function bindLiveBattleInviteWs(handlers: LiveBattleInviteWsHandlers): () => void {
  const pairs: Array<[string, (data: unknown) => void]> = [];
  if (handlers.onInvite) pairs.push(['battle_invite', handlers.onInvite]);
  if (handlers.onInviteAck) pairs.push(['battle_invite_ack', handlers.onInviteAck]);
  if (handlers.onInviteDeclined) pairs.push(['battle_invite_declined', handlers.onInviteDeclined]);
  if (handlers.onInviteAccepted) pairs.push(['battle_invite_accepted', handlers.onInviteAccepted]);

  for (const [type, fn] of pairs) {
    websocket.on(type, fn);
  }
  return () => {
    for (const [type, fn] of pairs) {
      websocket.off(type, fn);
    }
  };
}
