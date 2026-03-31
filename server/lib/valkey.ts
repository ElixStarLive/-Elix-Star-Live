import Redis from "ioredis";
import { logger } from "./logger";

let client: Redis | null = null;
let subscriber: Redis | null = null;
let publisher: Redis | null = null;

function getUrl(): string | null {
  return (
    process.env.VALKEY_URL ||
    process.env.REDIS_URL ||
    null
  );
}

export function isValkeyConfigured(): boolean {
  return Boolean(getUrl());
}

function createConnection(label: string): Redis | null {
  const url = getUrl();
  if (!url) return null;

  const conn = new Redis(url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      return Math.min(times * 500, 10_000);
    },
    lazyConnect: false,
    enableReadyCheck: true,
    connectTimeout: 5000,
    commandTimeout: 5000,
    enableAutoPipelining: true,
  });

  conn.on("connect", () =>
    logger.info({ label }, "Valkey connected"),
  );
  conn.on("error", (err) =>
    logger.error({ label, err: err.message }, "Valkey error"),
  );
  conn.on("close", () => {
    logger.warn({ label }, "Valkey connection closed");
    if (label === "valkey-main") client = null;
    else if (label === "valkey-pub") publisher = null;
    else if (label === "valkey-sub") subscriber = null;
  });

  return conn;
}

export function getValkey(): Redis | null {
  if (!client && getUrl()) {
    client = createConnection("valkey-main");
  }
  return client;
}

export function getValkeyPublisher(): Redis | null {
  if (!publisher && getUrl()) {
    publisher = createConnection("valkey-pub");
  }
  return publisher;
}

export function getValkeySubscriber(): Redis | null {
  if (!subscriber && getUrl()) {
    subscriber = createConnection("valkey-sub");
  }
  return subscriber;
}

export async function valkeyHealthCheck(): Promise<boolean> {
  try {
    const v = getValkey();
    if (!v) return false;
    const result = await v.ping();
    return result === "PONG";
  } catch (err: any) {
    logger.warn({ err: err?.message }, "valkeyHealthCheck failed");
    return false;
  }
}

/**
 * Block startup until the main Valkey connection answers PING (or attempts exhausted).
 * No HTTP listen should run before this in production when Valkey is required.
 */
export async function waitForValkeyReady(opts?: { attempts?: number; delayMs?: number }): Promise<void> {
  if (!isValkeyConfigured()) return;
  const attempts = Math.max(1, opts?.attempts ?? 40);
  const delayMs = Math.max(50, opts?.delayMs ?? 500);
  for (let i = 0; i < attempts; i++) {
    if (await valkeyHealthCheck()) {
      if (i > 0) logger.info({ attempts: i + 1 }, "Valkey became ready");
      return;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `Valkey not ready after ${attempts} attempts (${attempts * delayMs}ms max wait) — check VALKEY_URL / REDIS_URL and network`,
  );
}

/** Graceful shutdown: close ioredis connections (main, pub, sub). */
export async function closeValkeyConnections(): Promise<void> {
  const conns: { label: string; c: Redis | null }[] = [
    { label: "valkey-main", c: client },
    { label: "valkey-pub", c: publisher },
    { label: "valkey-sub", c: subscriber },
  ];
  await Promise.all(
    conns.map(async ({ label, c }) => {
      if (!c) return;
      try {
        await c.quit();
      } catch (err: unknown) {
        logger.warn({ err: err instanceof Error ? err.message : err, label }, "Valkey quit failed");
      }
    }),
  );
  client = null;
  publisher = null;
  subscriber = null;
}

// ── Rate limiting via Valkey sliding window ──────────────────────

export async function valkeyRateCheck(
  key: string,
  windowMs: number,
  max: number,
): Promise<boolean> {
  const v = getValkey();
  if (!v) {
    throw new Error("Valkey not available for rate check");
  }

  const now = Date.now();
  const windowStart = now - windowMs;
  const member = `${now}:${Math.random().toString(36).slice(2, 6)}`;

  const pipeline = v.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, member);
  pipeline.zcard(key);
  pipeline.pexpire(key, windowMs + 1000);

  const results = await pipeline.exec();
  if (!results) {
    throw new Error("Valkey rate-check pipeline returned null");
  }

  const count = (results[2]?.[1] as number) ?? 0;
  return count <= max;
}

// ── Pub/Sub helpers ──────────────────────────────────────────────

export function valkeyPublish(
  channel: string,
  data: Record<string, unknown>,
): void {
  const pub = getValkeyPublisher();
  if (!pub) return;

  try {
    pub.publish(channel, JSON.stringify(data));
  } catch (err: any) {
    logger.warn({ err: err?.message, channel }, "valkeyPublish failed");
  }
}

export function valkeySubscribe(
  channel: string,
  handler: (data: any) => void,
): void {
  const sub = getValkeySubscriber();
  if (!sub) return;

  sub.subscribe(channel).catch((err) =>
    logger.error({ err, channel }, "Valkey subscribe failed"),
  );

  sub.on("message", (ch, message) => {
    if (ch !== channel) return;
    try {
      handler(JSON.parse(message));
    } catch (err: any) {
      logger.warn(
        { err: err?.message, channel },
        "valkeySubscribe message parse failed",
      );
    }
  });
}

export function valkeyPSubscribe(
  pattern: string,
  handler: (channel: string, data: any) => void,
): void {
  const sub = getValkeySubscriber();
  if (!sub) return;

  sub.psubscribe(pattern).catch((err) =>
    logger.error({ err, pattern }, "Valkey psubscribe failed"),
  );

  sub.on("pmessage", (_pat, ch, message) => {
    try {
      handler(ch, JSON.parse(message));
    } catch (err: any) {
      logger.warn(
        { err: err?.message, pattern, channel: ch },
        "valkeyPSubscribe message parse failed",
      );
    }
  });
}

// ── Key-value helpers with TTL ───────────────────────────────────

export async function valkeySet(
  key: string,
  value: string | Record<string, unknown>,
  ttlMs?: number,
): Promise<void> {
  const v = getValkey();
  if (!v) return;

  const strVal =
    typeof value === "string" ? value : JSON.stringify(value);

  try {
    if (ttlMs) {
      await v.set(key, strVal, "PX", ttlMs);
    } else {
      await v.set(key, strVal);
    }
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeySet failed");
  }
}

export async function valkeyGet(key: string): Promise<string | null> {
  const v = getValkey();
  if (!v) return null;

  try {
    return await v.get(key);
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeyGet failed");
    return null;
  }
}

export async function valkeyDel(key: string): Promise<void> {
  const v = getValkey();
  if (!v) return;

  try {
    await v.del(key);
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeyDel failed");
  }
}

export async function valkeyExists(key: string): Promise<boolean> {
  const v = getValkey();
  if (!v) return false;

  try {
    return (await v.exists(key)) === 1;
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeyExists failed");
    return false;
  }
}

// ── Set operations (SADD / SREM / SCARD / SMEMBERS) ─────────────

export async function valkeySadd(key: string, ...members: string[]): Promise<number> {
  const v = getValkey();
  if (!v || members.length === 0) return 0;
  try {
    return await v.sadd(key, ...members);
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeySadd failed");
    return 0;
  }
}

export async function valkeySrem(key: string, ...members: string[]): Promise<number> {
  const v = getValkey();
  if (!v || members.length === 0) return 0;
  try {
    return await v.srem(key, ...members);
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeySrem failed");
    return 0;
  }
}

export async function valkeyScard(key: string): Promise<number> {
  const v = getValkey();
  if (!v) return 0;
  try {
    return await v.scard(key);
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeyScard failed");
    return 0;
  }
}

export async function valkeySmembers(key: string): Promise<string[]> {
  const v = getValkey();
  if (!v) return [];
  try {
    return await v.smembers(key);
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeySmembers failed");
    return [];
  }
}

export async function valkeySismember(key: string, member: string): Promise<boolean> {
  const v = getValkey();
  if (!v) return false;
  try {
    return (await v.sismember(key, member)) === 1;
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeySismember failed");
    return false;
  }
}

// ── Hash operations (HSET / HGET / HDEL / HGETALL) ──────────────

export async function valkeyHset(key: string, field: string, value: string): Promise<void> {
  const v = getValkey();
  if (!v) return;
  try {
    await v.hset(key, field, value);
  } catch (err: any) {
    logger.warn({ err: err?.message, key, field }, "valkeyHset failed");
  }
}

export async function valkeyHget(key: string, field: string): Promise<string | null> {
  const v = getValkey();
  if (!v) return null;
  try {
    return await v.hget(key, field);
  } catch (err: any) {
    logger.warn({ err: err?.message, key, field }, "valkeyHget failed");
    return null;
  }
}

export async function valkeyHdel(key: string, ...fields: string[]): Promise<void> {
  const v = getValkey();
  if (!v || fields.length === 0) return;
  try {
    await v.hdel(key, ...fields);
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeyHdel failed");
  }
}

export async function valkeyHgetall(key: string): Promise<Record<string, string>> {
  const v = getValkey();
  if (!v) return {};
  try {
    return (await v.hgetall(key)) || {};
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeyHgetall failed");
    return {};
  }
}

/** One Valkey round-trip for many HGETALL (e.g. live stream room metadata). */
export async function valkeyHgetallBatch(
  keys: string[],
): Promise<Record<string, string>[]> {
  const v = getValkey();
  if (!v || keys.length === 0) return keys.map(() => ({}));
  try {
    const pipe = v.pipeline();
    for (const k of keys) {
      pipe.hgetall(k);
    }
    const raw = await pipe.exec();
    if (!raw) return keys.map(() => ({}));
    return raw.map(([err, res]) => {
      if (err || res == null || typeof res !== "object") return {};
      return res as Record<string, string>;
    });
  } catch (err: any) {
    logger.warn({ err: err?.message, n: keys.length }, "valkeyHgetallBatch failed");
    return keys.map(() => ({}));
  }
}

export async function valkeyHincrby(key: string, field: string, increment: number): Promise<number> {
  const v = getValkey();
  if (!v) return 0;
  try {
    return await v.hincrby(key, field, increment);
  } catch (err: any) {
    logger.warn({ err: err?.message, key, field }, "valkeyHincrby failed");
    return 0;
  }
}

export async function valkeyExpire(key: string, ttlSeconds: number): Promise<void> {
  const v = getValkey();
  if (!v) return;
  try {
    await v.expire(key, ttlSeconds);
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeyExpire failed");
  }
}

/**
 * Distributed lock via SET NX PX.
 * Returns true if lock was acquired, false if another holder has it.
 */
export async function valkeySetNx(key: string, value: string, ttlMs: number): Promise<boolean> {
  const v = getValkey();
  if (!v) return false;
  try {
    const result = await v.set(key, value, "PX", ttlMs, "NX");
    return result === "OK";
  } catch (err: any) {
    logger.warn({ err: err?.message, key }, "valkeySetNx failed");
    return false;
  }
}

// ── Cache stampede protection ────────────────────────────────────

const STAMPEDE_LOCK_TTL_MS = 15_000;
const STAMPEDE_WAIT_ATTEMPTS = 20;
const STAMPEDE_WAIT_INTERVAL_MS = 100;

/**
 * Try to acquire a short-lived build lock for a cache key.
 * Returns true if this caller should build the cache.
 * Returns true when Valkey is unavailable (single-caller fallback).
 */
export async function acquireCacheBuildLock(cacheKey: string, ttlMs = STAMPEDE_LOCK_TTL_MS): Promise<boolean> {
  const v = getValkey();
  if (!v) return true;
  try {
    const result = await v.set(`lock:${cacheKey}`, "1", "PX", ttlMs, "NX");
    return result === "OK";
  } catch (err: any) {
    logger.warn({ err: err?.message, cacheKey }, "acquireCacheBuildLock failed — allowing build (Valkey unavailable)");
    return true;
  }
}

/**
 * Poll Valkey until cacheKey is populated or attempts exhausted.
 * Used by non-builder workers during stampede protection.
 */
export async function waitForCachePopulate(
  cacheKey: string,
  attempts = STAMPEDE_WAIT_ATTEMPTS,
  intervalMs = STAMPEDE_WAIT_INTERVAL_MS,
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const raw = await valkeyGet(cacheKey);
      if (raw) return raw;
    } catch (err: any) {
      logger.warn({ err: err?.message, cacheKey, attempt: i + 1 }, "waitForCachePopulate poll error");
    }
  }
  return null;
}
