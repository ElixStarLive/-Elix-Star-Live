/**
 * Postgres (Neon) ownership.
 *
 * The pool is created eagerly from validated configuration, so `getPool()`
 * always returns a usable pool and callers never branch on "is the database
 * configured". A database that cannot be reached is a failure to report, not a
 * condition to route around.
 */

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { config } from '../config.js';
import { logger } from './logger.js';

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'postgres idle client error');
});

export function getPool(): Pool {
  return pool;
}

export function query<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: readonly unknown[],
): Promise<QueryResult<R>> {
  return pool.query<R>(text, params as unknown[]);
}

/** Runs `fn` inside a single transaction, rolling back on any thrown error. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch((rollbackErr: unknown) => {
      logger.error({ err: rollbackErr }, 'transaction rollback failed');
    });
    throw err;
  } finally {
    client.release();
  }
}

/** True when the database answers a trivial query. Used by the health check. */
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    logger.error({ err }, 'DATABASE CONNECTION FAILED');
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
