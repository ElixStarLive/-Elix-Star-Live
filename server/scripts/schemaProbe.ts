/**
 * Read-only: list table names + a few key column names for tables I care about
 * (memberships, gifts, reports, blocks, live rooms, promote purchases, users).
 * Usage: npx tsx server/scripts/schemaProbe.ts
 */
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

async function main(): Promise<void> {
  const patterns = [
    "%membership%",
    "%gift%",
    "%report%",
    "%block%",
    "%live%",
    "%promote%",
    "%user%",
    "%profile%",
    "%subscription%",
    "%account_delete%",
  ];
  const out: Record<string, string[]> = {};
  for (const p of patterns) {
    const r = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name ILIKE $1
        ORDER BY table_name`,
      [p],
    );
    out[p] = r.rows.map((x) => x.table_name);
  }
  console.log(JSON.stringify({ status: "OK", matches: out }, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.log(JSON.stringify({ status: "ERROR", message: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
