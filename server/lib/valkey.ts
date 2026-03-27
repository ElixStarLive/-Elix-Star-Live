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
      if (times > 10) return null;
      return Math.min(times * 200, 5000);
    },
    lazyConnect: false,
    enableReadyCheck: true,
    connectTimeout: 5000,
  });

  conn.on("connect", () =>
    logger.info({ label }, "Valkey connected"),
  );
  conn.on("error", (err) =>
    logger.error({ label, err: err.message }, "Valkey error"),
  );
  conn.on("close", () =>
    logger.warn({ label }, "Valkey connection closed"),
  );

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
  } catch {
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
  if (!v) return true;

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
    if (!results) return true;

    const count = (results[2]?.[1] as number) ?? 0;
    return count <= max;
  } catch {
    return true;
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
  } catch {
    /* best effort */
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
    } catch {
      /* ignore parse errors */
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
    } catch {
      /* ignore parse errors */
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
  } catch {
    /* best effort */
  }
}

export async function valkeyGet(key: string): Promise<string | null> {
  const v = getValkey();
  if (!v) return null;

  try {
    return await v.get(key);
  } catch {
    return null;
  }
}

export async function valkeyDel(key: string): Promise<void> {
  const v = getValkey();
  if (!v) return;

  try {
    await v.del(key);
  } catch {
    /* best effort */
  }
}

export async function valkeyExists(key: string): Promise<boolean> {
  const v = getValkey();
  if (!v) return false;

  try {
    return (await v.exists(key)) === 1;
  } catch {
    return false;
  }
}
