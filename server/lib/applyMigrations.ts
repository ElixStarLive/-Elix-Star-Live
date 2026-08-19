/**
 * The migration runner — one implementation, every caller.
 *
 * Callers:
 *  - `server/cluster.ts`  the container's own boot, before it forks any worker
 *  - `server/migrate.ts`  shell / CI / manual runs
 *
 * Cluster workers never call this. They only assert the result, through
 * `assertMigrationsApplied` in `server/lib/postgres.ts`, so a worker can still
 * refuse to serve a schema it was not built for.
 *
 * Safe to run from several instances at once, which is what makes it usable at
 * boot: a Postgres session advisory lock serialises the runners, so the second
 * container blocks until the first finishes and then finds every file applied.
 */
import pg from "pg";
import { directDatabaseUrl, normalizeDatabaseUrl } from "./databaseUrl";
import { logger } from "./logger";
import { invalidateGiftsCatalogCache } from "./catalogCacheValkey";
import { closeValkeyConnections } from "./valkey";
import { listMigrationFilenames, readMigrationSql } from "./migrationSql";

const ADVISORY_KEY = 87236401;

/**
 * Applies every pending migration, in filename order, and returns the ones it
 * applied. Throws if any file fails — that file is rolled back and nothing after
 * it runs, so the caller can fail the boot instead of serving a half-migrated
 * schema.
 */
export async function applyPendingMigrations(): Promise<string[]> {
  const configured = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
  if (!configured) {
    throw new Error("DATABASE_URL is required for migrations");
  }
  // Production runs the app on Neon's pooled endpoint, but the advisory lock
  // below is a session lock and pgbouncer's transaction pooling does not keep a
  // session — see `directDatabaseUrl`. Migrations therefore run on the direct
  // endpoint, so "one writer per database" is real and the key is released when
  // this process disconnects.
  const url = directDatabaseUrl(configured);

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

  const applied: string[] = [];
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
    const alreadyApplied = new Set(appliedRows.map((r) => r.filename));

    const files = listMigrationFilenames();

    for (const name of files) {
      if (alreadyApplied.has(name)) continue;
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
      applied.push(name);
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

  // Only when something actually changed. Migrations can rewrite gift rows, and
  // the catalog is cached in Valkey, so a stale blob would keep serving the old
  // prices. Skipping it when nothing was applied matters now that this runs on
  // every container boot: an unchanged schema must not open a Valkey connection
  // just to delete a key that is already correct.
  if (applied.length > 0) {
    await invalidateGiftsCatalogCache().catch(() => {});
    // That invalidation opens a Valkey connection, and an open connection keeps a
    // process alive. `server/migrate.ts` has to exit for a deploy to finish, and
    // the cluster primary should not sit on an idle client it never uses again.
    await closeValkeyConnections().catch(() => {});
  }

  return applied;
}
