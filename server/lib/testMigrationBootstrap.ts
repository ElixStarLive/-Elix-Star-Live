/**
 * Bring a dedicated test database up to the repo's schema, for DB integration
 * suites. Test bootstrap only — production migrations are `server/migrate.ts`.
 *
 * Four suites each carried their own copy of this, and every copy was missing the
 * two properties the real runner has, so running them together against one
 * database failed on the schema rather than on any behaviour under test:
 *
 * - **One writer.** `CREATE TABLE IF NOT EXISTS` is not atomic against a
 *   concurrent `CREATE TABLE`, so parallel suites raced into "relation already
 *   exists" and duplicate `pg_type` keys. The advisory lock makes the whole
 *   bootstrap a critical section; vitest can run these files in parallel again.
 * - **One transaction per file.** Applying a file and recording its marker
 *   separately means a mid-file failure leaves objects created but unrecorded, so
 *   the next run replays that file and fails on what already exists. Committed
 *   together, a migration is either applied and recorded, or neither.
 *
 * Same advisory key as `server/migrate.ts`, so a test bootstrap and a real
 * migration pass can never interleave on the same database either.
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const MIGRATIONS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

/** Shared with `server/migrate.ts` — one writer per database, whichever runs. */
const ADVISORY_KEY = 87236401;

/**
 * Refuse to run a destructive suite against anything but a dedicated test
 * database: opt-in flag, plus a database name that says what it is. A Neon host
 * is shared by production and test databases, so the name is what distinguishes
 * them.
 */
export function assertSafeTestDatabase(url: string): void {
  if (process.env.ALLOW_MONEY_IT_ON_URL !== "1") {
    throw new Error("Refusing DB integration run without ALLOW_MONEY_IT_ON_URL=1");
  }
  const dbName = (() => {
    try {
      return new URL(url.replace(/^postgres(ql)?:/i, "http:")).pathname
        .replace(/^\//, "")
        .toLowerCase();
    } catch {
      return "";
    }
  })();
  if (!dbName) {
    throw new Error("TEST_DATABASE_URL has no database name in the path");
  }
  if (!/(test|dev|ephemeral|money.?it)/.test(dbName)) {
    throw new Error(
      `Refusing database "${dbName}" — name must contain test, dev, ephemeral, or money_it. ` +
        "Create a dedicated test database (e.g. elix_test) on your Neon project.",
    );
  }
}

/** Apply every repo migration this database has not recorded yet. */
export async function applyRepoMigrations(pool: pg.Pool): Promise<string[]> {
  const client = await pool.connect();
  const appliedNow: string[] = [];
  try {
    await client.query(`SELECT pg_advisory_lock($1)`, [ADVISORY_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS elix_schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = new Set(
      (
        await client.query<{ filename: string }>(
          `SELECT filename FROM elix_schema_migrations`,
        )
      ).rows.map((r) => r.filename),
    );

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const name of files) {
      if (applied.has(name)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          `INSERT INTO elix_schema_migrations (filename) VALUES ($1)`,
          [name],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw new Error(
          `migration ${name} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      appliedNow.push(name);
    }
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_KEY]).catch(() => {});
    client.release();
  }
  return appliedNow;
}

/** A pool for a test database, with the SSL settings Neon needs. */
export function createTestPool(url: string, max: number): pg.Pool {
  const needsSsl = url.includes("neon.tech") || url.includes("sslmode=require");
  return new pg.Pool({
    connectionString: url,
    max,
    connectionTimeoutMillis: 30_000,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}
