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

// ── Rate limiting via Valkey sliding window ──────────────────────

export async function valkeyRateCheck(
  key: string,
  windowMs: number,
  max: number,
): Promise<boolean> {
  const v = getValkey();
  if (!v) {
    logger.warn("valkeyRateCheck: Valkey not available — denying request (fail-closed)");
    return false;
  }

  try {
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
      logger.warn("valkeyRateCheck: pipeline returned null — denying request (fail-closed)");
      return false;
    }

    const count = (results[2]?.[1] as number) ?? 0;
    return count <= max;
  } catch (err: any) {
    logger.warn(
      { err: err?.message },
      "valkeyRateCheck failed — denying request (fail-closed)",
    );
    return false;
  }
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
