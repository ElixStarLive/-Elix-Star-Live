/**
 * Battle system — ALL state in Valkey. Fully distributed timer.
 *
 * Timer architecture:
 *   - battles:active  SET  — contains roomIds of all battles needing ticks
 *   - battle:tick:{roomId}  — distributed lock (SET NX PX 1500)
 *   - Every worker runs a 1-second global loop
 *   - Each loop iteration tries to acquire the lock for each active battle
 *   - Only the lock holder processes the tick for that battle
 *   - If a worker crashes, lock expires in 1.5s, another worker picks it up
 *
 * No local Maps. No setInterval per battle.
 */

import { broadcastToRoom } from "./index";
import {
  isValkeyConfigured,
  valkeySet,
  valkeyGet,
  valkeyDel,
  valkeySadd,
  valkeySrem,
  valkeySmembers,
  valkeySetNx,
  valkeyHincrby,
  valkeyHgetall,
  valkeyHset,
  valkeyHdel,
  valkeyExpire,
} from "../lib/valkey";
import { logger } from "../lib/logger";

export interface BattleSession {
  id: string;
  hostRoomId: string;
  hostUserId: string;
  hostName: string;
  opponentUserId: string;
  opponentName: string;
  opponentRoomId: string;
  player3UserId: string;
  player3Name: string;
  player4UserId: string;
  player4Name: string;
  hostScore: number;
  opponentScore: number;
  player3Score: number;
  player4Score: number;
  endsAt: number;
  timeLeft: number;
  status: "WAITING" | "COUNTDOWN" | "ACTIVE" | "ENDED";
  winner:
    | "host"
    | "opponent"
    | "player3"
    | "player4"
    | "draw"
    | null;
  timer: null;
  createdAt: number;
  hostReady: boolean;
  opponentReady: boolean;
}

const BATTLE_TTL = 600_000;
const TICK_LOCK_TTL = 1500;
const ACTIVE_BATTLES_KEY = "battles:active";

let globalTickInterval: ReturnType<typeof setInterval> | null = null;

function requireValkey(): boolean {
  if (!isValkeyConfigured()) {
    logger.error("Battle system requires Valkey — VALKEY_URL not set");
    return false;
  }
  return true;
}

export async function getBattleFromStore(
  roomId: string,
): Promise<BattleSession | null> {
  if (!requireValkey()) return null;
  try {
    const raw = await valkeyGet("battle:" + roomId);
    if (raw) {
      const parsed = JSON.parse(raw) as BattleSession;
      parsed.timer = null;
      return parsed;
    }
  } catch (err) {
    logger.error({ err, roomId }, "getBattleFromStore failed");
  }
  return null;
}

async function saveBattleToStore(
  roomId: string,
  session: BattleSession,
): Promise<void> {
  if (!requireValkey()) return;
  try {
    const { timer: _timer, ...serializable } = session;
    await valkeySet(
      "battle:" + roomId,
      JSON.stringify({ ...serializable, timer: null }),
      BATTLE_TTL,
    );
  } catch (err) {
    logger.error({ err, roomId }, "saveBattleToStore failed");
  }
}

async function deleteBattleFromStore(
  roomId: string,
  session: BattleSession,
): Promise<void> {
  try {
    await valkeySrem(ACTIVE_BATTLES_KEY, roomId);
    await valkeyDel("battle:" + roomId);
    await valkeyDel("battle:tick:" + roomId);
    await valkeyDel(SCORE_KEY_PREFIX + roomId);
    await valkeyDel("ubr:" + session.hostUserId);
    if (session.opponentUserId) await valkeyDel("ubr:" + session.opponentUserId);
    if (session.player3UserId) await valkeyDel("ubr:" + session.player3UserId);
    if (session.player4UserId) await valkeyDel("ubr:" + session.player4UserId);
  } catch (err) {
    logger.error({ err, roomId }, "deleteBattleFromStore failed");
  }
}

export async function getUserBattleRoom(userId: string): Promise<string | null> {
  if (!isValkeyConfigured()) return null;
  return valkeyGet("ubr:" + userId);
}

export async function createBattle(
  hostRoomId: string,
  hostUserId: string,
  hostName: string,
): Promise<BattleSession | null> {
  if (!requireValkey()) return null;

  const session: BattleSession = {
    id: `battle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    hostRoomId,
    hostUserId,
    hostName,
    opponentUserId: "",
    opponentName: "",
    opponentRoomId: "",
    player3UserId: "",
    player3Name: "",
    player4UserId: "",
    player4Name: "",
    hostScore: 0,
    opponentScore: 0,
    player3Score: 0,
    player4Score: 0,
    endsAt: 0,
    timeLeft: 300,
    status: "WAITING",
    winner: null,
    timer: null,
    createdAt: Date.now(),
    hostReady: false,
    opponentReady: false,
  };
  await valkeySet("ubr:" + hostUserId, hostRoomId, BATTLE_TTL);
  await saveBattleToStore(hostRoomId, session);
  return session;
}

export async function joinBattle(
  roomId: string,
  userId: string,
  userName: string,
): Promise<BattleSession | null> {
  const session = await getBattleFromStore(roomId);
  if (!session || session.status === "ENDED") return null;

  if (
    session.opponentUserId === userId ||
    session.player3UserId === userId ||
    session.player4UserId === userId
  ) {
    if (session.status === "WAITING") await startBattleTimer(roomId);
    return session;
  }
  if (session.hostUserId === userId) return session;

  if (!session.opponentUserId) {
    session.opponentUserId = userId;
    session.opponentName = userName;
  } else if (!session.player3UserId) {
    session.player3UserId = userId;
    session.player3Name = userName;
  } else if (!session.player4UserId) {
    session.player4UserId = userId;
    session.player4Name = userName;
  } else {
    return null;
  }

  await valkeySet("ubr:" + userId, roomId, BATTLE_TTL);
  await saveBattleToStore(roomId, session);

  if (session.status === "WAITING") {
    await startBattleTimer(roomId);
  } else {
    broadcastBattleState(roomId, session);
  }
  return session;
}

export async function startBattleTimer(roomId: string): Promise<void> {
  const session = await getBattleFromStore(roomId);
  if (!session) return;

  session.status = "ACTIVE";
  session.endsAt = Date.now() + 300 * 1000;
  session.timeLeft = 300;
  await saveBattleToStore(roomId, session);
  await initScoreHash(roomId, session);
  broadcastBattleState(roomId, session);

  await valkeySadd(ACTIVE_BATTLES_KEY, roomId);
}

const SCORE_KEY_PREFIX = "battle:scores:";

async function initScoreHash(roomId: string, session: BattleSession): Promise<void> {
  const key = SCORE_KEY_PREFIX + roomId;
  await valkeyHset(key, "host", String(session.hostScore));
  await valkeyHset(key, "opponent", String(session.opponentScore));
  await valkeyHset(key, "player3", String(session.player3Score));
  await valkeyHset(key, "player4", String(session.player4Score));
  await valkeyExpire(key, Math.ceil(BATTLE_TTL / 1000));
}

export async function getBattleScores(roomId: string): Promise<{ hostScore: number; opponentScore: number; player3Score: number; player4Score: number }> {
  return getScoresFromHash(roomId);
}

async function getScoresFromHash(roomId: string): Promise<{ hostScore: number; opponentScore: number; player3Score: number; player4Score: number }> {
  const raw = await valkeyHgetall(SCORE_KEY_PREFIX + roomId);
  return {
    hostScore: Number(raw.host) || 0,
    opponentScore: Number(raw.opponent) || 0,
    player3Score: Number(raw.player3) || 0,
    player4Score: Number(raw.player4) || 0,
  };
}

/**
 * Atomic score increment via HINCRBY — no read-modify-write race.
 * Scores live in a separate Valkey HASH for lock-free concurrent updates.
 */
export async function addBattleScoreForTarget(
  roomId: string,
  target: "host" | "opponent" | "player3" | "player4",
  points: number,
): Promise<void> {
  const session = await getBattleFromStore(roomId);
  if (!session || session.status !== "ACTIVE") return;

  const scoreKey = SCORE_KEY_PREFIX + roomId;
  await valkeyHincrby(scoreKey, target, points);
  const scores = await getScoresFromHash(roomId);

  broadcastToRoom(roomId, "battle_score", {
    hostScore: scores.hostScore,
    opponentScore: scores.opponentScore,
    player3Score: scores.player3Score,
    player4Score: scores.player4Score,
    lastScorer: target,
    points,
  });
}

export async function endBattle(roomId: string): Promise<void> {
  const session = await getBattleFromStore(roomId);
  if (!session) return;

  await valkeySrem(ACTIVE_BATTLES_KEY, roomId);
  await valkeyDel("battle:tick:" + roomId);

  const scores = await getScoresFromHash(roomId);
  session.hostScore = scores.hostScore;
  session.opponentScore = scores.opponentScore;
  session.player3Score = scores.player3Score;
  session.player4Score = scores.player4Score;

  session.status = "ENDED";
  const redTeam = session.hostScore + session.player3Score;
  const blueTeam = session.opponentScore + session.player4Score;

  if (redTeam > blueTeam) session.winner = "host";
  else if (blueTeam > redTeam) session.winner = "opponent";
  else session.winner = "draw";

  await saveBattleToStore(roomId, session);

  broadcastToRoom(roomId, "battle_ended", {
    hostScore: session.hostScore,
    opponentScore: session.opponentScore,
    player3Score: session.player3Score,
    player4Score: session.player4Score,
    winner: session.winner,
    hostName: session.hostName,
    opponentName: session.opponentName,
  });

  setTimeout(async () => {
    const s = await getBattleFromStore(roomId);
    if (s) {
      await deleteBattleFromStore(roomId, s);
    }
    await valkeyDel(SCORE_KEY_PREFIX + roomId);
  }, 10000);
}

export function broadcastBattleState(
  roomId: string,
  session: BattleSession,
): void {
  if (session.endsAt > 0) {
    session.timeLeft = Math.max(
      0,
      Math.round((session.endsAt - Date.now()) / 1000),
    );
  }
  broadcastToRoom(roomId, "battle_state_sync", {
    id: session.id,
    status: session.status,
    hostUserId: session.hostUserId,
    hostName: session.hostName,
    hostRoomId: session.hostRoomId,
    opponentUserId: session.opponentUserId,
    opponentName: session.opponentName,
    opponentRoomId: session.opponentRoomId,
    player3UserId: session.player3UserId,
    player3Name: session.player3Name,
    player4UserId: session.player4UserId,
    player4Name: session.player4Name,
    hostScore: session.hostScore,
    opponentScore: session.opponentScore,
    player3Score: session.player3Score,
    player4Score: session.player4Score,
    timeLeft: session.timeLeft,
    endsAt: session.endsAt,
    winner: session.winner,
    hostReady: session.hostReady,
    opponentReady: session.opponentReady,
  });
}

// ── Distributed battle tick loop ────────────────────────────────

async function processBattleTick(roomId: string): Promise<void> {
  const locked = await valkeySetNx("battle:tick:" + roomId, "1", TICK_LOCK_TTL);
  if (!locked) return;

  try {
    const s = await getBattleFromStore(roomId);
    if (!s || s.status !== "ACTIVE") {
      await valkeySrem(ACTIVE_BATTLES_KEY, roomId);
      return;
    }

    s.timeLeft = Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
    await saveBattleToStore(roomId, s);

    const scores = await getScoresFromHash(roomId);

    broadcastToRoom(roomId, "battle_tick", {
      timeLeft: s.timeLeft,
      hostScore: scores.hostScore,
      opponentScore: scores.opponentScore,
      player3Score: scores.player3Score,
      player4Score: scores.player4Score,
      endsAt: s.endsAt,
    });

    if (s.timeLeft <= 0) {
      await endBattle(roomId);
    }
  } catch (err) {
    logger.error({ err, roomId }, "processBattleTick error");
  }
}

async function globalTickLoop(): Promise<void> {
  if (!isValkeyConfigured()) return;

  try {
    const activeRoomIds = await valkeySmembers(ACTIVE_BATTLES_KEY);
    if (activeRoomIds.length === 0) return;

    await Promise.all(activeRoomIds.map((roomId) => processBattleTick(roomId)));
  } catch (err) {
    logger.error({ err }, "globalTickLoop error");
  }
}

/**
 * Start the distributed battle tick loop.
 * Call once per worker at startup. All workers run this —
 * distributed locks ensure only one worker processes each battle per tick.
 */
export function initBattleTickLoop(): void {
  if (globalTickInterval) return;
  if (!isValkeyConfigured()) {
    logger.warn("Battle tick loop not started — Valkey not configured");
    return;
  }

  globalTickInterval = setInterval(globalTickLoop, 1000);
  logger.info("Distributed battle tick loop started");
}

/**
 * Stop the tick loop (for graceful shutdown).
 */
export function stopBattleTickLoop(): void {
  if (globalTickInterval) {
    clearInterval(globalTickInterval);
    globalTickInterval = null;
  }
}
