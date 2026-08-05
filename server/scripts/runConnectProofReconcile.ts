/**
 * Run reconciliation against the current DATABASE_URL (expected: elix_connect_proof).
 * Writes evidence JSON with ok/mismatch count. Never silently repairs.
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectPostgres, getPool } from "../lib/postgres.ts";
import { runWalletLedgerReconciliation } from "../lib/monetisation/reconcile.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

async function main() {
  process.env.ELIX_SKIP_MIGRATION_CHECK = "1";
  await connectPostgres();
  const pool = getPool();
  if (!pool) {
    console.error("[reconcile] no pool");
    process.exit(1);
  }
  const db = await pool.query("SELECT current_database() AS db");
  const dbName = String(db.rows[0].db);
  const result = await runWalletLedgerReconciliation();

  const classified = (result.mismatches || []).map((m) => {
    let cause = "Other documented cause";
    if (m.detail === "wallet_vs_ledger") cause = "Wallet mismatch";
    if (m.detail === "platform_wallet_vs_ledger") cause = "Ledger mismatch (platform)";
    if (m.detail === "creator_plus_platform_ne_net") cause = "Ledger mismatch (split)";
    if (String(m.scope).includes("connect_proof_")) cause = "Test fixture residue";
    if (String(m.scope).startsWith("creator:csub_") || String(m.scope).startsWith("creator:wdc_") || String(m.scope).startsWith("creator:e2e_") || String(m.scope).startsWith("creator:cb_") || String(m.scope).startsWith("creator:pd_")) {
      cause = "Invalid historical test data / Test fixture residue";
    }
    return { ...m, classification: cause };
  });

  const evidence = {
    database: dbName,
    testRunId: process.env.CONNECT_PROOF_RUN_ID || `iso_${new Date().toISOString()}`,
    command: "npx tsx server/scripts/runConnectProofReconcile.ts",
    ok: result.ok,
    mismatchCount: result.mismatches.length,
    runId: result.runId ?? null,
    mismatches: classified,
    finishedAt: new Date().toISOString(),
  };

  const dir = path.join(root, "docs", "evidence");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `connect-proof-reconcile-${dbName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ...evidence, evidenceFile: file }, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
