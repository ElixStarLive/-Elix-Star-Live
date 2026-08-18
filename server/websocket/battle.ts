/**
 * Battle authority — Valkey-backed distributed state, one owner per concern.
 *
 * Ownership:
 *   - `battleModel.ts` owns the shape and every pure decision (seats, teams,
 *     type, winner, wire payload, target validation).
 *   - this module owns the STORE and the LIFECYCLE: create, seat, presence,
 *     start, score, finalize, cleanup, tick.
 *   - Neon (`battle_results`) owns the permanent record.
 *   - LiveKit owns media only.
 *
 * Timer architecture:
 *   - battles:active  SET  — roomIds of all battles needing ticks
 *   - battle:tick:{roomId} — per-room distributed lock (SET NX PX, TTL 1500 ms)
 *   - Scheduler interval 1000 ms; lock TTL > interval so two workers never
 *     process the same room on back-to-back ticks. Countdown is wall-clock
 *     derived from `endsAt`, never "assume N ticks fired".
 *
 * Exactly-once finalization:
 *   - battle:final:{battleId} — NX ownership claim. One server execution
 *     freezes scores, picks the winner, persists to Neon, broadcasts
 *     `battle_ended` and schedules cleanup. Every other caller is a no-op.
 */

import { randomUUID } from "crypto";
import { broadcastToRoom, revokeBattlePublish } from "./index";
import {
  isValkeyConfigured,
  valkeySet,
  valkeyTrySet,
  valkeyGet,
  valkeyTryGet,
  valkeyDel,
  valkeySadd,
  valkeySrem,
  valkeySmembers,
  valkeySetNx,
  valkeyTrySetNx,
  valkeyReleaseLock,
  valkeyTryHincrby,
  valkeyTryHgetall,
  valkeyHset,
  valkeyExpire,
} from "../lib/valkey";
import { logger } from "../lib/logger";
import { dbInsertBattleResult, type BattleResultRecord } from "../lib/postgres";
import {
  BATTLE_DURATION_SECONDS,
  BATTLE_SEATS,
  type BattleScoreSource,
  type BattleScores,
  type BattleSeat,
  type BattleSession,
  allRequiredReady,
  battleTypeForParticipants,
  buildBattleStatePayload,
  checkBattleScoreTarget,
  createBattleSession,
  emptyBattleScores,
  isBattleExpired,
  isBattleHost,
  isBattleScoreSource,
  normalizeScores,
  nextOpenRivalSeat,
  notReadyUserIds,
  parseBattleSession,
  participantOfUser,
  rematchBattleSession,
  rivalParticipants,
  seatedUserIds,
  teamOfSeat,
  teamTotals,
  winnerFromScores,
  wireWinner,
} from "./battleModel";

export type { BattleSession } from "./battleModel";

const BATTLE_TTL = 600_000;
/** Lock TTL (ms) for `battle:tick:{roomId}` — must be > scheduler interval (1000 ms). */
const TICK_LOCK_TTL = 1500;
/** Valkey key prefix — full key is `${BATTLE_TICK_LOCK_KEY_PREFIX}${roomId}`. */
export const BATTLE_TICK_LOCK_KEY_PREFIX = "battle:tick:";
const ACTIVE_BATTLES_KEY = "battles:active";
const BATTLE_KEY_PREFIX = "battle:";
const SCORE_KEY_PREFIX = "battle:scores:";
const SESSION_LOCK_PREFIX = "battle:seat_lock:";
const SESSION_LOCK_TTL_MS = 5_000;
const SESSION_LOCK_ATTEMPTS = 25;
const SESSION_LOCK_RETRY_MS = 40;
const PENDING_INVITES_KEY_PREFIX = "battle:pending_invites:";
const FINALIZE_LOCK_PREFIX = "battle:final:";
/** How long the ENDED session stays readable so late clients still see the result. */
const ENDED_RETENTION_MS = 10_000;
/** Results Neon has not accepted yet: SET of battleIds + one payload key each. */
const RESULT_OUTBOX_KEY = "battles:result_outbox";
const RESULT_OUTBOX_PAYLOAD_PREFIX = "battle:result_pending:";
/** A queued result stays retryable for a week, far beyond any normal outage. */
const RESULT_OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESULT_FLUSH_LOCK_KEY = "battle:result_flush";
/** One retry pass every ~10 s across all workers. */
const RESULT_FLUSH_LOCK_TTL_MS = 10_000;

let globalTickInterval: ReturnType<typeof setInterval> | null = null;

function hasValkey(): boolean {
  return isValkeyConfigured();
}

// ── Store ───────────────────────────────────────────────────────────────────

/**
 * Battle state with the failure case kept separate from the empty case.
 *
 * "ok" with a null battle means Valkey answered and there is no battle. The
 * "unavailable" status means Valkey could not answer, so nothing is known.
 * Callers that route money must not read the second as the first: a gift aimed
 * at a battle seat would otherwise fall through to the stream owner and pay the
 * wrong creator.
 */
export async function getBattleSessionState(
  roomId: string,
): Promise<
  { status: "ok"; battle: BattleSession | null } | { status: "unavailable" }
> {
  if (!roomId) return { status: "ok", battle: null };
  if (!hasValkey()) return { status: "unavailable" };
  try {
    const read = await valkeyTryGet(BATTLE_KEY_PREFIX + roomId);
    if (read.status === "unavailable") return { status: "unavailable" };
    if (!read.value) return { status: "ok", battle: null };
    const session = parseBattleSession(JSON.parse(read.value));
    if (!session) {
      // Not a canonical session — never guess at authoritative state.
      await valkeyDel(BATTLE_KEY_PREFIX + roomId);
      await valkeySrem(ACTIVE_BATTLES_KEY, roomId);
      logger.warn({ roomId }, "battle store: dropped non-canonical session");
      return { status: "ok", battle: null };
    }
    return { status: "ok", battle: session };
  } catch (err) {
    logger.error({ err, roomId }, "getBattleSessionState failed");
    return { status: "unavailable" };
  }
}

export async function getBattleFromStore(
  roomId: string,
): Promise<BattleSession | null> {
  const state = await getBattleSessionState(roomId);
  return state.status === "ok" ? state.battle : null;
}

/**
 * Write the session, and say whether it was actually stored.
 *
 * Everything a creator or a viewer is told about a battle — you have a seat, the
 * clock is running, this is the final score — is this one value. A write that
 * was dropped must therefore never be reported as state: the seat would show on
 * one screen and be gone on the next read, and the room the accepter is sent to
 * would have no record of them in it.
 */
export async function saveBattleToStore(
  roomId: string,
  session: BattleSession,
): Promise<"ok" | "unavailable"> {
  if (!hasValkey() || !roomId) return "unavailable";
  const written = await valkeyTrySet(
    BATTLE_KEY_PREFIX + roomId,
    JSON.stringify(session),
    BATTLE_TTL,
  );
  if (written !== "ok") {
    logger.error({ roomId, battleId: session.id }, "battle session write not confirmed");
  }
  return written;
}

/** Returning null rejects the mutation: nothing is written. */
type BattleSessionMutator = (
  session: BattleSession | null,
) => { session: BattleSession; changed: boolean } | null;

export type BattleSessionMutation =
  | { status: "applied" | "unchanged"; session: BattleSession }
  | { status: "rejected" }
  | { status: "contended" }
  | { status: "unavailable" };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * THE only way the battle session changes.
 *
 * A battle is one Valkey value, so every change to it is a read-modify-write.
 * Four creators reach a 2×2 stage at the same moment and each confirms presence
 * from whichever instance holds their socket; a host kicks a creator while
 * another accepts an invite. Performed in the open, those overlap: each computes
 * its new session from a snapshot the others have already replaced, the last
 * write wins, and what it silently drops is a ready flag (so the match can never
 * start), a seat (so an accepted creator is not in the battle they were sent
 * to), or a removal (so a kicked creator is back).
 *
 * Every mutation therefore runs inside a short per-room lock, so the read and
 * the write are one step. The lock is owner-checked: a plain DEL would also
 * delete the lock of the next holder if this one's TTL expired mid-work, which
 * is exactly the case that lets two writers believe they are alone. Broadcasts
 * and LiveKit calls stay outside it.
 *
 * Nothing here reports a change it cannot prove: a caller that could not take
 * the lock gets `contended`, and a failed read or write gets `unavailable`.
 * Neither may be presented to a client as a seat, a start or a result.
 */
async function mutateBattleSession(
  roomId: string,
  mutate: BattleSessionMutator,
): Promise<BattleSessionMutation> {
  const room = String(roomId || "").trim();
  if (!room) return { status: "rejected" };
  if (!hasValkey()) return { status: "unavailable" };

  const lockKey = SESSION_LOCK_PREFIX + room;
  const token = randomUUID();
  let held = false;
  for (let attempt = 0; attempt < SESSION_LOCK_ATTEMPTS; attempt++) {
    const outcome = await valkeyTrySetNx(lockKey, token, SESSION_LOCK_TTL_MS);
    if (outcome === "set") {
      held = true;
      break;
    }
    if (outcome === "unavailable") return { status: "unavailable" };
    await sleep(SESSION_LOCK_RETRY_MS);
  }
  if (!held) {
    logger.warn({ roomId: room }, "mutateBattleSession: session lock not acquired");
    return { status: "contended" };
  }

  try {
    const read = await getBattleSessionState(room);
    if (read.status === "unavailable") return { status: "unavailable" };

    const write = mutate(read.battle);
    if (!write) return { status: "rejected" };
    if (!write.changed) return { status: "unchanged", session: write.session };

    const stored = await saveBattleToStore(room, write.session);
    if (stored !== "ok") return { status: "unavailable" };
    return { status: "applied", session: write.session };
  } finally {
    await valkeyReleaseLock(lockKey, token);
  }
}

async function deleteBattleFromStore(session: BattleSession): Promise<void> {
  if (!hasValkey()) return;
  const roomId = session.roomId;
  try {
    await valkeySrem(ACTIVE_BATTLES_KEY, roomId);
    await valkeyDel(BATTLE_KEY_PREFIX + roomId);
    await valkeyDel(BATTLE_TICK_LOCK_KEY_PREFIX + roomId);
    await valkeyDel(SCORE_KEY_PREFIX + roomId);
    for (const userId of seatedUserIds(session)) {
      await clearUserBattleRoom(userId);
    }
  } catch (err) {
    logger.error({ err, roomId }, "deleteBattleFromStore failed");
  }
}

/**
 * Wipe every trace of battling in this room.
 *
 * Room ids are the creator's own id, so the room a live ends in is the room its
 * next live starts in. Anything left here is inherited by that live: a session
 * would put the old opponent back on the new stage, an outstanding invite could
 * still be accepted into it, and an accept or publish grant would still read as
 * authority to broadcast in it. Every one of those is cleared as one job, on
 * both ends of the boundary — when a live ends, and again when a live starts
 * that is not a reconnect, because the ending side may never have run.
 */
export async function clearBattleRuntimeForRoom(roomId: string): Promise<void> {
  if (!roomId || !hasValkey()) return;
  // Read before deleting: the seats name whose per-user keys have to go too.
  const session = await getBattleFromStore(roomId);

  await valkeySrem(ACTIVE_BATTLES_KEY, roomId);
  await valkeyDel(BATTLE_KEY_PREFIX + roomId);
  await valkeyDel(BATTLE_TICK_LOCK_KEY_PREFIX + roomId);
  await valkeyDel(SCORE_KEY_PREFIX + roomId);
  // Both the tracking set and the invite keys the accept path actually reads.
  await clearPendingBattleInvites(roomId);

  for (const userId of session ? seatedUserIds(session) : []) {
    await clearBattleAcceptedGrant(roomId, userId);
    await clearUserBattleRoom(userId);
    try {
      await revokeBattlePublish(roomId, userId);
    } catch (err) {
      logger.warn(
        { err, roomId, userId },
        "clearBattleRuntimeForRoom: battle publish grant not revoked",
      );
    }
  }
}

// ── User → battle room ──────────────────────────────────────────────────────

export async function getUserBattleRoom(userId: string): Promise<string | null> {
  if (!hasValkey() || !userId) return null;
  return valkeyGet("ubr:" + userId);
}

export async function setUserBattleRoom(
  userId: string,
  roomId: string,
  ttlMs = BATTLE_TTL,
): Promise<void> {
  if (!userId || !roomId || !hasValkey()) return;
  await valkeySet("ubr:" + userId, roomId, ttlMs);
}

export async function clearUserBattleRoom(userId: string): Promise<void> {
  if (!userId || !hasValkey()) return;
  await valkeyDel("ubr:" + userId);
}

// ── Invites / accept grants ─────────────────────────────────────────────────

/**
 * Record an outstanding invite.
 *
 * An invite is one fact stored two ways: the key the accept path checks, and the
 * room's set of who has been asked, which is how every invite gets withdrawn
 * when the stage fills or the live ends. Writing them together is what keeps an
 * invite from surviving a cleanup that could not see it.
 */
export async function setBattleInvite(
  roomId: string,
  targetUserId: string,
  ttlMs = 10 * 60 * 1000,
): Promise<void> {
  if (!roomId || !targetUserId || !hasValkey()) return;
  await valkeySet(`battle_invite:${roomId}:${targetUserId}`, "1", ttlMs);
  await valkeySadd(PENDING_INVITES_KEY_PREFIX + roomId, targetUserId);
  await valkeyExpire(
    PENDING_INVITES_KEY_PREFIX + roomId,
    Math.ceil(ttlMs / 1000),
  );
}

export async function hasBattleInvite(
  roomId: string,
  targetUserId: string,
): Promise<boolean> {
  if (!roomId || !targetUserId || !hasValkey()) return false;
  return !!(await valkeyGet(`battle_invite:${roomId}:${targetUserId}`));
}

export async function clearBattleInvite(
  roomId: string,
  targetUserId: string,
): Promise<void> {
  if (!roomId || !targetUserId || !hasValkey()) return;
  await valkeyDel(`battle_invite:${roomId}:${targetUserId}`);
  await valkeySrem(PENDING_INVITES_KEY_PREFIX + roomId, targetUserId);
}

export async function setBattleAcceptedGrant(
  roomId: string,
  userId: string,
  ttlMs = BATTLE_TTL,
): Promise<void> {
  if (!roomId || !userId || !hasValkey()) return;
  await valkeySet(`battle_accept:${roomId}:${userId}`, "1", ttlMs);
}

export async function hasBattleAcceptedGrant(
  roomId: string,
  userId: string,
): Promise<boolean> {
  if (!roomId || !userId || !hasValkey()) return false;
  return !!(await valkeyGet(`battle_accept:${roomId}:${userId}`));
}

export async function clearBattleAcceptedGrant(
  roomId: string,
  userId: string,
): Promise<void> {
  if (!roomId || !userId || !hasValkey()) return;
  await valkeyDel(`battle_accept:${roomId}:${userId}`);
}

/** Drop every outstanding invite when seats are full (no 5th creator). */
export async function clearPendingBattleInvites(
  roomId: string,
): Promise<string[]> {
  if (!hasValkey()) return [];
  const key = PENDING_INVITES_KEY_PREFIX + roomId;
  const members = await valkeySmembers(key);
  for (const targetUserId of members) {
    await valkeyDel(`battle_invite:${roomId}:${targetUserId}`);
  }
  await valkeyDel(key);
  return members;
}

export async function claimBattleVoteOnce(
  battleId: string,
  userId: string,
  voteTarget: BattleSeat,
  ttlMs = BATTLE_TTL,
): Promise<boolean> {
  if (!hasValkey()) return false;
  return valkeySetNx(`battle_vote_once:${battleId}:${userId}`, voteTarget, ttlMs);
}

/**
 * Give a viewer their one tap back when the points did not land.
 *
 * The claim is taken before the score is written, so a write that fails would
 * otherwise cost them the single +5 this battle allows them.
 */
export async function releaseBattleVoteOnce(
  battleId: string,
  userId: string,
): Promise<void> {
  if (!hasValkey() || !battleId || !userId) return;
  await valkeyDel(`battle_vote_once:${battleId}:${userId}`);
}

// ── Create / seat / presence ────────────────────────────────────────────────

/**
 * Host enters battle mode. Idempotent: an existing WAITING/ACTIVE battle is
 * returned untouched so re-entering the battle chrome can never reset a live
 * match, and an ENDED battle is replaced by a fresh session (rematch seats).
 */
export async function ensureBattleForHost(opts: {
  roomId: string;
  hostUserId: string;
  hostName: string;
}): Promise<BattleSession | null> {
  let fresh = false;
  const mutation = await mutateBattleSession(opts.roomId, (existing) => {
    if (existing) {
      if (!isBattleHost(existing, opts.hostUserId)) return null;
      if (existing.status !== "ENDED") return { session: existing, changed: false };
      fresh = true;
      return { session: rematchBattleSession(existing), changed: true };
    }
    fresh = true;
    return {
      session: createBattleSession({
        roomId: opts.roomId,
        hostUserId: opts.hostUserId,
        hostName: opts.hostName,
        hostRoomId: opts.roomId,
      }),
      changed: true,
    };
  });
  if (mutation.status !== "applied" && mutation.status !== "unchanged") return null;
  // A running match keeps its scoreboard and its host mapping untouched; only a
  // brand-new session (first entry or rematch) starts from zero.
  if (fresh) {
    await resetScoreHash(opts.roomId);
    await setUserBattleRoom(opts.hostUserId, opts.roomId, BATTLE_TTL);
  }
  return mutation.session;
}

/**
 * Seat an accepted rival creator. The seat, the creator id and the creator's
 * own room all come from the server (socket identity + DB profile) — never
 * from a client-supplied roster.
 */
export type BattleSeatClaim =
  | { status: "seated"; session: BattleSession }
  | { status: "full" }
  | { status: "no_battle" }
  /** Another writer held the room's lock — the accept is still valid, retry. */
  | { status: "contended" }
  | { status: "unavailable" };

export async function claimBattleSeat(
  roomId: string,
  userId: string,
  userName: string,
  creatorRoomId = "",
): Promise<BattleSeatClaim> {
  let outcome: "seated" | "full" | "no_battle" = "seated";
  const mutation = await mutateBattleSession(roomId, (session) => {
    if (!session || session.status === "ENDED") {
      outcome = "no_battle";
      return null;
    }

    // One account holds at most one seat: a second device, or a repeated accept,
    // returns the seat this creator already has instead of taking another.
    const already = participantOfUser(session, userId);
    if (already) {
      if (creatorRoomId && already.roomId !== creatorRoomId) {
        already.roomId = creatorRoomId;
        return { session, changed: true };
      }
      return { session, changed: false };
    }

    const seat = nextOpenRivalSeat(session);
    if (!seat) {
      outcome = "full";
      return null;
    }

    session.participants.push({
      userId,
      name: userName,
      roomId: creatorRoomId,
      seat,
      teamId: teamOfSeat(seat),
      ready: false,
      joinedAt: Date.now(),
    });
    session.battleType = battleTypeForParticipants(session.participants);
    return { session, changed: true };
  });

  if (mutation.status === "rejected") return { status: outcome as "full" | "no_battle" };
  if (mutation.status === "contended") return { status: "contended" };
  if (mutation.status === "unavailable") return { status: "unavailable" };

  await setUserBattleRoom(userId, roomId, BATTLE_TTL);
  if (mutation.status === "applied") {
    await broadcastBattleState(roomId, mutation.session);
  }
  return { status: "seated", session: mutation.session };
}

/**
 * A seated creator is connected to the battle room. Readiness is a fact
 * written by the WS presence path only — the client cannot declare itself
 * ready, and the timer never starts on a layout change.
 */
export async function confirmBattleParticipantPresence(
  roomId: string,
  userId: string,
): Promise<BattleSession | null> {
  const mutation = await mutateBattleSession(roomId, (session) => {
    if (!session || session.status === "ENDED") return null;
    const participant = participantOfUser(session, userId);
    if (!participant || participant.ready) {
      return participant ? { session, changed: false } : null;
    }
    participant.ready = true;
    return { session, changed: true };
  });
  if (mutation.status === "applied") {
    await broadcastBattleState(roomId, mutation.session);
    return mutation.session;
  }
  return mutation.status === "unchanged" ? mutation.session : null;
}

export async function clearBattleParticipantPresence(
  roomId: string,
  userId: string,
): Promise<void> {
  const mutation = await mutateBattleSession(roomId, (session) => {
    if (!session || session.status === "ENDED") return null;
    const participant = participantOfUser(session, userId);
    if (!participant || !participant.ready) return null;
    participant.ready = false;
    return { session, changed: true };
  });
  if (mutation.status === "applied") {
    await broadcastBattleState(roomId, mutation.session);
  }
}

/**
 * Remove a rival creator without ending the match for the others.
 * Clears exactly that seat so it can be refilled via Invite Creator.
 */
export async function removeBattleParticipant(
  roomId: string,
  userId: string,
): Promise<boolean> {
  let vacatedSeat: BattleSeat | "" = "";
  const mutation = await mutateBattleSession(roomId, (session) => {
    if (!session || session.status === "ENDED") return null;
    if (isBattleHost(session, userId)) return null;

    const participant = participantOfUser(session, userId);
    if (!participant) return null;
    vacatedSeat = participant.seat;

    session.participants = session.participants.filter(
      (p) => p.userId !== participant.userId,
    );
    session.battleType = battleTypeForParticipants(session.participants);
    return { session, changed: true };
  });
  if (mutation.status !== "applied" || !vacatedSeat) return false;

  await clearUserBattleRoom(userId);
  // Leaving ends this creator's authority in the match: without clearing the
  // accept, a kicked creator's next connect is still authorised to take a seat.
  await clearBattleAcceptedGrant(roomId, userId);
  await resetSeatScore(roomId, vacatedSeat);
  await broadcastBattleState(roomId, mutation.session);
  return true;
}

// ── Start ───────────────────────────────────────────────────────────────────

/** Can this WAITING session legitimately become ACTIVE right now? */
export function battleStartBlockedReason(
  session: BattleSession,
): "not_waiting" | "no_rivals" | "incomplete_teams" | "not_ready" | null {
  if (session.status !== "WAITING") return "not_waiting";
  const rivals = rivalParticipants(session);
  if (rivals.length === 0) return "no_rivals";
  // A 2×2 needs both support seats: player3 without player4 (or the reverse)
  // would be a 3-creator match, which is not a supported battle type.
  const hasP3 = rivals.some((p) => p.seat === "player3");
  const hasP4 = rivals.some((p) => p.seat === "player4");
  if (hasP3 !== hasP4) return "incomplete_teams";
  if (!allRequiredReady(session)) return "not_ready";
  return null;
}

export type StartBattleResult =
  | { ok: true; session: BattleSession }
  | {
      ok: false;
      reason:
        | "not_waiting"
        | "no_rivals"
        | "incomplete_teams"
        | "not_ready"
        | "unavailable";
      notReady: string[];
    };

/**
 * The ONLY transition into ACTIVE, and the only place `startedAt` / `endsAt`
 * are ever stamped.
 *
 * The host asks to start; the SERVER decides. The clock starts only when a
 * complete side is seated and every seated creator is confirmed present in the
 * battle room over WS — never because a client changed screen or layout, and
 * never with a client-supplied roster, duration or timestamp.
 */
export async function startBattleIfReady(
  roomId: string,
): Promise<StartBattleResult> {
  let blocked: StartBattleResult | null = null;
  // Zero the board before the clock, never after: a gift already in flight would
  // otherwise be scored against the started battle and then wiped. A battle still
  // forming cannot be scored at all, so this only guarantees a rematch starts at 0.
  const forming = await getBattleFromStore(roomId);
  if (forming && forming.status === "WAITING") await resetScoreHash(roomId);
  // The roster is read inside the lock: starting from a snapshot taken before the
  // last creator confirmed presence would both miss them and write their seat away.
  const mutation = await mutateBattleSession(roomId, (session) => {
    if (!session) {
      blocked = { ok: false, reason: "not_waiting", notReady: [] };
      return null;
    }
    const reason = battleStartBlockedReason(session);
    if (reason) {
      blocked = { ok: false, reason, notReady: notReadyUserIds(session) };
      return null;
    }
    const now = Date.now();
    session.status = "ACTIVE";
    session.startedAt = now;
    session.endsAt = now + BATTLE_DURATION_SECONDS * 1000;
    session.battleType = battleTypeForParticipants(session.participants);
    session.winner = null;
    session.finalScores = null;
    return { session, changed: true };
  });

  if (mutation.status === "rejected" && blocked) return blocked;
  if (mutation.status !== "applied") {
    return { ok: false, reason: "unavailable", notReady: [] };
  }

  const session = mutation.session;
  await valkeySadd(ACTIVE_BATTLES_KEY, roomId);
  await broadcastBattleState(roomId, session);
  logger.info(
    {
      roomId,
      battleId: session.id,
      battleType: session.battleType,
      endsAt: session.endsAt,
    },
    "battle started",
  );
  return { ok: true, session };
}

// ── Scores ──────────────────────────────────────────────────────────────────

async function resetScoreHash(roomId: string): Promise<void> {
  if (!hasValkey()) return;
  const key = SCORE_KEY_PREFIX + roomId;
  for (const seat of BATTLE_SEATS) {
    await valkeyHset(key, seat, "0");
  }
  await valkeyExpire(key, Math.ceil(BATTLE_TTL / 1000));
}

async function resetSeatScore(roomId: string, seat: BattleSeat): Promise<void> {
  if (!hasValkey()) return;
  await valkeyHset(SCORE_KEY_PREFIX + roomId, seat, "0");
}

/**
 * Live per-seat scores, with an unreadable hash kept separate from a hash of
 * zeros.
 *
 * A started battle has real points in it, so a read that failed must never be
 * passed on as 0–0. That number would otherwise be frozen as the permanent
 * result and shown to both creators as the final score of a match they actually
 * played. Callers that decide or display a score take this one; the plain
 * reader below is for the paths where zero and unknown mean the same thing.
 */
export async function getBattleScoresState(
  roomId: string,
): Promise<{ status: "ok"; scores: BattleScores } | { status: "unavailable" }> {
  if (!hasValkey() || !roomId) return { status: "unavailable" };
  const read = await valkeyTryHgetall(SCORE_KEY_PREFIX + roomId);
  if (read.status === "unavailable") return { status: "unavailable" };
  return { status: "ok", scores: normalizeScores(read.value) };
}

/**
 * Scores for showing or broadcasting a session's current state.
 *
 * A WAITING battle has not been scored yet, so zeros are the truth there even
 * when the hash could not be read. Once the clock is running the difference
 * matters, and an unreadable hash means this state cannot be described at all.
 */
async function scoresForSessionState(
  session: BattleSession,
): Promise<BattleScores | null> {
  if (session.finalScores) return session.finalScores;
  const read = await getBattleScoresState(session.roomId);
  if (read.status === "ok") return read.scores;
  if (session.status === "WAITING") return emptyBattleScores();
  logger.warn(
    { roomId: session.roomId, battleId: session.id },
    "battle state not described — live scores unreadable",
  );
  return null;
}

export type AddBattleScoreResult =
  | {
      ok: true;
      seat: BattleSeat;
      creatorId: string;
      teamId: "teamA" | "teamB";
      points: number;
      /** The scoreboard after the write, absent when it could not be read. */
      scores?: BattleScores;
    }
  | {
      ok: false;
      reason:
        | "no_battle"
        | "not_active"
        | "expired"
        | "empty_seat"
        | "invalid_seat"
        | "invalid_points"
        | "invalid_source"
        | "unavailable";
    };

/**
 * THE battle scoring choke point. Paid gifts, promotional gifts, test-coin
 * gifts, spectator taps and boosters all pass through here — there is no other
 * way to move a battle score.
 *
 * Validates: battle exists, status allows scoring, the clock has not expired,
 * the seat is real, the seat holds a real creator in THIS battle, the point
 * value is sane and the source is a known server-side source.
 */
export async function addBattleScore(req: {
  roomId: string;
  seat: BattleSeat;
  points: number;
  source: BattleScoreSource;
}): Promise<AddBattleScoreResult> {
  if (!hasValkey()) return { ok: false, reason: "unavailable" };

  const points = Math.trunc(Number(req.points));
  if (!Number.isFinite(points) || points <= 0) {
    return { ok: false, reason: "invalid_points" };
  }
  if (!isBattleScoreSource(req.source)) {
    return { ok: false, reason: "invalid_source" };
  }

  const session = await getBattleFromStore(req.roomId);
  if (!session) return { ok: false, reason: "no_battle" };

  const check = checkBattleScoreTarget(session, req.seat);
  if (check.ok === false) return { ok: false, reason: check.reason };

  // A gift has already been paid for by the time it gets here, so a score write
  // that did not land must be reported as a failure rather than acknowledged as
  // points the creator never received.
  const written = await valkeyTryHincrby(
    SCORE_KEY_PREFIX + req.roomId,
    req.seat,
    points,
  );
  if (written.status === "unavailable") {
    logger.error(
      { roomId: req.roomId, seat: req.seat, points, source: req.source },
      "battle score write failed",
    );
    return { ok: false, reason: "unavailable" };
  }

  // The points are in the hash now. Only the scoreboard to show is in doubt, so
  // the score still counts and the 1 Hz tick corrects every display shortly.
  const read = await getBattleScoresState(req.roomId);
  if (read.status === "ok") {
    const totals = teamTotals(read.scores);
    broadcastToRoom(req.roomId, "battle_score", {
      hostScore: read.scores.host,
      opponentScore: read.scores.opponent,
      player3Score: read.scores.player3,
      player4Score: read.scores.player4,
      teamAScore: totals.teamA,
      teamBScore: totals.teamB,
      lastScorer: req.seat,
      points,
    });
  }

  return {
    ok: true,
    seat: req.seat,
    creatorId: check.participant.userId,
    teamId: check.participant.teamId,
    points,
    ...(read.status === "ok" ? { scores: read.scores } : {}),
  };
}

// ── State broadcast / sync ──────────────────────────────────────────────────

/**
 * The one battle state builder. `battle_state_sync`, `battle_get_state` and
 * the join/reconnect push all read the same session + the same live score
 * hash, so a reconnecting client can never receive a stale score copy.
 */
/**
 * The state to send one client, with "there is no battle" kept apart from "this
 * battle cannot be described right now".
 *
 * The two must not collapse into one null: answering a state request with ENDED
 * because a score read failed would drop every spectator out of the battle
 * layout of a match that is still being fought.
 */
export async function buildBattleStateForRoom(roomId: string): Promise<{
  /** The payload to send, or null when this room has no battle. */
  state: Record<string, unknown> | null;
  /** A battle exists, but its live scores could not be read. */
  unreadable: boolean;
}> {
  const session = await getBattleFromStore(roomId);
  if (!session) return { state: null, unreadable: false };
  const scores = await scoresForSessionState(session);
  if (!scores) return { state: null, unreadable: true };
  return { state: buildBattleStatePayload(session, scores), unreadable: false };
}

export async function broadcastBattleState(
  roomId: string,
  session?: BattleSession | null,
): Promise<void> {
  const current = session ?? (await getBattleFromStore(roomId));
  if (!current) return;
  const scores = await scoresForSessionState(current);
  // Nothing is better than a wrong scoreboard: the 1 Hz tick re-broadcasts real
  // scores to everyone as soon as the hash can be read again.
  if (!scores) return;
  broadcastToRoom(
    roomId,
    "battle_state_sync",
    buildBattleStatePayload(current, scores),
  );
}

// ── Finalization (exactly once) ─────────────────────────────────────────────

export type BattleFinalizeReason =
  | "timer"
  | "host_end"
  | "host_disconnect"
  | "participant_disconnect"
  | "no_rivals";

/**
 * Freeze a battle exactly once.
 *
 * The `battle:final:{battleId}` NX claim means only one server execution — on
 * any worker, from any trigger (tick expiry, host end, disconnect resolution,
 * expired read) — computes the winner, persists the record, broadcasts
 * `battle_ended` and schedules cleanup. Every other caller returns null.
 */
export async function finalizeBattle(
  roomId: string,
  reason: BattleFinalizeReason,
): Promise<BattleSession | null> {
  if (!hasValkey() || !roomId) return null;

  const session = await getBattleFromStore(roomId);
  if (!session) return null;
  if (session.status === "ENDED") return null;

  const claimed = await valkeySetNx(
    FINALIZE_LOCK_PREFIX + session.id,
    reason,
    BATTLE_TTL,
  );
  if (!claimed) return null;

  // The result is the whole point of the match, and this is the only pass that
  // will ever compute it. Scores that cannot be read are not zero: freezing them
  // would hand both creators a 0–0 draw as the permanent record of a battle they
  // played. Give the claim back instead, so the next tick — or the next end
  // trigger — finalizes for real once the hash can be read.
  const read = await getBattleScoresState(roomId);
  if (read.status === "unavailable") {
    await valkeyDel(FINALIZE_LOCK_PREFIX + session.id);
    logger.error(
      { roomId, battleId: session.id, reason },
      "battle not finalized — live scores unreadable, will retry",
    );
    return null;
  }
  const scores = read.scores;

  const finalized: BattleSession = {
    ...session,
    status: "ENDED",
    finalizedAt: Date.now(),
    finalScores: scores,
    winner: winnerFromScores(scores),
    finalizeReason: reason,
  };
  // The frozen result is only real once it is stored. Giving the claim back on a
  // failed write keeps the battle in the active set so a later tick finalizes it
  // for real — announcing a result the store never took would leave the match
  // running for everyone who reads it next.
  if ((await saveBattleToStore(roomId, finalized)) !== "ok") {
    await valkeyDel(FINALIZE_LOCK_PREFIX + session.id);
    logger.error(
      { roomId, battleId: session.id, reason },
      "battle not finalized — result write not confirmed, will retry",
    );
    return null;
  }

  await valkeySrem(ACTIVE_BATTLES_KEY, roomId);
  await valkeyDel(BATTLE_TICK_LOCK_KEY_PREFIX + roomId);

  // Durability is a separate concern from freezing. The frozen scores are real
  // either way, so clients are told the truth immediately; if Neon is down the
  // record goes to the retry outbox instead of being lost.
  const record = battleResultRecord(finalized, scores);
  const persisted = await persistBattleResult(record);
  if (!persisted) await queueBattleResultForRetry(record);

  const totals = teamTotals(scores);
  const host = finalized.participants.find((p) => p.seat === "host");
  const opponent = finalized.participants.find((p) => p.seat === "opponent");
  broadcastToRoom(roomId, "battle_ended", {
    battleId: finalized.id,
    hostScore: scores.host,
    opponentScore: scores.opponent,
    player3Score: scores.player3,
    player4Score: scores.player4,
    teamAScore: totals.teamA,
    teamBScore: totals.teamB,
    winner: wireWinner(finalized.winner),
    hostName: host?.name ?? "",
    opponentName: opponent?.name ?? "",
  });

  // Battle-only publish rights end with the battle; the creators stay live.
  for (const rival of rivalParticipants(finalized)) {
    try {
      await revokeBattlePublish(roomId, rival.userId);
    } catch (err) {
      logger.warn(
        { err, roomId, userId: rival.userId },
        "finalizeBattle: revokeBattlePublish failed",
      );
    }
  }

  scheduleFinalizedCleanup(finalized);
  return finalized;
}

function battleResultRecord(
  session: BattleSession,
  scores: BattleScores,
): BattleResultRecord {
  const totals = teamTotals(scores);
  return {
    battleId: session.id,
    roomId: session.roomId,
    battleType: session.battleType,
    winner: session.winner ?? "draw",
    teamAScore: totals.teamA,
    teamBScore: totals.teamB,
    startedAt: session.startedAt,
    endedAt: session.finalizedAt,
    finalizeReason: session.finalizeReason,
    participants: session.participants
      .filter((p) => p.userId)
      .map((p) => ({
        seat: p.seat,
        creatorUserId: p.userId,
        teamId: p.teamId,
        score: scores[p.seat],
      })),
  };
}

/** True when the permanent Neon record exists. Idempotent per `battleId`. */
async function persistBattleResult(record: BattleResultRecord): Promise<boolean> {
  try {
    await dbInsertBattleResult(record);
    return true;
  } catch (err) {
    logger.error(
      { err, battleId: record.battleId, roomId: record.roomId },
      "persistBattleResult failed — result queued for retry",
    );
    return false;
  }
}

/**
 * Outbox for a finalized result Neon has not accepted yet.
 *
 * Exactly-once means ONE SUCCESSFUL persistence, so a database outage must not
 * silently drop the record: the full result waits here and every retry re-runs
 * the same idempotent insert until it commits.
 */
async function queueBattleResultForRetry(record: BattleResultRecord): Promise<void> {
  try {
    await valkeySet(
      RESULT_OUTBOX_PAYLOAD_PREFIX + record.battleId,
      JSON.stringify(record),
      RESULT_OUTBOX_TTL_MS,
    );
    await valkeySadd(RESULT_OUTBOX_KEY, record.battleId);
    logger.warn(
      { battleId: record.battleId, roomId: record.roomId },
      "battle result awaiting permanent storage (queued)",
    );
  } catch (err) {
    logger.error(
      { err, battleId: record.battleId },
      "could not queue battle result for retry",
    );
  }
}

/**
 * Retry every queued result. The NX lock is a mutex so two workers never flush
 * at once, and it is released at the end of the pass (its TTL only covers a
 * worker dying mid-pass) — a failed pass must never stop future retries. A
 * result leaves the outbox only after Neon has actually committed it.
 */
export async function flushPendingBattleResults(): Promise<void> {
  if (!hasValkey()) return;
  const battleIds = await valkeySmembers(RESULT_OUTBOX_KEY);
  if (battleIds.length === 0) return;
  const locked = await valkeySetNx(
    RESULT_FLUSH_LOCK_KEY,
    "1",
    RESULT_FLUSH_LOCK_TTL_MS,
  );
  if (!locked) return;

  try {
    for (const battleId of battleIds) {
      const raw = await valkeyGet(RESULT_OUTBOX_PAYLOAD_PREFIX + battleId);
      if (!raw) {
        await valkeySrem(RESULT_OUTBOX_KEY, battleId);
        continue;
      }
      let record: BattleResultRecord;
      try {
        record = JSON.parse(raw) as BattleResultRecord;
      } catch {
        await valkeySrem(RESULT_OUTBOX_KEY, battleId);
        await valkeyDel(RESULT_OUTBOX_PAYLOAD_PREFIX + battleId);
        logger.error({ battleId }, "unreadable queued battle result dropped");
        continue;
      }
      if (!(await persistBattleResult(record))) {
        // Still failing — keep everything queued and stop this pass.
        return;
      }
      await valkeySrem(RESULT_OUTBOX_KEY, battleId);
      await valkeyDel(RESULT_OUTBOX_PAYLOAD_PREFIX + battleId);
      logger.info({ battleId }, "queued battle result persisted on retry");
    }
  } finally {
    await valkeyDel(RESULT_FLUSH_LOCK_KEY);
  }
}

/** Keep the frozen result readable briefly, then drop the realtime keys. */
function scheduleFinalizedCleanup(session: BattleSession): void {
  setTimeout(() => {
    void (async () => {
      try {
        const current = await getBattleFromStore(session.roomId);
        if (!current || current.id !== session.id) return;
        await deleteBattleFromStore(current);
      } catch (err) {
        logger.warn(
          { err, roomId: session.roomId },
          "finalized battle cleanup failed",
        );
      }
    })();
  }, ENDED_RETENTION_MS);
}

// ── Distributed battle tick loop ────────────────────────────────────────────

/**
 * Per-room tick: only one executor across all workers/instances via
 * `valkeySetNx(BATTLE_TICK_LOCK_KEY_PREFIX + roomId, …)` (SET NX PX).
 */
async function processBattleTick(roomId: string): Promise<void> {
  if (!hasValkey()) return;
  const locked = await valkeySetNx(
    BATTLE_TICK_LOCK_KEY_PREFIX + roomId,
    "1",
    TICK_LOCK_TTL,
  );
  if (!locked) return;

  try {
    const session = await getBattleFromStore(roomId);
    if (!session || session.status !== "ACTIVE") {
      await valkeySrem(ACTIVE_BATTLES_KEY, roomId);
      return;
    }

    if (isBattleExpired(session)) {
      await finalizeBattle(roomId, "timer");
      return;
    }

    // Skip a tick rather than tell the whole room the score is 0–0: the clock is
    // wall-clock derived from endsAt, so a missed tick costs nothing and the next
    // readable one is correct.
    const read = await getBattleScoresState(roomId);
    if (read.status === "unavailable") return;
    const scores = read.scores;
    const totals = teamTotals(scores);
    broadcastToRoom(roomId, "battle_tick", {
      timeLeft: Math.max(0, Math.round((session.endsAt - Date.now()) / 1000)),
      hostScore: scores.host,
      opponentScore: scores.opponent,
      player3Score: scores.player3,
      player4Score: scores.player4,
      teamAScore: totals.teamA,
      teamBScore: totals.teamB,
      endsAt: session.endsAt,
    });
  } catch (err) {
    logger.error({ err, roomId }, "processBattleTick error");
  }
}

async function globalTickLoop(): Promise<void> {
  if (!hasValkey()) return;
  // Runs even with no active battle: a result queued during a Neon outage must
  // still reach permanent storage once the database is back.
  try {
    await flushPendingBattleResults();
  } catch (err) {
    logger.error({ err }, "battle result retry pass failed");
  }
  try {
    const activeRoomIds = await valkeySmembers(ACTIVE_BATTLES_KEY);
    if (activeRoomIds.length === 0) return;
    await Promise.all(activeRoomIds.map((roomId) => processBattleTick(roomId)));
  } catch (err) {
    logger.error({ err }, "globalTickLoop error");
  }
}

/**
 * Start the 1 Hz scheduler that scans active battles (SMEMBERS `battles:active`).
 * Registered on every worker: each tick must acquire the per-room lock, so at
 * most one worker runs the body for a given room per tick.
 */
export function initBattleTickLoop(): void {
  if (globalTickInterval) return;
  if (!hasValkey()) {
    logger.warn("Battle tick loop not started — Valkey not configured");
    return;
  }

  globalTickInterval = setInterval(globalTickLoop, 1000);
  logger.info(
    {
      schedulerIntervalMs: 1000,
      perRoomLock: "Valkey SET NX PX",
      lockKeyPattern: `${BATTLE_TICK_LOCK_KEY_PREFIX}{roomId}`,
      lockTtlMs: TICK_LOCK_TTL,
      activeBattlesSet: ACTIVE_BATTLES_KEY,
      finalizeLockPattern: `${FINALIZE_LOCK_PREFIX}{battleId}`,
    },
    "Battle tick scheduler started (per-room execution gated by distributed lock; safe with multiple PIDs)",
  );
}

/** Stop the tick loop (graceful shutdown). */
export function stopBattleTickLoop(): void {
  if (globalTickInterval) {
    clearInterval(globalTickInterval);
    globalTickInterval = null;
  }
}
