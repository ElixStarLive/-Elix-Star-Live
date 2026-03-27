import { broadcastToRoom } from "./index";
import { isValkeyConfigured, valkeySet, valkeyGet, valkeyDel } from "../lib/valkey";

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
  timer: ReturnType<typeof setInterval> | null;
  createdAt: number;
  hostReady: boolean;
  opponentReady: boolean;
}

const BATTLE_TTL = 600_000;

export const battles = new Map<string, BattleSession>();
export const userBattleRoom = new Map<string, string>();

// ── Valkey store helpers ─────────────────────────────────────────

export async function getBattleFromStore(
  roomId: string,
): Promise<BattleSession | null> {
  if (isValkeyConfigured()) {
    try {
      const raw = await valkeyGet("battle:" + roomId);
      if (raw) {
        const parsed = JSON.parse(raw) as BattleSession;
        parsed.timer = null;
        const local = battles.get(roomId);
        if (local?.timer) parsed.timer = local.timer;
        return parsed;
      }
    } catch {
      /* fall through to local Map */
    }
  }
  return battles.get(roomId) ?? null;
}

async function saveBattleToStore(
  roomId: string,
  session: BattleSession,
): Promise<void> {
  battles.set(roomId, session);
  if (isValkeyConfigured()) {
    try {
      const { timer: _timer, ...serializable } = session;
      await valkeySet(
        "battle:" + roomId,
        JSON.stringify({ ...serializable, timer: null }),
        BATTLE_TTL,
      );
    } catch {
      /* best effort */
    }
  }
}

async function deleteBattleFromStore(
  roomId: string,
  session: BattleSession,
): Promise<void> {
  battles.delete(roomId);
  userBattleRoom.delete(session.hostUserId);
  if (session.opponentUserId) userBattleRoom.delete(session.opponentUserId);
  if (session.player3UserId) userBattleRoom.delete(session.player3UserId);
  if (session.player4UserId) userBattleRoom.delete(session.player4UserId);
  if (isValkeyConfigured()) {
    try {
      await valkeyDel("battle:" + roomId);
      await valkeyDel("ubr:" + session.hostUserId);
      if (session.opponentUserId)
        await valkeyDel("ubr:" + session.opponentUserId);
      if (session.player3UserId)
        await valkeyDel("ubr:" + session.player3UserId);
      if (session.player4UserId)
        await valkeyDel("ubr:" + session.player4UserId);
    } catch {
      /* best effort */
    }
  }
}

// ── Battle functions ─────────────────────────────────────────────

export async function createBattle(
  hostRoomId: string,
  hostUserId: string,
  hostName: string,
): Promise<BattleSession> {
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
  userBattleRoom.set(hostUserId, hostRoomId);
  await saveBattleToStore(hostRoomId, session);
  if (isValkeyConfigured()) {
    try {
      await valkeySet("ubr:" + hostUserId, hostRoomId, BATTLE_TTL);
    } catch {
      /* best effort */
    }
  }
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

  userBattleRoom.set(userId, roomId);
  if (isValkeyConfigured()) {
    try {
      await valkeySet("ubr:" + userId, roomId, BATTLE_TTL);
    } catch {
      /* best effort */
    }
  }
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
  broadcastBattleState(roomId, session);

  const timerHandle = setInterval(async () => {
    const s = await getBattleFromStore(roomId);
    if (!s || s.status !== "ACTIVE") {
      clearInterval(timerHandle);
      const local = battles.get(roomId);
      if (local) local.timer = null;
      return;
    }
    s.timeLeft = Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
    await saveBattleToStore(roomId, s);

    broadcastToRoom(roomId, "battle_tick", {
      timeLeft: s.timeLeft,
      hostScore: s.hostScore,
      opponentScore: s.opponentScore,
      player3Score: s.player3Score,
      player4Score: s.player4Score,
      endsAt: s.endsAt,
    });

    if (s.timeLeft <= 0) await endBattle(roomId);
  }, 1000);

  const current = battles.get(roomId);
  if (current) current.timer = timerHandle;
}

export async function addBattleScoreForTarget(
  roomId: string,
  target: "host" | "opponent" | "player3" | "player4",
  points: number,
): Promise<void> {
  const session = await getBattleFromStore(roomId);
  if (!session || session.status !== "ACTIVE") return;

  if (target === "host") session.hostScore += points;
  else if (target === "opponent") session.opponentScore += points;
  else if (target === "player3") session.player3Score += points;
  else if (target === "player4") session.player4Score += points;

  await saveBattleToStore(roomId, session);

  broadcastToRoom(roomId, "battle_score", {
    hostScore: session.hostScore,
    opponentScore: session.opponentScore,
    player3Score: session.player3Score,
    player4Score: session.player4Score,
    lastScorer: target,
    points,
  });
}

export async function endBattle(roomId: string): Promise<void> {
  const session = await getBattleFromStore(roomId);
  if (!session) return;

  const localSession = battles.get(roomId);
  if (localSession?.timer) {
    clearInterval(localSession.timer);
    localSession.timer = null;
  }

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
