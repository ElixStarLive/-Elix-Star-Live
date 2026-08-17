/**
 * Battle domain model — pure, no I/O.
 *
 * This is the single definition of what a battle IS: seats, teams, type,
 * lifecycle status, scores, readiness, winner, and the one wire payload the
 * clients consume. Everything that touches battle state (Valkey repository,
 * WS handlers, gift delivery, REST gifts) derives its answers from here so
 * there is exactly one place where a seat maps to a creator and a team.
 *
 * Team membership is explicit DATA (`SEAT_TEAM`) — never inferred from a
 * variable name, a screen side, or an array index.
 */

/** Fixed battle positions. `host` is the room owner; the rest are rival seats. */
export type BattleSeat = "host" | "opponent" | "player3" | "player4";
export type BattleTeamId = "teamA" | "teamB";
export type BattleType = "1x1" | "2x2";
export type BattleStatus = "WAITING" | "ACTIVE" | "ENDED";

/** Every way a battle score may legitimately be produced. Server-side only. */
export type BattleScoreSource =
  | "paid_gift"
  | "promotional_gift"
  | "test_gift"
  | "tap"
  | "booster";

export const BATTLE_SEATS: readonly BattleSeat[] = [
  "host",
  "opponent",
  "player3",
  "player4",
];

/** Seats a non-host creator can occupy, in allocation order. */
export const BATTLE_RIVAL_SEATS: readonly BattleSeat[] = [
  "opponent",
  "player3",
  "player4",
];

/** Seat → team. Explicit table: host+player3 vs opponent+player4. */
export const SEAT_TEAM: Readonly<Record<BattleSeat, BattleTeamId>> = {
  host: "teamA",
  player3: "teamA",
  opponent: "teamB",
  player4: "teamB",
};

const BATTLE_SCORE_SOURCES: readonly BattleScoreSource[] = [
  "paid_gift",
  "promotional_gift",
  "test_gift",
  "tap",
  "booster",
];

/** Battle duration (seconds) — server owns the clock. */
export const BATTLE_DURATION_SECONDS = 300;

export interface BattleParticipant {
  userId: string;
  name: string;
  /** The creator's own live room, used for media/audience mapping. */
  roomId: string;
  seat: BattleSeat;
  teamId: BattleTeamId;
  /** Present in the battle room (WS-confirmed). Required before start. */
  ready: boolean;
  joinedAt: number;
}

export type BattleScores = Record<BattleSeat, number>;

export interface BattleSession {
  id: string;
  roomId: string;
  battleType: BattleType;
  status: BattleStatus;
  createdAt: number;
  /** 0 until the server starts the battle. */
  startedAt: number;
  /** 0 until the server starts the battle. Authoritative clock end. */
  endsAt: number;
  /** 0 until finalized exactly once. */
  finalizedAt: number;
  participants: BattleParticipant[];
  /** Frozen at finalization; null while the battle can still change. */
  winner: BattleTeamId | "draw" | null;
  finalScores: BattleScores | null;
  finalizeReason: string;
}

export function emptyBattleScores(): BattleScores {
  return { host: 0, opponent: 0, player3: 0, player4: 0 };
}

export function isBattleSeat(value: unknown): value is BattleSeat {
  return (
    typeof value === "string" &&
    (BATTLE_SEATS as readonly string[]).includes(value)
  );
}

export function isBattleScoreSource(value: unknown): value is BattleScoreSource {
  return (
    typeof value === "string" &&
    (BATTLE_SCORE_SOURCES as readonly string[]).includes(value)
  );
}

export function teamOfSeat(seat: BattleSeat): BattleTeamId {
  return SEAT_TEAM[seat];
}

function trimId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createBattleSession(opts: {
  roomId: string;
  hostUserId: string;
  hostName: string;
  hostRoomId?: string;
  now?: number;
}): BattleSession {
  const now = opts.now ?? Date.now();
  const roomId = trimId(opts.roomId);
  return {
    id: `battle-${now}-${Math.random().toString(36).slice(2, 8)}`,
    roomId,
    battleType: "1x1",
    status: "WAITING",
    createdAt: now,
    startedAt: 0,
    endsAt: 0,
    finalizedAt: 0,
    participants: [
      {
        userId: trimId(opts.hostUserId),
        name: typeof opts.hostName === "string" ? opts.hostName : "",
        roomId: trimId(opts.hostRoomId) || roomId,
        seat: "host",
        teamId: SEAT_TEAM.host,
        ready: false,
        joinedAt: now,
      },
    ],
    winner: null,
    finalScores: null,
    finalizeReason: "",
  };
}

/**
 * Carry the seated creators of a finished battle into a fresh session.
 * Used for rematch: a NEW battle id with zeroed scores — never a reused
 * half-finished session object.
 */
export function rematchBattleSession(
  previous: BattleSession,
  now = Date.now(),
): BattleSession {
  return {
    id: `battle-${now}-${Math.random().toString(36).slice(2, 8)}`,
    roomId: previous.roomId,
    battleType: battleTypeForParticipants(previous.participants),
    status: "WAITING",
    createdAt: now,
    startedAt: 0,
    endsAt: 0,
    finalizedAt: 0,
    participants: previous.participants.map((p) => ({ ...p })),
    winner: null,
    finalScores: null,
    finalizeReason: "",
  };
}

export function participantAtSeat(
  session: BattleSession,
  seat: BattleSeat,
): BattleParticipant | null {
  return session.participants.find((p) => p.seat === seat && p.userId) ?? null;
}

export function participantOfUser(
  session: BattleSession,
  userId: string,
): BattleParticipant | null {
  const id = trimId(userId);
  if (!id) return null;
  return session.participants.find((p) => p.userId === id) ?? null;
}

export function battleHost(session: BattleSession): BattleParticipant | null {
  return participantAtSeat(session, "host");
}

export function isBattleHost(session: BattleSession, userId: string): boolean {
  const host = battleHost(session);
  return !!host && !!trimId(userId) && host.userId === trimId(userId);
}

export function seatedUserIds(session: BattleSession): string[] {
  return session.participants.map((p) => p.userId).filter(Boolean);
}

export function rivalParticipants(session: BattleSession): BattleParticipant[] {
  return session.participants.filter((p) => p.seat !== "host" && p.userId);
}

export function openRivalSeats(session: BattleSession): BattleSeat[] {
  return BATTLE_RIVAL_SEATS.filter((seat) => !participantAtSeat(session, seat));
}

export function nextOpenRivalSeat(session: BattleSession): BattleSeat | null {
  return openRivalSeats(session)[0] ?? null;
}

export function battleOpenSeatCount(session: BattleSession): number {
  return openRivalSeats(session).length;
}

/** 2×2 only when both team-A and team-B support seats are filled. */
export function battleTypeForParticipants(
  participants: readonly BattleParticipant[],
): BattleType {
  const has = (seat: BattleSeat) =>
    participants.some((p) => p.seat === seat && p.userId);
  return has("player3") && has("player4") ? "2x2" : "1x1";
}

/** Seats that must hold a present creator before the battle may start. */
export function requiredSeats(session: BattleSession): BattleSeat[] {
  return session.participants.filter((p) => p.userId).map((p) => p.seat);
}

export function allRequiredReady(session: BattleSession): boolean {
  const seated = session.participants.filter((p) => p.userId);
  if (seated.length < 2) return false;
  return seated.every((p) => p.ready);
}

/** Seated creators that are not yet confirmed present in the battle room. */
export function notReadyUserIds(session: BattleSession): string[] {
  return session.participants
    .filter((p) => p.userId && !p.ready)
    .map((p) => p.userId);
}

export function teamTotals(scores: BattleScores): {
  teamA: number;
  teamB: number;
} {
  let teamA = 0;
  let teamB = 0;
  for (const seat of BATTLE_SEATS) {
    const points = Number(scores[seat]) || 0;
    if (SEAT_TEAM[seat] === "teamA") teamA += points;
    else teamB += points;
  }
  return { teamA, teamB };
}

export function winnerFromScores(
  scores: BattleScores,
): BattleTeamId | "draw" {
  const { teamA, teamB } = teamTotals(scores);
  if (teamA > teamB) return "teamA";
  if (teamB > teamA) return "teamB";
  return "draw";
}

/** Wire winner label kept for the existing client contract. */
export function wireWinner(
  winner: BattleTeamId | "draw" | null,
): "host" | "opponent" | "draw" | null {
  if (winner === "teamA") return "host";
  if (winner === "teamB") return "opponent";
  if (winner === "draw") return "draw";
  return null;
}

export function battleTimeLeftSeconds(
  session: BattleSession,
  now = Date.now(),
): number {
  if (session.status === "WAITING") return BATTLE_DURATION_SECONDS;
  if (!session.endsAt) return 0;
  return Math.max(0, Math.round((session.endsAt - now) / 1000));
}

export function isBattleExpired(
  session: BattleSession,
  now = Date.now(),
): boolean {
  return session.status === "ACTIVE" && !!session.endsAt && now >= session.endsAt;
}

/** Scoring is open only inside an ACTIVE battle's own clock window. */
export function isBattleScorable(
  session: BattleSession,
  now = Date.now(),
): boolean {
  return session.status === "ACTIVE" && !!session.endsAt && now < session.endsAt;
}

export type BattleScoreTargetCheck =
  | { ok: true; participant: BattleParticipant }
  | {
      ok: false;
      reason: "not_active" | "expired" | "empty_seat";
    };

/**
 * The one target validation: an ACTIVE, unexpired battle with a real creator
 * sitting in the requested seat. Empty seats can never be scored.
 */
export function checkBattleScoreTarget(
  session: BattleSession,
  seat: BattleSeat,
  now = Date.now(),
): BattleScoreTargetCheck {
  if (session.status !== "ACTIVE") return { ok: false, reason: "not_active" };
  if (isBattleExpired(session, now)) return { ok: false, reason: "expired" };
  const participant = participantAtSeat(session, seat);
  if (!participant) return { ok: false, reason: "empty_seat" };
  return { ok: true, participant };
}

/**
 * THE battle wire payload. `battle_state_sync`, join/reconnect push and
 * `battle_get_state` all serialise through this one builder so no client can
 * ever receive a different shape or a stale score copy.
 */
export function buildBattleStatePayload(
  session: BattleSession,
  scores: BattleScores,
  now = Date.now(),
): Record<string, unknown> {
  const host = participantAtSeat(session, "host");
  const opponent = participantAtSeat(session, "opponent");
  const player3 = participantAtSeat(session, "player3");
  const player4 = participantAtSeat(session, "player4");
  const totals = teamTotals(scores);
  return {
    id: session.id,
    status: session.status,
    battleType: session.battleType,
    hostUserId: host?.userId ?? "",
    hostName: host?.name ?? "",
    hostRoomId: host?.roomId ?? session.roomId,
    opponentUserId: opponent?.userId ?? "",
    opponentName: opponent?.name ?? "",
    opponentRoomId: opponent?.roomId ?? "",
    player3UserId: player3?.userId ?? "",
    player3Name: player3?.name ?? "",
    player4UserId: player4?.userId ?? "",
    player4Name: player4?.name ?? "",
    hostScore: scores.host,
    opponentScore: scores.opponent,
    player3Score: scores.player3,
    player4Score: scores.player4,
    teamAScore: totals.teamA,
    teamBScore: totals.teamB,
    timeLeft: battleTimeLeftSeconds(session, now),
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    winner: wireWinner(session.winner),
    hostReady: host?.ready ?? false,
    opponentReady: opponent?.ready ?? false,
  };
}

/**
 * Strict parse of a stored session. Anything that is not a canonical battle
 * session is rejected (and the caller drops the key) — no silent migration of
 * an unknown shape into authoritative state.
 */
export function parseBattleSession(value: unknown): BattleSession | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = trimId(raw.id);
  const roomId = trimId(raw.roomId);
  const status = raw.status;
  const battleType = raw.battleType;
  if (!id || !roomId) return null;
  if (status !== "WAITING" && status !== "ACTIVE" && status !== "ENDED") {
    return null;
  }
  if (battleType !== "1x1" && battleType !== "2x2") return null;
  if (!Array.isArray(raw.participants)) return null;

  const participants: BattleParticipant[] = [];
  for (const entry of raw.participants) {
    if (!entry || typeof entry !== "object") return null;
    const p = entry as Record<string, unknown>;
    const seat = p.seat;
    const userId = trimId(p.userId);
    if (!isBattleSeat(seat) || !userId) return null;
    if (participants.some((existing) => existing.seat === seat)) return null;
    participants.push({
      userId,
      name: typeof p.name === "string" ? p.name : "",
      roomId: trimId(p.roomId),
      seat,
      teamId: SEAT_TEAM[seat],
      ready: p.ready === true,
      joinedAt: Number(p.joinedAt) || 0,
    });
  }
  if (!participants.some((p) => p.seat === "host")) return null;

  const winner = raw.winner;
  const finalScores = raw.finalScores;
  return {
    id,
    roomId,
    battleType,
    status,
    createdAt: Number(raw.createdAt) || 0,
    startedAt: Number(raw.startedAt) || 0,
    endsAt: Number(raw.endsAt) || 0,
    finalizedAt: Number(raw.finalizedAt) || 0,
    participants,
    winner:
      winner === "teamA" || winner === "teamB" || winner === "draw"
        ? winner
        : null,
    finalScores:
      finalScores && typeof finalScores === "object"
        ? normalizeScores(finalScores as Record<string, unknown>)
        : null,
    finalizeReason:
      typeof raw.finalizeReason === "string" ? raw.finalizeReason : "",
  };
}

export function normalizeScores(raw: Record<string, unknown>): BattleScores {
  const scores = emptyBattleScores();
  for (const seat of BATTLE_SEATS) {
    scores[seat] = Math.max(0, Math.trunc(Number(raw[seat]) || 0));
  }
  return scores;
}
