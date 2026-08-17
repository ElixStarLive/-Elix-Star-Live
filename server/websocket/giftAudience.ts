/**
 * Battle gift AUDIENCE ownership.
 *
 * 4-creator Battle teammates share SCORE only. Gifts, gift animations, gift
 * chat, and spectator audiences stay independent per creator.
 *
 * Routing: gift → targetCreatorId → that creator + that creator's spectators.
 * Do not route by teamId. Do not broadcast gift_sent to the whole battle room.
 *
 * WHO a gift belongs to is decided by `giftRecipient.ts` (the validated
 * resolver). This module only answers which creator's audience a socket
 * belongs to, which is what makes that routing deliverable.
 */

import { type BattleSession, seatedUserIds } from "./battleModel";

function trimId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Who owns this socket's gift/chat audience in a battle room.
 * Seated creators always own themselves. Spectators keep the creator they
 * were watching (query / stamp), never the teammate or the host by default
 * unless that host is who they were watching.
 */
export function resolveJoinAudienceCreatorId(opts: {
  userId: string;
  queryAudienceCreatorId?: string | null;
  stampedAudienceCreatorId?: string | null;
  streamOwnerUserId?: string | null;
  battle?: BattleSession | null;
}): string {
  const userId = trimId(opts.userId);
  const seated = opts.battle ? seatedUserIds(opts.battle) : [];
  if (userId && seated.includes(userId)) return userId;

  const claimed = trimId(opts.queryAudienceCreatorId);
  // Creator joining the battle room owns themselves even if the seat write is still propagating.
  if (claimed && claimed === userId) return userId;
  if (claimed && (!seated.length || seated.includes(claimed))) return claimed;

  const stamped = trimId(opts.stampedAudienceCreatorId);
  if (stamped && (!seated.length || seated.includes(stamped))) return stamped;

  const owner = trimId(opts.streamOwnerUserId);
  if (owner) return owner;
  return userId;
}

export function clientReceivesCreatorGiftAudience(
  client: { userId?: string | null; audienceCreatorId?: string | null },
  targetCreatorId: string,
): boolean {
  const target = trimId(targetCreatorId);
  if (!target) return false;
  return trimId(client.userId) === target || trimId(client.audienceCreatorId) === target;
}
