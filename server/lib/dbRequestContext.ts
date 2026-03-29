/**
 * Per-request Postgres usage via AsyncLocalStorage — count queries and wall time
 * for observability under load (pool saturation vs. slow statements).
 *
 * Instruments:
 * - pool.query (shared pool)
 * - pool.connect() → PoolClient.query (dedicated client)
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type pg from "pg";

export type DbRequestStats = { queryCount: number; dbMs: number };

export const dbRequestAls = new AsyncLocalStorage<DbRequestStats>();

const INSTRUMENTED_POOL = Symbol("elixPgPoolInstrumented");
const INSTRUMENTED_CONNECT = Symbol("elixPgPoolConnectInstrumented");
const INSTRUMENTED_CLIENT = Symbol("elixPgClientInstrumented");

/** Run request handlers with a fresh DB stats bucket (call once per HTTP request). */
export function runWithDbStats<T>(fn: () => T): T {
  return dbRequestAls.run({ queryCount: 0, dbMs: 0 }, fn);
}

export function getDbRequestStats(): DbRequestStats | undefined {
  return dbRequestAls.getStore();
}

function recordQueryDuration(t0: number): void {
  const store = dbRequestAls.getStore();
  if (!store) return;
  const dt = Date.now() - t0;
  store.queryCount++;
  store.dbMs += dt;
}

function wrapQueryMethod(
  orig: (...args: unknown[]) => unknown,
): (...args: unknown[]) => unknown {
  return function queryWrapped(...args: unknown[]) {
    const t0 = Date.now();
    const out = orig(...args);
    if (out && typeof (out as PromiseLike<unknown>).then === "function") {
      return (out as Promise<pg.QueryResult>).then((result: pg.QueryResult) => {
        recordQueryDuration(t0);
        return result;
      });
    }
    return out;
  };
}

export function instrumentPoolClient(client: pg.PoolClient): void {
  const c = client as pg.PoolClient & { [INSTRUMENTED_CLIENT]?: boolean };
  if (c[INSTRUMENTED_CLIENT]) return;
  c[INSTRUMENTED_CLIENT] = true;
  const orig = client.query.bind(client) as (...args: unknown[]) => unknown;
  client.query = wrapQueryMethod(orig) as typeof client.query;
}

/**
 * Wrap pool.connect so every acquired PoolClient gets instrumented query().
 */
export function instrumentPoolConnect(pool: pg.Pool): void {
  const p = pool as pg.Pool & { [INSTRUMENTED_CONNECT]?: boolean };
  if (p[INSTRUMENTED_CONNECT]) return;
  p[INSTRUMENTED_CONNECT] = true;

  const origConnect = pool.connect.bind(pool) as (...args: unknown[]) => unknown;

  pool.connect = function connectWrapped(
    ...args: unknown[]
  ): ReturnType<typeof origConnect> {
    // Callback form: connect((err, client, release) => void)
    if (args.length > 0 && typeof args[0] === "function") {
      const userCb = args[0] as (
        err: Error | undefined,
        client: pg.PoolClient | undefined,
        done: (release?: unknown) => void,
      ) => void;
      return origConnect((err: Error | undefined, client: pg.PoolClient | undefined, done: (release?: unknown) => void) => {
        if (client) instrumentPoolClient(client);
        userCb(err, client, done);
      });
    }

    const out = origConnect(...args);
    if (out && typeof (out as PromiseLike<unknown>).then === "function") {
      return (out as Promise<pg.PoolClient>).then((client: pg.PoolClient) => {
        instrumentPoolClient(client);
        return client;
      }) as ReturnType<typeof origConnect>;
    }
    return out;
  } as typeof pool.connect;
}

/**
 * Wrap pool.query so successful round-trips increment queryCount and dbMs.
 * Call once after the pool is created (connectPostgres).
 */
export function instrumentPool(pool: pg.Pool): void {
  const p = pool as pg.Pool & { [INSTRUMENTED_POOL]?: boolean };
  if (p[INSTRUMENTED_POOL]) return;
  p[INSTRUMENTED_POOL] = true;

  const orig = pool.query.bind(pool) as (...args: unknown[]) => unknown;
  pool.query = wrapQueryMethod(orig) as typeof pool.query;
}
