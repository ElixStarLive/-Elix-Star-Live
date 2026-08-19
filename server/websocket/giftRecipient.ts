/**
 * THE validated gift recipient resolver.
 *
 * One gift → one creator. REST (`/api/gifts/send`) and WebSocket (test-coin
 * gifts, in-room delivery) both resolve the recipient here, so money, battle
 * score, animation routing and creator progress can never disagree about who
 * was supported.
 *
 * Authority rules (in order):
 *   1. Battle is ACTIVE → the requested battle SEAT decides, and the seat must
 *      hold a real creator in that battle. A co-host target is ignored while a
 *      battle owns the room: battle and co-host are separate systems and the
 *      battle seat is the authority for a battle gift.
 *   2. No active battle → an explicit co-host tile target, validated against
 *      the co-host publish grant or the host's synced layout.
 *   3. Otherwise the stream owner (solo live).
 *
 * A requested target that does not validate is an ERROR. It is never silently
 * reassigned to the host, a teammate, or the room owner.
 */

import { getCohostLayout, hasCohostPublishGrant } from "./index";
import { getBattleSessionState } from "./battle";
import {
  type BattleSeat,
  type BattleTeamId,
  isBattleSeat,
  participantAtSeat,
  teamOfSeat,
} from "./battleModel";

export type GiftRecipient = {
  creatorId: string;
  /** Set only when the gift was resolved through an active battle seat. */
  battleSeat: BattleSeat | null;
  teamId: BattleTeamId | null;
  origin: "battle_seat" | "cohost" | "stream_owner";
};

type GiftRecipientError =
  | "INVALID_BATTLE_TARGET"
  | "INVALID_COHOST_TARGET"
  | "BATTLE_STATE_UNAVAILABLE"
  | "NO_RECIPIENT";

type GiftRecipientResult =
  | { ok: true; recipient: GiftRecipient }
  | { ok: false; error: GiftRecipientError };

/** Client-requested seat → canonical seat. Unknown values are rejected. */
export function normalizeRequestedBattleSeat(value: unknown): BattleSeat | null {
  if (isBattleSeat(value)) return value;
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  // Legacy client aliases for the two 1×1 seats.
  if (raw === "p1" || raw === "me" || raw === "self") return "host";
  if (raw === "p2" || raw === "rival") return "opponent";
  if (raw === "p3") return "player3";
  if (raw === "p4") return "player4";
  return isBattleSeat(raw) ? raw : null;
}

function trimId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function isValidCohostTarget(
  roomId: string,
  userId: string,
): Promise<boolean> {
  if (await hasCohostPublishGrant(roomId, userId)) return true;
  const layout = await getCohostLayout(roomId);
  const coHosts = layout?.coHosts;
  if (!Array.isArray(coHosts)) return false;
  return coHosts.some((entry) => {
    const row = entry as { userId?: unknown; status?: unknown };
    if (trimId(row.userId) !== userId) return false;
    const status = typeof row.status === "string" ? row.status : "";
    return status === "live" || status === "accepted" || status === "";
  });
}

export async function resolveValidatedGiftRecipient(opts: {
  roomId: string;
  streamOwnerUserId: string;
  requestedBattleTarget?: unknown;
  requestedCohostTargetUserId?: unknown;
}): Promise<GiftRecipientResult> {
  const roomId = trimId(opts.roomId);
  const owner = trimId(opts.streamOwnerUserId);

  const requestedSeat = opts.requestedBattleTarget;
  const namedASeat =
    requestedSeat !== undefined && requestedSeat !== null && requestedSeat !== "";

  const battleState = await getBattleSessionState(roomId);
  if (battleState.status === "unavailable") {
    // Falling through here would drop the requested seat and pay the stream
    // owner instead of the creator the sender chose. Only reject when a seat was
    // actually named: with no seat the owner is the intended recipient either way.
    if (namedASeat) return { ok: false, error: "BATTLE_STATE_UNAVAILABLE" };
  }
  const battle = battleState.status === "ok" ? battleState.battle : null;
  if (battle && battle.status === "ACTIVE") {
    const requested = opts.requestedBattleTarget;
    // Default to the host seat only when the client did not name a target.
    const seat =
      requested === undefined || requested === null || requested === ""
        ? "host"
        : normalizeRequestedBattleSeat(requested);
    if (!seat) return { ok: false, error: "INVALID_BATTLE_TARGET" };
    const participant = participantAtSeat(battle, seat);
    if (!participant) return { ok: false, error: "INVALID_BATTLE_TARGET" };
    return {
      ok: true,
      recipient: {
        creatorId: participant.userId,
        battleSeat: seat,
        teamId: teamOfSeat(seat),
        origin: "battle_seat",
      },
    };
  }

  const requestedCohost = trimId(opts.requestedCohostTargetUserId);
  if (requestedCohost && requestedCohost !== owner) {
    if (!(await isValidCohostTarget(roomId, requestedCohost))) {
      return { ok: false, error: "INVALID_COHOST_TARGET" };
    }
    return {
      ok: true,
      recipient: {
        creatorId: requestedCohost,
        battleSeat: null,
        teamId: null,
        origin: "cohost",
      },
    };
  }

  if (!owner) return { ok: false, error: "NO_RECIPIENT" };
  return {
    ok: true,
    recipient: {
      creatorId: owner,
      battleSeat: null,
      teamId: null,
      origin: "stream_owner",
    },
  };
}
