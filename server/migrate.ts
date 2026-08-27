/**
 * Migration runner.
 *
 * The chain must be reproducible against a completely empty database: files are
 * applied in filename order, each inside its own transaction, and each is
 * recorded in `schema_migrations` so it is applied exactly once. There is no
 * "detect existing schema and skip" path — a database that only works because
 * someone created tables by hand is not a database this application supports.
 *
 * A session-level advisory lock serialises concurrent runners, so rolling
 * deploys where several instances boot at once cannot apply the same file twice.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPool } from './lib/postgres.js';
import { logger } from './lib/logger.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Arbitrary but fixed key so all instances contend for the same lock. */
const ADVISORY_LOCK_KEY = 8_274_113_905_551n;

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR);
  return entries.filter((name) => name.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
}

export async function runMigrations(): Promise<{ applied: string[] }> {
  const pool = getPool();
  const client = await pool.connect();
  const applied: string[] = [];

  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY.toString()]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        text        PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((row) => row.name));
    const files = await listMigrationFiles();

    for (const name of files) {
      if (done.has(name)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, name), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`MIGRATION FAILED: ${name}\n${err instanceof Error ? err.message : String(err)}`, {
          cause: err,
        });
      }

      applied.push(name);
      logger.info({ migration: name }, 'migration applied');
    }

    return { applied };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY.toString()]).catch(() => {
      /* lock is released with the session anyway */
    });
    client.release();
  }
}


