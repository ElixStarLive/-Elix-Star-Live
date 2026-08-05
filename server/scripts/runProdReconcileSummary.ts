/**
 * Production Neon reconciliation summary (safe IDs only).
 * Writes docs/evidence/prod-reconcile-summary-*.json
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initPostgres } from "../lib/postgres.ts";
import { runWalletLedgerReconciliation } from "../lib/monetisation/reconcile.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

async function main() {
  await initPostgres();
  const r = await runWalletLedgerReconciliation();
  const mismatches = (r as { mismatches?: Array<{ scope: string; expected_pence: number; actual_pence: number; detail?: string }> }).mismatches || [];
  const byPrefix: Record<string, number> = {};
  for (const m of mismatches) {
    const p = String(m.scope).split(":").slice(0, 2).join(":");
    byPrefix[p] = (byPrefix[p] || 0) + 1;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = {
    finishedAt: new Date().toISOString(),
    ok: (r as { ok?: boolean }).ok === true,
    mismatchCount: mismatches.length,
    runId: (r as { runId?: number }).runId ?? null,
    byPrefix,
    sample: mismatches.slice(0, 25),
  };
  const file = path.join(root, "docs/evidence", `prod-reconcile-summary-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: out.ok, mismatchCount: out.mismatchCount, runId: out.runId, evidenceFile: file }, null, 2));
  process.exit(out.ok ? 0 : 2);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
