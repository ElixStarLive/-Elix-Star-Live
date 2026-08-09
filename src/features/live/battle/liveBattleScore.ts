/**
 * Pure battle score / tick helpers — no React, no duplicate Room/WS.
 */

export function applyBattleTickTime(
  timeLeft: unknown,
): number | null {
  if (typeof timeLeft !== 'number' || !Number.isFinite(timeLeft)) return null;
  return Math.max(0, Math.round(timeLeft));
}

export type BattleScoreFields = {
  hostScore?: number;
  opponentScore?: number;
  player3Score?: number;
  player4Score?: number;
  myScore?: number;
  theirScore?: number;
  scoreA?: number;
  scoreB?: number;
  host?: number;
  opponent?: number;
};

/** Normalize server battle_score / battle_ended score payloads. */
export function normalizeBattleScores(data: unknown): {
  host: number;
  opponent: number;
  player3: number;
  player4: number;
} | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as BattleScoreFields & { players?: Record<string, unknown> };
  const num = (v: unknown, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  if (d.players && typeof d.players === 'object') {
    return {
      host: num(d.players.A1 ?? d.players.host),
      opponent: num(d.players.B1 ?? d.players.opponent),
      player3: num(d.players.A2),
      player4: num(d.players.B2),
    };
  }
  return {
    host: num(d.hostScore ?? d.myScore ?? d.scoreA ?? d.host),
    opponent: num(d.opponentScore ?? d.theirScore ?? d.scoreB ?? d.opponent),
    player3: num(d.player3Score),
    player4: num(d.player4Score),
  };
}

export function normalizeBattleWinner(
  winner: unknown,
  role: string | null,
): 'me' | 'opponent' | 'draw' {
  if (winner === 'host') return role === 'opponent' ? 'opponent' : 'me';
  if (winner === 'opponent') return role === 'opponent' ? 'me' : 'opponent';
  return 'draw';
}

/** Consecutive win streak: win increments, loss resets to 0, draw keeps both. */
export function applyBattleWinStreak(
  prev: { host: number; opponent: number },
  winner: unknown,
): { host: number; opponent: number } {
  const host = Math.max(0, Math.floor(Number(prev.host) || 0));
  const opponent = Math.max(0, Math.floor(Number(prev.opponent) || 0));
  if (winner === 'host') return { host: host + 1, opponent: 0 };
  if (winner === 'opponent') return { host: 0, opponent: opponent + 1 };
  return { host, opponent };
}
