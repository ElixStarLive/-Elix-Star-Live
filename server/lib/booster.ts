/**
 * Point Multiplier Booster — server-authoritative "catch" mechanic.
 *
 * A spectator activates an x3 or x5 glove for a configurable window. While it
 * is active, EACH gift THEY send is rolled independently: most miss (normal
 * points), only a rare catch multiplies battle points. The glove never catches
 * every gift — catch rate is low, hard-capped, and each activation also has a
 * max-catch limit. Clients cannot predict or force a catch.
 */

import crypto from "crypto";
import { getPool } from "./postgres";
import { valkeyGet, valkeySet, isValkeyConfigured } from "./valkey";
import { logger } from "./logger";

const DEFAULTS: Record<string, number> = {
  // ~12% — most gifts miss. Never default near 1.0.
  point_multiplier_catch_rate: 0.12,
  // Hard cap: one glove window can multiply at most this many gifts.
  point_multiplier_max_catches: 3,
  point_multiplier_duration_ms: 30_000,
  point_multiplier_x3_enabled: 1,
  point_multiplier_x5_enabled: 1,
  mist_fog_duration_ms: 30_000,
};

/** Absolute ceiling — config can never make the glove catch every gift. */
const CATCH_RATE_HARD_CAP = 0.25;

let configCache: Record<string, number> | null = null;
let configCacheAt = 0;
const CONFIG_TTL_MS = 30_000;

/** Backend-driven config (booster_config table). Cached briefly; never hardcoded values in the flow. */
async function getBoosterConfig(): Promise<Record<string, number>> {
  const now = Date.now();
  if (configCache && now - configCacheAt < CONFIG_TTL_MS) return configCache;
  const cfg: Record<string, number> = { ...DEFAULTS };
  const db = getPool();
  if (db) {
    try {
      const r = await db.query(`SELECT key, value FROM booster_config`);
      for (const row of r.rows as { key: string; value: string | number }[]) {
        const n = Number(row.value);
        if (Number.isFinite(n)) cfg[row.key] = n;
      }
    } catch (err) {
      logger.warn({ err }, "getBoosterConfig read failed — using defaults/last cache");
      if (configCache) return configCache;
    }
  }
  configCache = cfg;
  configCacheAt = now;
  return cfg;
}

/**
 * Mist Fog booster window (ms), backend-driven. The fog is purely visual (it
 * hides the battle score for everyone except the supported creator), so there is
 * no economic effect and no per-gift resolution — clients self-expire at the
 * broadcast `expires_at`. Duration still comes from config so it is tunable.
 */
export async function getMistFogDurationMs(): Promise<number> {
  const cfg = await getBoosterConfig();
  return Math.max(1000, Math.floor(cfg.mist_fog_duration_ms ?? 30_000));
}

const BOOSTER_KEY_PREFIX = "booster:pm:"; // booster:pm:{roomId}:{userId}

function boosterKey(roomId: string, userId: string): string {
  return `${BOOSTER_KEY_PREFIX}${roomId}:${userId}`;
}

export interface ActiveBooster {
  multiplier: number;
  expiresAt: number;
  /** How many gifts this window has already caught. */
  catchCount: number;
  /** Max catches allowed in this window (copied from config at activation). */
  maxCatches: number;
}

/**
 * Normalize catch rate to 0..CATCH_RATE_HARD_CAP.
 * - Values in (0, 1] are probabilities.
 * - Values > 1 are treated as percentages (35 → 0.35) so a misconfigured row
 *   can never force 100% catch via `rate >= 1`.
 */
function normalizeCatchRate(raw: number): number {
  let rate = Number(raw);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (rate > 1) rate = rate / 100;
  return Math.min(CATCH_RATE_HARD_CAP, Math.max(0, rate));
}

/**
 * Activate a booster for a user in a room. Returns null if the multiplier is
 * invalid/disabled or Valkey is unavailable. Duration comes from config.
 * Only THIS user's gifts are eligible to be caught while active.
 */
export async function activateBooster(
  roomId: string,
  userId: string,
  multiplier: number,
): Promise<{ multiplier: number; durationMs: number; expiresAt: number } | null> {
  if (!roomId || !userId) return null;
  const mult = Math.floor(Number(multiplier));
  if (mult !== 3 && mult !== 5) return null;
  if (!isValkeyConfigured()) return null;

  const cfg = await getBoosterConfig();
  const enabledKey =
    mult === 3 ? "point_multiplier_x3_enabled" : "point_multiplier_x5_enabled";
  if ((cfg[enabledKey] ?? 1) < 1) return null;

  const durationMs = Math.max(1000, Math.floor(cfg.point_multiplier_duration_ms ?? 30_000));
  const maxCatches = Math.max(1, Math.min(10, Math.floor(cfg.point_multiplier_max_catches ?? 3)));
  const expiresAt = Date.now() + durationMs;
  const state: ActiveBooster = {
    multiplier: mult,
    expiresAt,
    catchCount: 0,
    maxCatches,
  };
  await valkeySet(boosterKey(roomId, userId), JSON.stringify(state), durationMs);
  return { multiplier: mult, durationMs, expiresAt };
}

async function getActiveBooster(
  roomId: string,
  userId: string,
): Promise<ActiveBooster | null> {
  if (!isValkeyConfigured()) return null;
  try {
    const raw = await valkeyGet(boosterKey(roomId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveBooster;
    if (!parsed || typeof parsed.multiplier !== "number") return null;
    if (Date.now() > Number(parsed.expiresAt || 0)) return null;
    return {
      multiplier: parsed.multiplier,
      expiresAt: Number(parsed.expiresAt) || 0,
      catchCount: Math.max(0, Math.floor(Number(parsed.catchCount) || 0)),
      maxCatches: Math.max(1, Math.floor(Number(parsed.maxCatches) || 3)),
    };
  } catch {
    return null;
  }
}

async function saveActiveBooster(
  roomId: string,
  userId: string,
  state: ActiveBooster,
): Promise<void> {
  const ttlMs = Math.max(1, state.expiresAt - Date.now());
  await valkeySet(boosterKey(roomId, userId), JSON.stringify(state), ttlMs);
}

/** Cryptographically-random catch roll — clients cannot predict or manipulate. */
function rollCatch(catchRate: number): boolean {
  const rate = normalizeCatchRate(catchRate);
  if (rate <= 0) return false;
  // Never short-circuit to "always catch" — even a misconfigured 1.0 is capped.
  const u = crypto.randomInt(0, 1_000_000) / 1_000_000;
  return u < rate;
}

export interface CatchResult {
  hadBooster: boolean;
  caught: boolean;
  multiplier: number;
  finalPoints: number;
}

/**
 * Resolve whether an active booster catches this gift, compute the final battle
 * points, and persist an audit row. Idempotent per transactionId: if the same
 * transaction is resolved twice, the originally-persisted outcome is returned
 * (replay-safe), so battle points can never be inflated by replays.
 *
 * Rules (enforced here, never on the client):
 * - Only the spectator who activated the glove can have THEIR gifts rolled.
 * - Each gift is rolled independently — most miss, some catch.
 * - After maxCatches successes in the window, every further gift misses.
 */
export async function resolveBoosterCatch(
  roomId: string,
  userId: string,
  transactionId: string,
  giftId: string,
  basePoints: number,
): Promise<CatchResult> {
  const noBooster: CatchResult = {
    hadBooster: false,
    caught: false,
    multiplier: 1,
    finalPoints: basePoints,
  };
  if (!transactionId) return noBooster;

  // Replay-safe: if this gift was already resolved, return the original outcome
  // BEFORE rolling or bumping catchCount (prevents double-count / double-catch).
  const db = getPool();
  if (db) {
    try {
      const existing = await db.query(
        `SELECT caught, final_points, multiplier FROM booster_catch_logs WHERE transaction_id = $1 LIMIT 1`,
        [transactionId],
      );
      const row = existing.rows[0] as
        | { caught?: boolean; final_points?: number; multiplier?: number }
        | undefined;
      if (row) {
        return {
          hadBooster: true,
          caught: Boolean(row.caught),
          multiplier: Number(row.multiplier) || 1,
          finalPoints: Number(row.final_points) || basePoints,
        };
      }
    } catch {
      /* table may not exist yet — continue with live roll */
    }
  }

  const active = await getActiveBooster(roomId, userId);
  if (!active) return noBooster;

  const cfg = await getBoosterConfig();
  const catchRate = normalizeCatchRate(
    cfg.point_multiplier_catch_rate ?? DEFAULTS.point_multiplier_catch_rate,
  );
  const multiplier = active.multiplier;

  // Cap already reached for this glove window → always normal points.
  let caught = false;
  if (active.catchCount < active.maxCatches) {
    caught = rollCatch(catchRate);
  }

  const finalPoints = caught ? basePoints * multiplier : basePoints;

  if (caught) {
    try {
      await saveActiveBooster(roomId, userId, {
        ...active,
        catchCount: active.catchCount + 1,
      });
    } catch (err) {
      logger.warn({ err, roomId, userId }, "resolveBoosterCatch catchCount save failed");
    }
  }

  if (db) {
    try {
      await db.query(
        `INSERT INTO booster_catch_logs
           (room_id, user_id, transaction_id, gift_id, multiplier, base_points, final_points, caught, catch_rate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (transaction_id) DO NOTHING`,
        [roomId, userId, transactionId, giftId, multiplier, basePoints, finalPoints, caught, catchRate],
      );
    } catch (err) {
      logger.warn({ err, transactionId }, "resolveBoosterCatch audit insert failed");
    }
  }

  return { hadBooster: true, caught, multiplier, finalPoints };
}
