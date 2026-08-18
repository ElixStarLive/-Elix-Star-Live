/**
 * One-shot DB migrations — run once per deploy (Coolify release command, CI, or shell).
 * Does not start HTTP/WebSocket. Never run inside clustered app workers.
 *
 * Usage: npx tsx server/migrate.ts
 * Requires: DATABASE_URL
 */
import "./config";
import pg from "pg";
import { normalizeDatabaseUrl } from "./lib/databaseUrl";
import { logger } from "./lib/logger";
import { invalidateGiftsCatalogCache } from "./lib/catalogCacheValkey";
import { closeValkeyConnections } from "./lib/valkey";
import { listMigrationFilenames, readMigrationSql } from "./lib/migrationSql";

const ADVISORY_KEY = 87236401;

async function main(): Promise<void> {
  const url = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
  if (!url) {
    logger.fatal("DATABASE_URL is required for migrations");
    process.exit(1);
  }

  const needsSsl = url.includes("neon.tech") || url.includes("sslmode=require");
  /** Production verifies TLS by default; set PG_SSL_REJECT_UNAUTHORIZED=false only as an emergency escape. */
  const rejectUnauthorized =
    process.env.PG_SSL_REJECT_UNAUTHORIZED === "false"
      ? false
      : process.env.PG_SSL_REJECT_UNAUTHORIZED === "true" ||
        process.env.NODE_ENV === "production";
  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 30_000,
    ...(needsSsl ? { ssl: { rejectUnauthorized } } : {}),
  });

  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock($1)`, [ADVISORY_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS elix_schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: appliedRows } = await client.query<{ filename: string }>(
      `SELECT filename FROM elix_schema_migrations ORDER BY id`,
    );
    const applied = new Set(appliedRows.map((r) => r.filename));

    const files = listMigrationFilenames();

    for (const name of files) {
      if (applied.has(name)) {
        logger.info({ migration: name }, "[migrate] skip (already applied)");
        continue;
      }
      const sql = readMigrationSql(name);
      logger.info({ migration: name }, "[migrate] applying");
      // Apply each migration and record its marker atomically: if any statement
      // in the file fails, the whole file rolls back so a partial migration is
      // never left behind (and never recorded as applied). This holds because
      // `readMigrationSql` takes the file's own BEGIN/COMMIT away — a file that
      // commits itself would end this transaction early and leave committed
      // schema that no marker describes.
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(`INSERT INTO elix_schema_migrations (filename) VALUES ($1)`, [name]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        logger.fatal({ migration: name, err }, "[migrate] failed — rolled back this migration");
        throw err;
      }
      logger.info({ migration: name }, "[migrate] applied");
    }
  } finally {
    try {
      await client.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_KEY]);
    } catch {
      /* ignore */
    }
    client.release();
    await pool.end();
  }

  await invalidateGiftsCatalogCache().catch(() => {});
  // That cache invalidation opens a Valkey connection, and an open connection
  // keeps this process alive. This runs as the deploy's release command, so it
  // has to return — a migrate that never exits is a deploy that never finishes.
  await closeValkeyConnections().catch(() => {});

  logger.info("[migrate] complete");
}

main().catch((err) => {
  logger.fatal({ err }, "[migrate] failed");
  process.exit(1);
});
