/**
 * Battle gift audience ownership.
 *
 * 4-creator Battle teammates share SCORE only. Gifts, gift animations, gift
 * chat, and spectator audiences stay independent per creator.
 *
 * Routing: gift → targetCreatorId → that creator + that creator's spectators.
 * Do not route by teamId. Do not broadcast gift_sent to the whole battle room.
 */

export type BattleGiftSeat = "host" | "opponent" | "player3" | "player4";

export type BattleSeatIds = {
  hostUserId?: string | null;
  opponentUserId?: string | null;
  player3UserId?: string | null;
  player4UserId?: string | null;
  status?: string | null;
};

function trimId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function battleSeatUserId(
  battle: BattleSeatIds | null | undefined,
  target: BattleGiftSeat | null,
): string | null {
  if (!battle || !target) return null;
  const id =
    target === "host"
      ? trimId(battle.hostUserId)
      : target === "opponent"
        ? trimId(battle.opponentUserId)
        : target === "player3"
          ? trimId(battle.player3UserId)
          : trimId(battle.player4UserId);
  return id || null;
}

export function seatedBattleCreatorIds(
  battle: BattleSeatIds | null | undefined,
): string[] {
  if (!battle) return [];
  return [
    trimId(battle.hostUserId),
    trimId(battle.opponentUserId),
    trimId(battle.player3UserId),
    trimId(battle.player4UserId),
  ].filter((id) => id.length > 0);
}

export function isSeatedBattleCreator(
  battle: BattleSeatIds | null | undefined,
  userId: string,
): boolean {
  const id = trimId(userId);
  if (!id) return false;
  return seatedBattleCreatorIds(battle).includes(id);
}

export function isActiveBattleSession(
  battle: BattleSeatIds | null | undefined,
): boolean {
  if (!battle) return false;
  return battle.status !== "ENDED";
}

/**
 * Authoritative gift recipient. One gift → one creator.
 * Cohost tile target wins when present; otherwise the battle seat; otherwise
 * the stream owner (solo live).
 */
export function resolveGiftTargetCreatorId(opts: {
  battle?: BattleSeatIds | null;
  battleTarget?: BattleGiftSeat | null;
  cohostTargetUserId?: string | null;
  streamOwnerUserId?: string | null;
}): string | null {
  const cohost = trimId(opts.cohostTargetUserId);
  if (cohost) return cohost;

  if (isActiveBattleSession(opts.battle)) {
    const target = opts.battleTarget ?? "host";
    const seated = battleSeatUserId(opts.battle, target);
    if (seated) return seated;
    // Empty seat: do not reassign the gift to a teammate or the host.
    if (target !== "host") return null;
    const host = trimId(opts.battle?.hostUserId);
    if (host) return host;
  }

  const owner = trimId(opts.streamOwnerUserId);
  return owner || null;
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
  battle?: BattleSeatIds | null;
}): string {
  const userId = trimId(opts.userId);
  const seated = seatedBattleCreatorIds(opts.battle);
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
