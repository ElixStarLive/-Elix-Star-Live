/**
 * One-shot DB migrations — run once per deploy (Coolify release command, CI, or shell).
 * Does not start HTTP/WebSocket. Never run inside clustered app workers.
 *
 * Usage: npx tsx server/migrate.ts
 * Requires: DATABASE_URL
 */
import "./config";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "migrations");

const ADVISORY_KEY = 87236401;

async function main(): Promise<void> {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) {
    logger.fatal("DATABASE_URL is required for migrations");
    process.exit(1);
  }

  const needsSsl = url.includes("neon.tech") || url.includes("sslmode=require");
  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 30_000,
    ...(needsSsl ? { ssl: { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED === "true" } } : {}),
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

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const name of files) {
      if (applied.has(name)) {
        logger.info({ migration: name }, "[migrate] skip (already applied)");
        continue;
      }
      const fullPath = path.join(migrationsDir, name);
      const sql = fs.readFileSync(fullPath, "utf8");
      logger.info({ migration: name }, "[migrate] applying");
      await client.query(sql);
      await client.query(`INSERT INTO elix_schema_migrations (filename) VALUES ($1)`, [name]);
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

  logger.info("[migrate] complete");
}

main().catch((err) => {
  logger.fatal({ err }, "[migrate] failed");
  process.exit(1);
});
