/**
 * Battle invite accept handshake — wait for server battle_accept_ack before navigate.
 */

import { websocket } from '../../../lib/websocket';
import { battleInviteAccept, battleInviteDecline } from './liveBattleActions';

export type PendingBattleInvite = {
  hostName: string;
  hostAvatar: string;
  streamKey: string;
  hostUserId: string;
};

export function waitBattleAcceptAck(timeoutMs = 8000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      websocket.off('battle_accept_ack', onAck);
      websocket.off('battle_error', onErr);
      resolve(ok);
    };
    const onAck = () => settle(true);
    const onErr = () => settle(false);
    websocket.on('battle_accept_ack', onAck);
    websocket.on('battle_error', onErr);
    window.setTimeout(() => settle(false), timeoutMs);
  });
}

/** Send accept + wait for grant. Caller navigates on true. */
export async function runBattleInviteAccept(args: {
  invite: PendingBattleInvite;
  requesterName: string;
  requesterAvatar: string;
  streamKey: string;
}): Promise<boolean> {
  const ackPromise = waitBattleAcceptAck();
  try {
    battleInviteAccept({
      hostUserId: args.invite.hostUserId,
      requesterName: args.requesterName,
      requesterAvatar: args.requesterAvatar,
      streamKey: args.streamKey,
      hostStreamKey: args.invite.streamKey,
    });
  } catch {
    /* fire-and-forget send */
  }
  const granted = await ackPromise;
  if (granted) {
    try {
      sessionStorage.setItem(`battleAccept:${args.invite.streamKey}`, '1');
    } catch {
      /* ignore */
    }
  }
  return granted;
}

export function runBattleInviteDecline(invite: PendingBattleInvite): void {
  battleInviteDecline({
    hostStreamKey: invite.streamKey,
    hostUserId: invite.hostUserId,
  });
}
