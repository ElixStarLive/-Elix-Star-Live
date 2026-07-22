import "../config.ts";
import pg from "pg";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";

const url = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
if (!url) {
  console.log("NO_DATABASE_URL");
  process.exit(1);
}
const needsSsl = url.includes("neon.tech") || url.includes("sslmode=require");
const pool = new pg.Pool({
  connectionString: url,
  max: 1,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});
const c = await pool.connect();
try {
  const db = await c.query(
    "SELECT current_database() AS db, current_user AS usr",
  );
  console.log("DB=" + db.rows[0].db);
  console.log("USER=" + db.rows[0].usr);
  const exists = await c.query(
    "SELECT to_regclass('public.elix_schema_migrations') AS t",
  );
  console.log("MIGRATION_TABLE=" + (exists.rows[0].t || "MISSING"));
  if (exists.rows[0].t) {
    const applied = await c.query(
      "SELECT filename, applied_at FROM elix_schema_migrations ORDER BY id",
    );
    console.log("APPLIED_COUNT=" + applied.rows.length);
    for (const r of applied.rows) {
      console.log(
        "APPLIED|" + r.filename + "|" + new Date(r.applied_at).toISOString(),
      );
    }
    const last = applied.rows[applied.rows.length - 1];
    if (last) console.log("LAST=" + last.filename);
  }
  const tabs = await c.query(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND (
          tablename LIKE 'engagement%'
          OR tablename IN ('sounds', 'video_scores', 'elix_payout_audit', 'daily_reward_config', 'elix_payout_requests')
        )
      ORDER BY 1`,
  );
  console.log(
    "RELATED_TABLES=" + tabs.rows.map((r: { tablename: string }) => r.tablename).join(","),
  );
  const cols = await c.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'elix_payout_requests'
        AND column_name IN ('processed_by', 'previous_status')
      ORDER BY 1`,
  );
  console.log(
    "PAYOUT_COLS=" +
      cols.rows.map((r: { column_name: string }) => r.column_name).join(","),
  );
} finally {
  c.release();
  await pool.end();
}
