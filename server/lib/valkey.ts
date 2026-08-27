/**
 * Valkey ownership.
 *
 * Every read returns an explicit `ok | unavailable` result instead of a bare
 * value. Callers must therefore decide what an outage means for them — the
 * login lockout counter fails closed, a cache lookup fails open — and no caller
 * can accidentally treat "Valkey is down" as "the key was absent". There is no
 * in-process fallback store: process memory is not shared between instances, so
 * using it here would silently hand every instance its own full rate-limit
 * budget.
 */

import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from './logger.js';

export type ValkeyRead<T> = { status: 'ok'; value: T } | { status: 'unavailable' };
export type ValkeyWrite = { status: 'ok' } | { status: 'unavailable' };

const client = new Redis(config.VALKEY_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  connectTimeout: 5_000,
});

let connecting: Promise<void> | null = null;

client.on('error', (err: unknown) => {
  logger.error({ err }, 'valkey client error');
});

/** Read through a widening accessor: `client.status` is a union that TypeScript narrows across the `await`, which would make the second check look unreachable. */
function status(): string {
  return client.status;
}

async function ready(): Promise<boolean> {
  if (status() === 'ready') return true;
  connecting ??= client
    .connect()
    .catch((err: unknown) => {
      logger.error({ err }, 'VALKEY CONNECTION FAILED');
    })
    .finally(() => {
      connecting = null;
    });
  await connecting;
  return status() === 'ready';
}

async function read<T>(op: () => Promise<T>, context: string): Promise<ValkeyRead<T>> {
  if (!(await ready())) return { status: 'unavailable' };
  try {
    return { status: 'ok', value: await op() };
  } catch (err) {
    logger.error({ err, context }, 'valkey read failed');
    return { status: 'unavailable' };
  }
}

async function write(op: () => Promise<unknown>, context: string): Promise<ValkeyWrite> {
  if (!(await ready())) return { status: 'unavailable' };
  try {
    await op();
    return { status: 'ok' };
  } catch (err) {
    logger.error({ err, context }, 'valkey write failed');
    return { status: 'unavailable' };
  }
}

export function valkeyGet(key: string): Promise<ValkeyRead<string | null>> {
  return read(() => client.get(key), 'get');
}

/** Sets only if the key does not already exist. `set` is true when this call claimed it. */
export async function valkeySetNx(
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<{ status: 'ok'; set: boolean } | { status: 'unavailable' }> {
  if (!(await ready())) return { status: 'unavailable' };
  try {
    const result = await client.set(key, value, 'EX', ttlSeconds, 'NX');
    return { status: 'ok', set: result === 'OK' };
  } catch (err) {
    logger.error({ err, key }, 'valkey setnx failed');
    return { status: 'unavailable' };
  }
}

export function valkeySet(key: string, value: string, ttlSeconds?: number): Promise<ValkeyWrite> {
  return write(
    () => (ttlSeconds ? client.set(key, value, 'EX', ttlSeconds) : client.set(key, value)),
    'set',
  );
}

export function valkeyDel(...keys: string[]): Promise<ValkeyWrite> {
  if (keys.length === 0) return Promise.resolve({ status: 'ok' });
  return write(() => client.del(...keys), 'del');
}

/** Increments `key` and returns the new value, applying `ttlSeconds` each time. */
export async function valkeyIncrWithTtl(
  key: string,
  ttlSeconds: number,
): Promise<ValkeyRead<number>> {
  if (!(await ready())) return { status: 'unavailable' };
  try {
    const [incr] = (await client.multi().incr(key).expire(key, ttlSeconds).exec()) ?? [];
    const value = Number(incr?.[1]);
    if (!Number.isFinite(value)) return { status: 'unavailable' };
    return { status: 'ok', value };
  } catch (err) {
    logger.error({ err, key }, 'valkey incr failed');
    return { status: 'unavailable' };
  }
}

export function valkeySmembers(key: string): Promise<ValkeyRead<string[]>> {
  return read(() => client.smembers(key), 'smembers');
}

export async function valkeySaddWithTtl(
  key: string,
  member: string,
  ttlSeconds: number,
): Promise<ValkeyWrite> {
  return write(async () => {
    await client.multi().sadd(key, member).expire(key, ttlSeconds).exec();
  }, 'sadd');
}

/** True when Valkey answers a PING. Used by the health check. */
export async function isValkeyHealthy(): Promise<boolean> {
  const result = await read(() => client.ping(), 'ping');
  return result.status === 'ok' && result.value === 'PONG';
}

export async function closeValkey(): Promise<void> {
  if (client.status !== 'end') await client.quit();
}
