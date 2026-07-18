/**
 * Point Multiplier Booster — server-authoritative "catch" mechanic.
 *
 * A spectator activates an x3 or x5 booster for a configurable window. While it
 * is active, every gift they send has a configurable, server-side random chance
 * to be "caught". A caught gift multiplies its battle points by the multiplier;
 * an uncaught gift scores normally. Clients can never predict or force a catch:
 * the roll is done here with crypto randomness and every attempt is audited.
 */

import crypto from "crypto";
import { getPool } from "./postgres";
import { valkeyGet, valkeySet, isValkeyConfigured } from "./valkey";
import { logger } from "./logger";

const DEFAULTS: Record<string, number> = {
  point_multiplier_catch_rate: 0.35,
  point_multiplier_duration_ms: 30_000,
  point_multiplier_x3_enabled: 1,
  point_multiplier_x5_enabled: 1,
};

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

const BOOSTER_KEY_PREFIX = "booster:pm:"; // booster:pm:{roomId}:{userId}

function boosterKey(roomId: string, userId: string): string {
  return `${BOOSTER_KEY_PREFIX}${roomId}:${userId}`;
}

export interface ActiveBooster {
  multiplier: number;
  expiresAt: number;
}

/**
 * Activate a booster for a user in a room. Returns null if the multiplier is
 * invalid/disabled or Valkey is unavailable. Duration comes from config.
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
  const expiresAt = Date.now() + durationMs;
  await valkeySet(
    boosterKey(roomId, userId),
    JSON.stringify({ multiplier: mult, expiresAt }),
    durationMs,
  );
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
    return parsed;
  } catch {
    return null;
  }
}

/** Cryptographically-random catch roll — clients cannot predict or manipulate. */
function rollCatch(catchRate: number): boolean {
  const rate = Math.min(1, Math.max(0, catchRate));
  if (rate <= 0) return false;
  if (rate >= 1) return true;
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

  const active = await getActiveBooster(roomId, userId);
  if (!active) return noBooster;

  const cfg = await getBoosterConfig();
  const catchRate = cfg.point_multiplier_catch_rate ?? 0.35;
  const multiplier = active.multiplier;
  const caught = rollCatch(catchRate);
  const finalPoints = caught ? basePoints * multiplier : basePoints;

  const db = getPool();
  if (db) {
    try {
      const ins = await db.query(
        `INSERT INTO booster_catch_logs
           (room_id, user_id, transaction_id, gift_id, multiplier, base_points, final_points, caught, catch_rate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (transaction_id) DO NOTHING
         RETURNING caught, final_points, multiplier`,
        [roomId, userId, transactionId, giftId, multiplier, basePoints, finalPoints, caught, catchRate],
      );
      if ((ins.rowCount ?? 0) === 0) {
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
            multiplier: Number(row.multiplier) || multiplier,
            finalPoints: Number(row.final_points) || basePoints,
          };
        }
      }
    } catch (err) {
      logger.warn({ err, transactionId }, "resolveBoosterCatch audit insert failed");
    }
  }

  return { hadBooster: true, caught, multiplier, finalPoints };
}
