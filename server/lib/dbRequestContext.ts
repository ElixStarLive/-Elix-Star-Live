/**
 * Per-request Postgres usage via AsyncLocalStorage — count queries and wall time
 * for observability under load (pool saturation vs. slow statements).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type pg from "pg";

export type DbRequestStats = { queryCount: number; dbMs: number };

export const dbRequestAls = new AsyncLocalStorage<DbRequestStats>();

/** Run request handlers with a fresh DB stats bucket (call once per HTTP request). */
export function runWithDbStats<T>(fn: () => T): T {
  return dbRequestAls.run({ queryCount: 0, dbMs: 0 }, fn);
}

export function getDbRequestStats(): DbRequestStats | undefined {
  return dbRequestAls.getStore();
}

/**
 * Wrap pool.query so successful round-trips increment queryCount and dbMs.
 * Safe to call once after the pool is assigned (connectPostgres).
 */
export function instrumentPool(pool: pg.Pool): void {
  const orig = pool.query.bind(pool) as (...args: unknown[]) => unknown;
  (pool as pg.Pool & { query: typeof orig }).query = function queryWrapped(
    ...args: unknown[]
  ) {
    const store = dbRequestAls.getStore();
    const t0 = Date.now();
    const out = orig(...args);
    if (out && typeof (out as PromiseLike<unknown>).then === "function") {
      return (out as Promise<pg.QueryResult>).then((result: pg.QueryResult) => {
        const dt = Date.now() - t0;
        if (store) {
          store.queryCount++;
          store.dbMs += dt;
        }
        return result;
      });
    }
    return out;
  } as typeof pool.query;
}
