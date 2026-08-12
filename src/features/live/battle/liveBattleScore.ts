/**
 * Pure battle score / tick helpers — single owner for server score payloads.
 * Controllers apply battle_score / battle_state_sync / battle_ended through this API.
 * No React, no Room/WS binding here.
 */

export function applyBattleTickTime(
  timeLeft: unknown,
): number | null {
  if (typeof timeLeft !== 'number' || !Number.isFinite(timeLeft)) return null;
  return Math.max(0, Math.round(timeLeft));
}

/** Authoritative host / opponent / P3 / P4 totals (never role-swapped). */
export type BattleServerTotals = {
  h: number;
  o: number;
  p3: number;
  p4: number;
};

export const EMPTY_BATTLE_SERVER_TOTALS: BattleServerTotals = {
  h: 0,
  o: 0,
  p3: 0,
  p4: 0,
};

export type BattleScoreFields = {
  hostScore?: number;
  opponentScore?: number;
  player3Score?: number;
  player4Score?: number;
  host_score?: number;
  opponent_score?: number;
  player3_score?: number;
  player4_score?: number;
  myScore?: number;
  theirScore?: number;
  scoreA?: number;
  scoreB?: number;
  host?: number;
  opponent?: number;
};

export type BattleScoreApplyResult = {
  totals: BattleServerTotals;
  prev: BattleServerTotals;
  redDelta: number;
  blueDelta: number;
  redTotal: number;
  blueTotal: number;
  prevRedTotal: number;
  prevBlueTotal: number;
  changed: boolean;
  /** Side whose score rose more this update (for battle VFX). */
  vfx: { side: 'red' | 'blue'; delta: number } | null;
  /** Lead taunt when the leading team gained ≥ 25 this update. */
  leadTaunt: { side: 'host' | 'opponent'; gain: number } | null;
};

function pickScore(v: unknown, fallback: number): number {
  if (v === undefined || v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function readTotalsFromPayload(
  data: unknown,
  prev: BattleServerTotals,
): BattleServerTotals {
  if (!data || typeof data !== 'object') return { ...prev };
  const d = data as BattleScoreFields & { players?: Record<string, unknown> };
  if (d.players && typeof d.players === 'object') {
    return {
      h: pickScore(d.players.A1 ?? d.players.host, prev.h),
      o: pickScore(d.players.B1 ?? d.players.opponent, prev.o),
      p3: pickScore(d.players.A2, prev.p3),
      p4: pickScore(d.players.B2, prev.p4),
    };
  }
  return {
    h: pickScore(d.hostScore ?? d.host_score, prev.h),
    o: pickScore(d.opponentScore ?? d.opponent_score, prev.o),
    p3: pickScore(d.player3Score ?? d.player3_score, prev.p3),
    p4: pickScore(d.player4Score ?? d.player4_score, prev.p4),
  };
}

/**
 * Apply server score fields into totals.
 * Missing fields keep previous values (server is source of truth when present).
 * Used for battle_score, battle_state_sync, and battle_ended.
 */
export function applyServerBattleScorePayload(
  prev: BattleServerTotals,
  data: unknown,
): BattleScoreApplyResult {
  const safePrev: BattleServerTotals = {
    h: pickScore(prev?.h, 0),
    o: pickScore(prev?.o, 0),
    p3: pickScore(prev?.p3, 0),
    p4: pickScore(prev?.p4, 0),
  };
  const totals = readTotalsFromPayload(data, safePrev);
  const redDelta = totals.h - safePrev.h + (totals.p3 - safePrev.p3);
  const blueDelta = totals.o - safePrev.o + (totals.p4 - safePrev.p4);
  const redTotal = totals.h + totals.p3;
  const blueTotal = totals.o + totals.p4;
  const prevRedTotal = safePrev.h + safePrev.p3;
  const prevBlueTotal = safePrev.o + safePrev.p4;
  const changed =
    totals.h !== safePrev.h ||
    totals.o !== safePrev.o ||
    totals.p3 !== safePrev.p3 ||
    totals.p4 !== safePrev.p4;

  let vfx: BattleScoreApplyResult['vfx'] = null;
  if (redDelta > blueDelta && redDelta > 0) vfx = { side: 'red', delta: redDelta };
  else if (blueDelta > 0) vfx = { side: 'blue', delta: blueDelta };

  let leadTaunt: BattleScoreApplyResult['leadTaunt'] = null;
  const redGain = redTotal - prevRedTotal;
  const blueGain = blueTotal - prevBlueTotal;
  if (redTotal > blueTotal && redGain >= 25) {
    leadTaunt = { side: 'host', gain: redGain };
  } else if (blueTotal > redTotal && blueGain >= 25) {
    leadTaunt = { side: 'opponent', gain: blueGain };
  }

  return {
    totals,
    prev: safePrev,
    redDelta,
    blueDelta,
    redTotal,
    blueTotal,
    prevRedTotal,
    prevBlueTotal,
    changed,
    vfx,
    leadTaunt,
  };
}

export function teamTotalsFromScores(totals: BattleServerTotals): {
  red: number;
  blue: number;
} {
  // 4-creator Battle = 2v2 teams (authoritative):
  // Team A / red  = host (C1) + player3 (C3)
  // Team B / blue = opponent (C2) + player4 (C4)
  // Main Battle score / WIN-LOSS uses these combined totals only.
  return {
    red: (totals?.h || 0) + (totals?.p3 || 0),
    blue: (totals?.o || 0) + (totals?.p4 || 0),
  };
}

/** Team winner from server totals: red=host+P3, blue=opponent+P4. */
function determineTeamWinnerFromTotals(
  totals: BattleServerTotals,
): 'host' | 'opponent' | 'draw' {
  const { red, blue } = teamTotalsFromScores(totals);
  if (red === blue) return 'draw';
  return red > blue ? 'host' : 'opponent';
}

/** Host-perspective winner label used by determine4PlayerWinner. */
export function determinePerspectiveWinner(
  totals: BattleServerTotals,
): 'me' | 'opponent' | 'draw' {
  const team = determineTeamWinnerFromTotals(totals);
  if (team === 'draw') return 'draw';
  return team === 'host' ? 'me' : 'opponent';
}

/**
 * Prefer explicit server `winner`; otherwise derive from server score totals.
 * Never invent scores — only uses totals already applied from the server.
 */
export function resolveServerBattleWinner(
  winner: unknown,
  totals: BattleServerTotals,
): 'host' | 'opponent' | 'draw' {
  if (winner === 'host' || winner === 'opponent' || winner === 'draw') return winner;
  return determineTeamWinnerFromTotals(totals);
}

export function scoresForBattleRole(
  totals: BattleServerTotals,
  role: string | null,
): { myScore: number; opponentScore: number } {
  if (role === 'opponent') {
    return { myScore: totals.o, opponentScore: totals.h };
  }
  return { myScore: totals.h, opponentScore: totals.o };
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
