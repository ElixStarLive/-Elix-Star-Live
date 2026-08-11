/**
 * Battle invite accept handshake — wait for server battle_accept_ack before navigate.
 * Grant signal for the next screen is React Router location.state.battleHost (set by caller).
 * Server LiveKit token authorization is the reload-safe source of truth — not sessionStorage.
 */

import { websocket } from '../../../lib/websocket';
import { battleInviteAccept, battleInviteDecline } from './liveBattleActions';

export type PendingBattleInvite = {
  hostName: string;
  hostAvatar: string;
  streamKey: string;
  hostUserId: string;
};

export function waitBattleAcceptAck(timeoutMs = 8000): {
  promise: Promise<boolean>;
  cancel: (ok?: boolean) => void;
} {
  let settled = false;
  let timer: number | null = null;
  let onAck: (() => void) | null = null;
  let onErr: (() => void) | null = null;
  let settleFn: (ok: boolean) => void = () => {};

  const promise = new Promise<boolean>((resolve) => {
    settleFn = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (onAck) websocket.off('battle_accept_ack', onAck);
      if (onErr) websocket.off('battle_error', onErr);
      if (timer != null) window.clearTimeout(timer);
      resolve(ok);
    };
    onAck = () => settleFn(true);
    onErr = () => settleFn(false);
    websocket.on('battle_accept_ack', onAck);
    websocket.on('battle_error', onErr);
    timer = window.setTimeout(() => settleFn(false), timeoutMs);
  });

  return {
    promise,
    cancel: (ok = false) => settleFn(ok),
  };
}

/** Send accept + wait for grant. Caller navigates on true with battleHost state. */
export async function runBattleInviteAccept(args: {
  invite: PendingBattleInvite;
  requesterName: string;
  requesterAvatar: string;
  streamKey: string;
}): Promise<boolean> {
  const { promise, cancel } = waitBattleAcceptAck();
  try {
    battleInviteAccept({
      hostUserId: args.invite.hostUserId,
      requesterName: args.requesterName,
      requesterAvatar: args.requesterAvatar,
      streamKey: args.streamKey,
      hostStreamKey: args.invite.streamKey,
    });
  } catch {
    cancel(false);
    return false;
  }
  return promise;
}

export function runBattleInviteDecline(invite: PendingBattleInvite): void {
  battleInviteDecline({
    hostStreamKey: invite.streamKey,
    hostUserId: invite.hostUserId,
  });
}
