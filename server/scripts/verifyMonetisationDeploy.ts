/**
 * Post-Coolify-deploy verification (read-only probes + migration status).
 * Does not send money. Does not mutate production financial state.
 *
 * Usage (after deploy):
 *   npx tsx server/scripts/verifyMonetisationDeploy.ts
 */
import "../config.ts";
import pg from "pg";
import { normalizeDatabaseUrl } from "../lib/databaseUrl.ts";

const BASE = (process.env.VITE_API_URL || process.env.API_URL || "https://www.elixstarlive.co.uk").replace(
  /\/$/,
  "",
);

async function probe(path: string): Promise<{ path: string; status: number | string }> {
  try {
    const res = await fetch(`${BASE}${path}`, { method: "GET", redirect: "manual" });
    return { path, status: res.status };
  } catch (e) {
    return { path, status: `ERR:${e instanceof Error ? e.message : String(e)}` };
  }
}

async function probePost(path: string): Promise<{ path: string; status: number | string }> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return { path, status: res.status };
  } catch (e) {
    return { path, status: `ERR:${e instanceof Error ? e.message : String(e)}` };
  }
}

async function main() {
  const healthRes = await fetch(`${BASE}/api/health`);
  const health = (await healthRes.json()) as Record<string, unknown>;
  const commit = String(health.commit || "");

  const endpoints = await Promise.all([
    probe("/api/creator/payout-account"),
    probe("/api/creator/balance"),
    probe("/api/creator/ledger"),
    probe("/api/creator/withdrawals-gbp"),
    probe("/api/admin/monetisation/reports/dashboard"),
    probePost("/api/admin/monetisation/financial-reports/import"),
    probePost("/api/admin/monetisation/withdrawals-gbp/test/submit-provider"),
    probePost("/api/creator/payout-account/onboard"),
    probePost("/api/stripe-webhook"),
  ]);

  let migrationRow: unknown = null;
  const url = normalizeDatabaseUrl((process.env.DATABASE_URL || "").trim());
  if (url) {
    const pool = new pg.Pool({
      connectionString: url,
      ssl: url.includes("neon.tech") ? { rejectUnauthorized: false } : undefined,
      max: 1,
    });
    try {
      const r = await pool.query(
        `SELECT filename, applied_at FROM elix_schema_migrations
          WHERE filename = '20260805140000_payout_provider_financial_reports.sql'`,
      );
      migrationRow = r.rows[0] || null;
      const db = await pool.query(`SELECT current_database() AS db`);
      console.log(
        JSON.stringify(
          {
            health,
            deployed_commit: commit,
            contains_c6f49ff_expected_if: "5ad807a or later",
            database: db.rows[0]?.db,
            migration_20260805140000: migrationRow,
            endpoints,
            note: "401/403 = mounted; 404 = not deployed",
          },
          null,
          2,
        ),
      );
    } finally {
      await pool.end();
    }
  } else {
    console.log(JSON.stringify({ health, endpoints, migrationRow: "no DATABASE_URL" }, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
