/**
 * Host co-host presentation broadcast (creator only).
 *
 * Seat membership is server-owned: it changes only through the per-user seat
 * intents (invite, request accept, cohost_seat_release, cohost_seats_clear).
 * This sync carries the host's presentation choices — layout preset and which
 * seat is featured on the big screen — so a host-side render can never replace
 * the seat table or revoke another participant's publish grant.
 */

import { cohostLayoutSync } from './liveCohostActions';

export function syncBroadcastCohostLayout(args: {
  isBroadcast: boolean;
  roomId: string | null | undefined;
  hostUserId: string | null | undefined;
  featuredUserId: string | null;
  layoutId: string;
}): void {
  if (!args.isBroadcast || !args.roomId || !args.hostUserId) return;
  cohostLayoutSync({
    roomId: args.roomId,
    hostUserId: args.hostUserId,
    featuredUserId: args.featuredUserId,
    layoutId: args.layoutId,
  });
}
