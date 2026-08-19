/**
 * Print column names for a fixed set of tables I need for user-activity tracing.
 * Read-only.
 * Usage: npx tsx server/scripts/schemaColumns.ts
 */
import "../config";
import pg from "pg";
import { normalizeDatabaseUrl } from "../lib/databaseUrl";

const url = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
const needsSsl = url.includes("neon.tech") || url.includes("sslmode=require");
const pool = new pg.Pool({
  connectionString: url,
  max: 1,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
});

async function main(): Promise<void> {
  const tables = [
    "elix_reports",
    "elix_gift_transactions",
    "elix_blocked_users",
    "live_streams",
    "elix_membership_purchases",
    "elix_promote_purchases",
    "profiles",
    "auth_users",
  ];
  const out: Record<string, string[]> = {};
  for (const t of tables) {
    const r = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
        ORDER BY ordinal_position`,
      [t],
    );
    out[t] = r.rows.map((x) => x.column_name);
  }
  console.log(JSON.stringify({ status: "OK", columns: out }, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.log(JSON.stringify({ status: "ERROR", message: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
