import "../config.ts";
import pg from "pg";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";

const url = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
const needsSsl = url.includes("neon.tech") || url.includes("sslmode=require");
const pool = new pg.Pool({
  connectionString: url,
  max: 1,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});
const c = await pool.connect();

async function exists(rel: string) {
  const r = await c.query("SELECT to_regclass($1) AS t", [rel]);
  return !!r.rows[0].t;
}

async function col(table: string, column: string) {
  const r = await c.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return r.rowCount === 1;
}

try {
  const applied = await c.query(
    `SELECT filename, COUNT(*)::int AS c
       FROM elix_schema_migrations
      WHERE filename LIKE '20260722%'
      GROUP BY filename
      ORDER BY filename`,
  );
  console.log("MIGRATION_ROWS=" + applied.rows.length);
  for (const r of applied.rows) {
    console.log("ROW|" + r.filename + "|count=" + r.c);
  }
  const dups = await c.query(
    `SELECT filename, COUNT(*)::int AS c
       FROM elix_schema_migrations
      GROUP BY filename HAVING COUNT(*) > 1`,
  );
  console.log("DUPLICATES=" + dups.rows.length);

  const checks: [string, boolean][] = [
    ["engagement_missions", await exists("public.engagement_missions")],
    ["daily_reward_config", await exists("public.daily_reward_config")],
    ["treasure_chest_defs", await exists("public.treasure_chest_defs")],
    ["sticker_defs", await exists("public.sticker_defs")],
    ["sounds", await exists("public.sounds")],
    ["video_scores", await exists("public.video_scores")],
    ["elix_payout_audit", await exists("public.elix_payout_audit")],
    ["engagement_admin_audit", await exists("public.engagement_admin_audit")],
    ["processed_by", await col("elix_payout_requests", "processed_by")],
    ["previous_status", await col("elix_payout_requests", "previous_status")],
  ];
  for (const [k, v] of checks) console.log("CHECK|" + k + "=" + (v ? "ok" : "MISSING"));

  const idx = await c.query(
    `SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'idx_elix_payout_audit_request',
          'idx_elix_payout_audit_created',
          'idx_engagement_admin_audit_created',
          'idx_user_treasure_user_status'
        )
      ORDER BY 1`,
  );
  console.log(
    "INDEXES=" + idx.rows.map((r: { indexname: string }) => r.indexname).join(","),
  );

  const wallet = await c.query(
    `SELECT COUNT(*)::int AS users,
            COALESCE(SUM(coin_balance),0)::bigint AS coins
       FROM elix_wallet_balances`,
  );
  console.log(
    "WALLET_SNAPSHOT|users=" +
      wallet.rows[0].users +
      "|total_coins=" +
      wallet.rows[0].coins,
  );

  const missions = await c.query(
    `SELECT COUNT(*)::int AS c FROM engagement_missions WHERE enabled = TRUE`,
  );
  console.log("MISSIONS_ENABLED=" + missions.rows[0].c);

  const giftsMission = await c.query(
    `SELECT 1 FROM engagement_missions WHERE id = 'daily_send_gifts'`,
  );
  console.log("GIFTS_SENT_MISSION=" + (giftsMission.rowCount ? "ok" : "MISSING"));
} finally {
  c.release();
  await pool.end();
}
