/**
 * Host co-host layout broadcast to room (creator only).
 */

import { cohostLayoutSync } from './liveCohostActions';

export type BroadcastCohostLayoutRow = {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  status: string;
};

export function syncBroadcastCohostLayout(args: {
  isBroadcast: boolean;
  roomId: string | null | undefined;
  hostUserId: string | null | undefined;
  coHosts: BroadcastCohostLayoutRow[];
  featuredUserId: string | null;
  layoutId: string;
}): void {
  if (!args.isBroadcast || !args.roomId || !args.hostUserId) return;
  cohostLayoutSync({
    roomId: args.roomId,
    coHosts: args.coHosts,
    hostUserId: args.hostUserId,
    featuredUserId: args.featuredUserId,
    layoutId: args.layoutId,
  });
}

export function mapCoHostsForLayoutSync(
  coHosts: Array<{ id: string; userId: string; name: string; avatar: string; status: string }>,
): BroadcastCohostLayoutRow[] {
  return coHosts.map((h) => ({
    id: h.id,
    userId: h.userId,
    name: h.name,
    avatar: h.avatar,
    status: h.status,
  }));
}
