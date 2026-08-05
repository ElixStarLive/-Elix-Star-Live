/**
 * Automatic wallet ↔ ledger reconciliation. Never silently repairs money —
 * records mismatches for admin review.
 */
import { getPool } from "../postgres";
import { logger } from "../logger";

export type ReconcileMismatch = {
  scope: string;
  expected_pence: number;
  actual_pence: number;
  detail: string;
};

export async function ensureReconcileTables(): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS elix_reconciliation_runs (
      id BIGSERIAL PRIMARY KEY,
      status TEXT NOT NULL,
      mismatch_count INT NOT NULL DEFAULT 0,
      mismatches JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_created
      ON elix_reconciliation_runs (created_at DESC);
  `);
}

export async function runWalletLedgerReconciliation(): Promise<{
  ok: boolean;
  mismatches: ReconcileMismatch[];
  runId?: number;
}> {
  const pool = getPool();
  if (!pool) return { ok: false, mismatches: [{ scope: "db", expected_pence: 0, actual_pence: 0, detail: "no_pool" }] };
  await ensureReconcileTables();
  const mismatches: ReconcileMismatch[] = [];

  try {
    // Per-creator: pending+available+held+withdrawn-reversed vs signed creator ledger amounts by status buckets is complex;
    // reconcile: wallet.pending ≈ sum(pending creator amounts), etc.
    const wallets = await pool.query(`SELECT * FROM elix_creator_wallet_gbp`);
    for (const w of wallets.rows) {
      const uid = String(w.user_id);
      const ledger = await pool.query(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'pending' AND creator_amount_pence > 0 THEN creator_amount_pence ELSE 0 END),0)::bigint AS pending,
           COALESCE(SUM(CASE WHEN status = 'available' AND creator_amount_pence > 0 THEN creator_amount_pence ELSE 0 END),0)::bigint AS available,
           COALESCE(SUM(CASE WHEN status = 'held' AND creator_amount_pence > 0 THEN creator_amount_pence ELSE 0 END),0)::bigint AS held,
           COALESCE(SUM(CASE WHEN revenue_source = 'WITHDRAWAL' AND creator_amount_pence < 0 THEN -creator_amount_pence ELSE 0 END),0)::bigint AS withdrawn,
           COALESCE(SUM(CASE WHEN status = 'reversed' OR revenue_source IN ('REFUND_REVERSAL','CHARGEBACK_REVERSAL') THEN ABS(LEAST(creator_amount_pence,0)) ELSE 0 END),0)::bigint AS reversed
         FROM elix_financial_ledger
        WHERE creator_user_id = $1`,
        [uid],
      );
      const L = ledger.rows[0] || {};
      const checks: Array<[string, number, number]> = [
        ["pending", Number(w.pending_pence) || 0, Number(L.pending) || 0],
        ["available", Number(w.available_pence) || 0, Number(L.available) || 0],
        ["held", Number(w.held_pence) || 0, Number(L.held) || 0],
      ];
      for (const [scope, actual, expected] of checks) {
        if (actual !== expected) {
          mismatches.push({
            scope: `creator:${uid}:${scope}`,
            expected_pence: expected,
            actual_pence: actual,
            detail: "wallet_vs_ledger",
          });
        }
      }
    }

    // Platform share vs ledger platform amounts for promote + platform gift/sub shares
    const plat = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN revenue_source = 'PROMOTE_VIDEO' AND reversal_of_id IS NULL THEN platform_amount_pence ELSE 0 END),0)::bigint AS promote,
         COALESCE(SUM(CASE WHEN revenue_source IN ('PAID_GIFT','CREATOR_SUBSCRIPTION') AND reversal_of_id IS NULL THEN platform_amount_pence ELSE 0 END),0)::bigint AS share,
         COALESCE(SUM(CASE WHEN revenue_source IN ('REFUND_REVERSAL','CHARGEBACK_REVERSAL') THEN platform_amount_pence ELSE 0 END),0)::bigint AS reverses
       FROM elix_financial_ledger`,
    );
    const p = plat.rows[0];
    // Sanity: creator + platform = net for non-reversal gift/sub rows
    const splitCheck = await pool.query(
      `SELECT id, net_revenue_pence, creator_amount_pence, platform_amount_pence
         FROM elix_financial_ledger
        WHERE reversal_of_id IS NULL
          AND revenue_source IN ('PAID_GIFT', 'CREATOR_SUBSCRIPTION', 'PROMOTE_VIDEO')
          AND creator_amount_pence + platform_amount_pence <> net_revenue_pence
        LIMIT 50`,
    );
    for (const row of splitCheck.rows) {
      mismatches.push({
        scope: `ledger_split:${row.id}`,
        expected_pence: Number(row.net_revenue_pence) || 0,
        actual_pence:
          (Number(row.creator_amount_pence) || 0) + (Number(row.platform_amount_pence) || 0),
        detail: "creator_plus_platform_ne_net",
      });
    }

    void p; // platform aggregates available for report payload

    const status = mismatches.length === 0 ? "ok" : "mismatch";
    const ins = await pool.query(
      `INSERT INTO elix_reconciliation_runs (status, mismatch_count, mismatches)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id`,
      [status, mismatches.length, JSON.stringify(mismatches)],
    );
    if (mismatches.length > 0) {
      logger.warn({ count: mismatches.length, sample: mismatches.slice(0, 5) }, "monetisation reconciliation mismatch");
    }
    return { ok: mismatches.length === 0, mismatches, runId: Number(ins.rows[0].id) };
  } catch (err) {
    logger.error({ err }, "runWalletLedgerReconciliation failed");
    return {
      ok: false,
      mismatches: [{ scope: "error", expected_pence: 0, actual_pence: 0, detail: String(err) }],
    };
  }
}
