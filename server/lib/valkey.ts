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
  // A closed socket is not a dead client: ioredis reconnects this same instance
  // via `retryStrategy`. Dropping the module's reference here did two harmful
  // things — the next `getValkey()` built a *second* connection while the first
  // kept retrying, so a flapping Valkey multiplied connections; and shutdown had
  // nothing left to close, so a process could never stop a retry loop it no
  // longer had a handle on. Only explicit teardown clears these.
  conn.on("close", () => {
    logger.warn({ label }, "Valkey connection closed");
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
    if (!v) {
      return false;
    }
    const result = await v.ping();
    return result === "PONG";
  } catch (err) {
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

/** How long a graceful QUIT may take before the socket is dropped outright. */
const VALKEY_QUIT_TIMEOUT_MS = 3_000;

/**
 * Shutdown: close ioredis connections (main, pub, sub).
 *
 * QUIT is sent first so an established connection ends cleanly, but it is only
 * given a bounded time and the socket is dropped either way. A connection that
 * never came up cannot answer QUIT at all — ioredis simply keeps retrying, which
 * is how `npm run migrate` (the deploy's release command) finished its work and
 * then never exited.
 */
export async function closeValkeyConnections(): Promise<void> {
  const conns: { label: string; c: Redis | null }[] = [
    { label: "valkey-main", c: client },
    { label: "valkey-pub", c: publisher },
    { label: "valkey-sub", c: subscriber },
  ];
  client = null;
  publisher = null;
  subscriber = null;
  await Promise.all(
    conns.map(async ({ label, c }) => {
      if (!c) return;
      try {
        await Promise.race([
          c.quit(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("quit timed out")), VALKEY_QUIT_TIMEOUT_MS).unref(),
          ),
        ]);
      } catch (err: unknown) {
        logger.warn({ err: err instanceof Error ? err.message : err, label }, "Valkey quit failed");
      } finally {
        // Stops the retry loop and releases the handle whether QUIT worked or not.
        try {
          c.disconnect();
        } catch {
          /* already gone */
        }
      }
    }),
  );
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
  } catch (err) {
    logger.warn({ err: err?.message, channel }, "valkeyPublish failed");
  }
}

/**
 * Channel-routed subscribe.
 *
 * A single "message" listener on the shared subscriber connection dispatches to
 * the handlers registered for each channel. This lets callers SUBSCRIBE and
 * UNSUBSCRIBE individual channels dynamically (per live room / per user) without
 * leaking one Node event listener per subscription and without a global
 * `PSUBSCRIBE room:*` that forces every instance to receive every room's traffic.
 */
type ChannelHandler = (data: unknown) => void;

const channelHandlers = new Map<string, Set<ChannelHandler>>();
let boundDispatcherConn: Redis | null = null;

function ensureMessageDispatcher(sub: Redis): void {
  if (boundDispatcherConn === sub) return;
  boundDispatcherConn = sub;

  sub.on("message", (channel: string, message: string) => {
    const handlers = channelHandlers.get(channel);
    if (!handlers || handlers.size === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch (err) {
      logger.warn(
        { err: (err as Error)?.message, channel },
        "valkeySubscribe message parse failed",
      );
      return;
    }
    for (const handler of handlers) {
      try {
        handler(parsed);
      } catch (err) {
        logger.warn(
          { err: (err as Error)?.message, channel },
          "valkeySubscribe handler threw",
        );
      }
    }
  });

  // If the subscriber reconnected as a fresh connection, re-subscribe every
  // channel we still have handlers for so cross-instance routing survives.
  const known = [...channelHandlers.keys()];
  if (known.length > 0) {
    sub.subscribe(...known).catch((err) =>
      logger.error({ err, channels: known.length }, "Valkey re-subscribe failed"),
    );
  }
}

export function valkeySubscribe(
  channel: string,
  handler: ChannelHandler,
): void {
  const sub = getValkeySubscriber();
  if (!sub) return;
  ensureMessageDispatcher(sub);

  let handlers = channelHandlers.get(channel);
  if (!handlers) {
    handlers = new Set();
    channelHandlers.set(channel, handlers);
    sub.subscribe(channel).catch((err) =>
      logger.error({ err, channel }, "Valkey subscribe failed"),
    );
  }
  handlers.add(handler);
}

/**
 * Remove a handler (or all handlers) for a channel. When the last handler for a
 * channel is removed we UNSUBSCRIBE from Valkey so this instance stops receiving
 * traffic for rooms/users it no longer hosts.
 */
export function valkeyUnsubscribe(
  channel: string,
  handler?: ChannelHandler,
): void {
  const handlers = channelHandlers.get(channel);
  if (!handlers) return;

  if (handler) handlers.delete(handler);
  else handlers.clear();

  if (handlers.size === 0) {
    channelHandlers.delete(channel);
    const sub = getValkeySubscriber();
    sub?.unsubscribe(channel).catch((err) =>
      logger.warn(
        { err: (err as Error)?.message, channel },
        "Valkey unsubscribe failed",
      ),
    );
  }
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
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeySet failed");
  }
}

/**
 * SET for callers that must know the write landed. `valkeySet` logs and returns
 * void, so a failed write is indistinguishable from a stored one — fine for
 * caches, wrong for state a client is told to trust (a seat table whose write
 * was dropped would still be reported as the new stage).
 */
export async function valkeyTrySet(
  key: string,
  value: string,
  ttlMs?: number,
): Promise<"ok" | "unavailable"> {
  const v = getValkey();
  if (!v) return "unavailable";
  try {
    if (ttlMs) {
      await v.set(key, value, "PX", ttlMs);
    } else {
      await v.set(key, value);
    }
    return "ok";
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeyTrySet failed");
    return "unavailable";
  }
}

export async function valkeyGet(key: string): Promise<string | null> {
  const v = getValkey();
  if (!v) return null;

  try {
    return await v.get(key);
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeyGet failed");
    return null;
  }
}

/**
 * GET for callers that must tell an absent key apart from a Valkey failure.
 * `valkeyGet` answers `null` for both, which reads as "this does not exist" and
 * lets an outage look like normal absence. Callers deciding who receives money
 * need the difference.
 */
export async function valkeyTryGet(
  key: string,
): Promise<{ status: "ok"; value: string | null } | { status: "unavailable" }> {
  const v = getValkey();
  if (!v) return { status: "unavailable" };
  try {
    return { status: "ok", value: await v.get(key) };
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeyTryGet failed");
    return { status: "unavailable" };
  }
}

export async function valkeyDel(key: string): Promise<void> {
  const v = getValkey();
  if (!v) return;

  try {
    await v.del(key);
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeyDel failed");
  }
}

export async function valkeyExists(key: string): Promise<boolean> {
  const v = getValkey();
  if (!v) return false;

  try {
    return (await v.exists(key)) === 1;
  } catch (err) {
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
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeySadd failed");
    return 0;
  }
}

/**
 * SADD that says whether the member is actually in the set.
 *
 * `valkeySadd` returns 0 both for "already a member" and for "the write failed",
 * so a caller that must know the member is really recorded — a durability
 * outbox, not a counter — cannot use it.
 */
export async function valkeyTrySadd(
  key: string,
  member: string,
): Promise<"ok" | "unavailable"> {
  const v = getValkey();
  if (!v) return "unavailable";
  try {
    await v.sadd(key, member);
    return "ok";
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeyTrySadd failed");
    return "unavailable";
  }
}

export async function valkeySrem(key: string, ...members: string[]): Promise<number> {
  const v = getValkey();
  if (!v || members.length === 0) return 0;
  try {
    return await v.srem(key, ...members);
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeySrem failed");
    return 0;
  }
}

export async function valkeyScard(key: string): Promise<number> {
  const v = getValkey();
  if (!v) return 0;
  try {
    return await v.scard(key);
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeyScard failed");
    return 0;
  }
}

export async function valkeySmembers(key: string): Promise<string[]> {
  const v = getValkey();
  if (!v) return [];
  try {
    return await v.smembers(key);
  } catch (err) {
    logger.error({ err: err?.message, key }, "valkeySmembers failed");
    throw err;
  }
}

export async function valkeySismember(key: string, member: string): Promise<boolean> {
  const v = getValkey();
  if (!v) return false;
  try {
    return (await v.sismember(key, member)) === 1;
  } catch (err) {
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
  } catch (err) {
    logger.warn({ err: err?.message, key, field }, "valkeyHset failed");
  }
}

export async function valkeyHget(key: string, field: string): Promise<string | null> {
  const v = getValkey();
  if (!v) return null;
  try {
    return await v.hget(key, field);
  } catch (err) {
    logger.warn({ err: err?.message, key, field }, "valkeyHget failed");
    return null;
  }
}

/**
 * HGET for callers that must tell a missing field apart from a Valkey failure.
 * `valkeyHget` answers `null` for both, which reads as "this counter is zero" —
 * fine for a hint, wrong for a balance or a wrong-password count, where zero is
 * the one answer that opens the gate.
 */
export async function valkeyTryHget(
  key: string,
  field: string,
): Promise<{ status: "ok"; value: string | null } | { status: "unavailable" }> {
  const v = getValkey();
  if (!v) return { status: "unavailable" };
  try {
    return { status: "ok", value: await v.hget(key, field) };
  } catch (err) {
    logger.warn({ err: err?.message, key, field }, "valkeyTryHget failed");
    return { status: "unavailable" };
  }
}

export async function valkeyHdel(key: string, ...fields: string[]): Promise<void> {
  const v = getValkey();
  if (!v || fields.length === 0) return;
  try {
    await v.hdel(key, ...fields);
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeyHdel failed");
  }
}

export async function valkeyHgetall(key: string): Promise<Record<string, string>> {
  const v = getValkey();
  if (!v) return {};
  try {
    return (await v.hgetall(key)) || {};
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeyHgetall failed");
    return {};
  }
}

/**
 * HGETALL for callers that must tell an empty hash apart from a Valkey failure.
 * `valkeyHgetall` answers `{}` for both, which reads as "every field is zero" —
 * fine for a counter nobody depends on, wrong for a score that decides a result.
 */
export async function valkeyTryHgetall(
  key: string,
): Promise<
  { status: "ok"; value: Record<string, string> } | { status: "unavailable" }
> {
  const v = getValkey();
  if (!v) return { status: "unavailable" };
  try {
    return { status: "ok", value: (await v.hgetall(key)) || {} };
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeyTryHgetall failed");
    return { status: "unavailable" };
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
  } catch (err) {
    logger.warn({ err: err?.message, n: keys.length }, "valkeyHgetallBatch failed");
    return keys.map(() => ({}));
  }
}

/**
 * One Valkey round-trip for many EXISTS (e.g. live room presence sweep).
 *
 * Answers with an explicit status, because the caller prunes the keys it reports
 * as absent. "Valkey did not answer" and "these people have left" are the same
 * empty array, and a blip that read as the second one deleted the authoritative
 * membership of every live room it touched.
 */
export async function valkeyExistsBatch(
  keys: string[],
): Promise<{ status: "ok"; present: boolean[] } | { status: "unavailable" }> {
  const v = getValkey();
  if (!v) return { status: "unavailable" };
  if (keys.length === 0) return { status: "ok", present: [] };
  try {
    const pipe = v.pipeline();
    for (const k of keys) {
      pipe.exists(k);
    }
    const raw = await pipe.exec();
    if (!raw) return { status: "unavailable" };
    // A single failed command in the pipeline is unreadable too: reporting it as
    // absent would prune a member who is still in the room.
    if (raw.some(([err]) => err)) {
      logger.warn({ n: keys.length }, "valkeyExistsBatch partially failed");
      return { status: "unavailable" };
    }
    return { status: "ok", present: raw.map(([, res]) => res === 1) };
  } catch (err) {
    logger.warn({ err: err?.message, n: keys.length }, "valkeyExistsBatch failed");
    return { status: "unavailable" };
  }
}

export async function valkeyHincrby(key: string, field: string, increment: number): Promise<number> {
  const v = getValkey();
  if (!v) return 0;
  try {
    return await v.hincrby(key, field, increment);
  } catch (err) {
    logger.warn({ err: err?.message, key, field }, "valkeyHincrby failed");
    return 0;
  }
}

/**
 * HINCRBY for callers that must know the counter really moved.
 * `valkeyHincrby` answers 0 on failure, which is indistinguishable from a real
 * total and lets a lost write be reported as a successful one.
 */
export async function valkeyTryHincrby(
  key: string,
  field: string,
  increment: number,
): Promise<{ status: "ok"; value: number } | { status: "unavailable" }> {
  const v = getValkey();
  if (!v) return { status: "unavailable" };
  try {
    return { status: "ok", value: await v.hincrby(key, field, increment) };
  } catch (err) {
    logger.warn({ err: err?.message, key, field }, "valkeyTryHincrby failed");
    return { status: "unavailable" };
  }
}

export async function valkeyExpire(key: string, ttlSeconds: number): Promise<void> {
  const v = getValkey();
  if (!v) return;
  try {
    await v.expire(key, ttlSeconds);
  } catch (err) {
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
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeySetNx failed");
    return false;
  }
}

/**
 * SET NX for callers that must tell "someone else holds this key" apart from
 * "Valkey could not answer". `valkeySetNx` collapses both into `false`, which is
 * safe for locks (a missed lock just means no work) but not for the paid-gift
 * transaction claim, where a failed claim read as a duplicate makes the money
 * path report a delivery that never happened.
 */
export async function valkeyTrySetNx(
  key: string,
  value: string,
  ttlMs: number,
): Promise<"set" | "exists" | "unavailable"> {
  const v = getValkey();
  if (!v) return "unavailable";
  try {
    const result = await v.set(key, value, "PX", ttlMs, "NX");
    return result === "OK" ? "set" : "exists";
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeyTrySetNx failed");
    return "unavailable";
  }
}

/**
 * Release a lock taken with `valkeyTrySetNx`, but only if this caller still owns
 * it. A plain DEL would also delete the lock of the next holder in the case the
 * first one's TTL expired mid-work, letting two writers believe they are alone.
 */
export async function valkeyReleaseLock(key: string, token: string): Promise<void> {
  const v = getValkey();
  if (!v || !token) return;
  try {
    await v.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      token,
    );
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeyReleaseLock failed");
  }
}

/**
 * Extend a lease taken with `valkeyTrySetNx`, and report honestly when this
 * caller no longer holds it. A holder that renews blindly would keep believing
 * it is the only worker after a pause long enough for the lease to expire and
 * another process to take over.
 */
export async function valkeyRenewLock(
  key: string,
  token: string,
  ttlMs: number,
): Promise<"renewed" | "lost" | "unavailable"> {
  const v = getValkey();
  if (!v || !token) return "unavailable";
  try {
    const result = await v.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
      1,
      key,
      token,
      String(ttlMs),
    );
    return result === 1 ? "renewed" : "lost";
  } catch (err) {
    logger.warn({ err: err?.message, key }, "valkeyRenewLock failed");
    return "unavailable";
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
  } catch (err) {
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
    } catch (err) {
      logger.warn({ err: err?.message, cacheKey, attempt: i + 1 }, "waitForCachePopulate poll error");
    }
  }
  return null;
}
