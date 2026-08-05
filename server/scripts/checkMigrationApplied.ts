import "../config.ts";
import pg from "pg";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";

const url = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

async function main() {
  const c = await pool.connect();
  try {
    const db = await c.query("select current_database() as db");
    const m = await c.query(
      `select filename, applied_at from elix_schema_migrations
        where filename = $1`,
      ["20260805140000_payout_provider_financial_reports.sql"],
    );
    const count = await c.query(
      `select count(*)::int as c from elix_schema_migrations
        where filename = $1`,
      ["20260805140000_payout_provider_financial_reports.sql"],
    );
    const tables = await c.query(
      `select table_name from information_schema.tables
        where table_schema='public' and table_name = any($1::text[])
        order by 1`,
      [["elix_creator_payout_accounts", "elix_store_financial_reports", "elix_store_financial_report_lines", "elix_fraud_reviews", "elix_payout_provider_events"]],
    );
    console.log(
      JSON.stringify(
        {
          database: db.rows[0].db,
          migration: m.rows[0] || null,
          migration_row_count: count.rows[0].c,
          tables: tables.rows.map((r) => r.table_name),
        },
        null,
        2,
      ),
    );
  } finally {
    c.release();
    await pool.end();
    process.exit(0);
  }
}

main();
