/**
 * Admin Monetisation panel API — configure splits, rewards, withdrawals, settlements.
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuthWithRoles, requireAdmin } from "../middleware/rbac";
import { validateBody } from "../middleware/validate";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import {
  auditMonetisationConfigChange,
  invalidateMonetisationConfigCache,
  loadMonetisationConfig,
} from "../lib/monetisation/config";
import {
  applyIapSettlementToCoinLot,
  postCreatorSubscriptionRevenue,
  postPromotePlatformRevenue,
  reverseByExternalTransaction,
} from "../lib/monetisation/settlements";
import {
  closeCreatorRewardPeriod,
  openCreatorRewardPeriod,
} from "../lib/monetisation/creatorRewardsJob";
import { gbpStringToPence, moneyPartsToGbpPence } from "../lib/monetisation/moneyMath";
import { loadMembershipPriceConfig } from "../lib/googlePlaySubscriptions";

const router = Router();
router.use(requireAuthWithRoles);
router.use(requireAdmin);

router.get("/config", async (_req, res) => {
  try {
    const cfg = await loadMonetisationConfig(true);
    return res.json({ config: cfg });
  } catch (err) {
    logger.error({ err }, "admin monetisation config get failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const patchSchema = z.object({
  field: z.string().min(1).max(80),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  reason: z.string().max(500).optional(),
});

const FIELD_MAP: Record<string, string> = {
  giftCreatorPct: "gift_creator_pct",
  giftPlatformPct: "gift_platform_pct",
  giftSettlementHours: "gift_settlement_hours",
  giftMonetisationEnabled: "gift_monetisation_enabled",
  subCreatorPct: "sub_creator_pct",
  subPlatformPct: "sub_platform_pct",
  subSettlementHours: "sub_settlement_hours",
  subMonetisationEnabled: "sub_monetisation_enabled",
  rewardsEnabled: "rewards_enabled",
  rewardsMinFollowers: "rewards_min_followers",
  rewardsMinPrev30dQualifiedViews: "rewards_min_prev_30d_qualified_views",
  rewardsMaxPencePerCreator: "rewards_max_pence_per_creator",
  rewardsMonthlyBudgetPence: "rewards_monthly_budget_pence",
  rewardsMinWatchSeconds: "rewards_min_watch_seconds",
  rewardsSettlementHours: "rewards_settlement_hours",
  rewardsAutoApprove: "rewards_auto_approve",
  withdrawMinPence: "withdraw_min_pence",
  withdrawMaxPence: "withdraw_max_pence",
};

router.patch("/config", validateBody(patchSchema), async (req: Request, res: Response) => {
  const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
  const field = String(req.body.field);
  const col = FIELD_MAP[field];
  if (!col) return res.status(400).json({ error: "UNKNOWN_FIELD" });
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  try {
    const prev = await pool.query(`SELECT * FROM elix_monetisation_config WHERE id = 'default'`);
    const previousValue =
      prev.rows[0] && prev.rows[0][col] != null ? String(prev.rows[0][col]) : null;
    const value = req.body.value;
    await pool.query(`UPDATE elix_monetisation_config SET ${col} = $1, updated_at = NOW() WHERE id = 'default'`, [
      value,
    ]);
    await auditMonetisationConfigChange({
      adminUserId: adminId,
      fieldName: field,
      previousValue,
      newValue: String(value),
      reason: req.body.reason,
    });
    invalidateMonetisationConfigCache();
    const cfg = await loadMonetisationConfig(true);
    return res.json({ ok: true, config: cfg });
  } catch (err) {
    logger.error({ err, field }, "admin monetisation config patch failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const milestoneSchema = z.object({
  milestones: z.array(
    z.object({
      minQualifiedViews: z.number().int().nonnegative(),
      rewardPence: z.number().int().nonnegative(),
    }),
  ),
  reason: z.string().max(500).optional(),
});

router.put("/rewards/milestones", validateBody(milestoneSchema), async (req: Request, res: Response) => {
  const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM elix_creator_reward_milestones WHERE config_id = 'default'`);
    for (const m of req.body.milestones) {
      await client.query(
        `INSERT INTO elix_creator_reward_milestones (config_id, min_qualified_views, reward_pence)
         VALUES ('default', $1, $2)`,
        [m.minQualifiedViews, m.rewardPence],
      );
    }
    await client.query("COMMIT");
    await auditMonetisationConfigChange({
      adminUserId: adminId,
      fieldName: "milestones",
      previousValue: null,
      newValue: JSON.stringify(req.body.milestones),
      reason: req.body.reason,
    });
    invalidateMonetisationConfigCache();
    return res.json({ ok: true, milestones: req.body.milestones });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    logger.error({ err }, "admin milestones update failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  } finally {
    client.release();
  }
});

router.get("/reports/summary", async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  try {
    const r = await pool.query(`
      SELECT revenue_source,
             COUNT(*)::int AS entries,
             COALESCE(SUM(gross_pence),0)::bigint AS gross_pence,
             COALESCE(SUM(net_revenue_pence),0)::bigint AS net_pence,
             COALESCE(SUM(creator_amount_pence),0)::bigint AS creator_pence,
             COALESCE(SUM(platform_amount_pence),0)::bigint AS platform_pence
        FROM elix_financial_ledger
       WHERE reversal_of_id IS NULL
       GROUP BY revenue_source
       ORDER BY revenue_source`);
    const wallets = await pool.query(`
      SELECT COALESCE(SUM(pending_pence),0)::bigint AS pending,
             COALESCE(SUM(available_pence),0)::bigint AS available,
             COALESCE(SUM(withdrawn_pence),0)::bigint AS withdrawn,
             COALESCE(SUM(reversed_pence),0)::bigint AS reversed,
             COALESCE(SUM(held_pence),0)::bigint AS held
        FROM elix_creator_wallet_gbp`);
    const views = await pool.query(`
      SELECT COALESCE(SUM(qualified_reward_views),0)::bigint AS qualified,
             COALESCE(SUM(fraud_rejected_views),0)::bigint AS fraud_rejected
        FROM elix_video_view_metrics`);
    return res.json({
      by_source: r.rows,
      wallets: wallets.rows[0] || {},
      views: views.rows[0] || {},
    });
  } catch (err) {
    logger.error({ err }, "admin monetisation reports failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const settleLotSchema = z.object({
  provider: z.enum(["apple", "google"]),
  providerTransactionId: z.string().min(1),
  appStoreDeductionPence: z.number().int().nonnegative(),
  taxDeductionPence: z.number().int().nonnegative().optional(),
  processingDeductionPence: z.number().int().nonnegative().optional(),
  netPence: z.number().int().nonnegative().optional(),
});

router.post("/settlements/coin-lot", validateBody(settleLotSchema), async (req, res) => {
  const result = await applyIapSettlementToCoinLot(req.body);
  if (!result.ok) return res.status(400).json(result);
  return res.json(result);
});

const settlePromoteSchema = z.object({
  providerTransactionId: z.string().min(1),
  appStoreDeductionPence: z.number().int().nonnegative().default(0),
  taxDeductionPence: z.number().int().nonnegative().optional(),
  processingDeductionPence: z.number().int().nonnegative().optional(),
  netPence: z.number().int().nonnegative().optional(),
});

router.post("/settlements/promote", validateBody(settlePromoteSchema), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  try {
    const r = await pool.query(
      `SELECT * FROM elix_promote_purchases WHERE provider_transaction_id = $1 LIMIT 1`,
      [req.body.providerTransactionId],
    );
    if (!r.rowCount) return res.status(404).json({ error: "NOT_FOUND" });
    const row = r.rows[0];
    const gross =
      row.gross_pence != null
        ? Math.floor(Number(row.gross_pence))
        : Math.round(Number(row.amount_gbp || 0) * 100);
    const result = await postPromotePlatformRevenue({
      promotionId: String(row.id || req.body.providerTransactionId),
      userId: String(row.user_id),
      videoId: row.content_type === "video" ? String(row.content_id || "") : undefined,
      providerTransactionId: String(row.provider_transaction_id),
      grossPence: gross,
      appStoreDeductionPence: req.body.appStoreDeductionPence,
      taxDeductionPence: req.body.taxDeductionPence,
      processingDeductionPence: req.body.processingDeductionPence,
      netPence: req.body.netPence,
    });
    if (!result.ok) return res.status(500).json({ error: "LEDGER_FAILED" });
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "settle promote failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const settleSubSchema = z.object({
  externalTransactionId: z.string().min(1),
  subscriptionId: z.string().min(1),
  creatorUserId: z.string().min(1),
  payerUserId: z.string().min(1),
  appStoreDeductionPence: z.number().int().nonnegative().default(0),
  taxDeductionPence: z.number().int().nonnegative().optional(),
  processingDeductionPence: z.number().int().nonnegative().optional(),
  netPence: z.number().int().nonnegative().optional(),
  grossPence: z.number().int().nonnegative().optional(),
});

router.post("/settlements/subscription", validateBody(settleSubSchema), async (req, res) => {
  let gross = req.body.grossPence;
  if (gross == null) {
    const price = loadMembershipPriceConfig();
    const gbp = price.regions.find((r) => r.regionCode === "GB" || r.regionCode === "UK")?.price;
    gross = gbp
      ? moneyPartsToGbpPence(gbp) ??
        gbpStringToPence(`${gbp.units}.${String(Math.floor(gbp.nanos / 10_000_000)).padStart(2, "0")}`)
      : 999;
  }
  const result = await postCreatorSubscriptionRevenue({
    subscriptionId: req.body.subscriptionId,
    creatorUserId: req.body.creatorUserId,
    payerUserId: req.body.payerUserId,
    externalTransactionId: req.body.externalTransactionId,
    grossPence: gross,
    appStoreDeductionPence: req.body.appStoreDeductionPence,
    taxDeductionPence: req.body.taxDeductionPence,
    processingDeductionPence: req.body.processingDeductionPence,
    netPence: req.body.netPence,
  });
  if (!result.ok) return res.status(500).json({ error: "LEDGER_FAILED" });
  return res.json(result);
});

const reverseSchema = z.object({
  externalTransactionId: z.string().min(1),
  kind: z.enum(["REFUND_REVERSAL", "CHARGEBACK_REVERSAL"]),
  webhookEventId: z.string().min(1),
});

router.post("/settlements/reverse", validateBody(reverseSchema), async (req, res) => {
  const result = await reverseByExternalTransaction(req.body);
  return res.json(result);
});

router.post("/rewards/periods/open", async (_req, res) => {
  const id = await openCreatorRewardPeriod();
  if (!id) return res.status(400).json({ error: "OPEN_FAILED" });
  return res.json({ ok: true, periodId: id });
});

router.post("/rewards/periods/:periodId/close", async (req, res) => {
  const result = await closeCreatorRewardPeriod(String(req.params.periodId));
  return res.json({ ok: true, ...result });
});

router.get("/audit", async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  try {
    const r = await pool.query(
      `SELECT * FROM elix_monetisation_config_audit ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return res.json({ audit: r.rows });
  } catch (err) {
    logger.error({ err }, "admin monetisation audit failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

router.get("/reconciliation", async (_req, res) => {
  try {
    const { ensureReconcileTables } = await import("../lib/monetisation/reconcile");
    await ensureReconcileTables();
    const pool = getPool();
    const latest = pool
      ? await pool.query(
          `SELECT * FROM elix_reconciliation_runs ORDER BY created_at DESC LIMIT 10`,
        )
      : { rows: [] };
    return res.json({ runs: latest.rows });
  } catch (err) {
    logger.error({ err }, "admin reconciliation list failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

router.post("/reconciliation/run", async (_req, res) => {
  const { runWalletLedgerReconciliation } = await import("../lib/monetisation/reconcile");
  const result = await runWalletLedgerReconciliation();
  return res.json(result);
});

const gbpWdStatusSchema = z.object({
  toStatus: z.enum([
    "pending",
    "approved",
    "processing",
    "paid",
    "failed",
    "rejected",
    "cancelled",
  ]),
  note: z.string().max(500).optional(),
  payoutProviderRef: z.string().max(200).optional(),
  failureReason: z.string().max(500).optional(),
});

router.get("/withdrawals-gbp", async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  try {
    const r = await pool.query(
      `SELECT * FROM elix_creator_withdrawals_gbp ORDER BY created_at DESC LIMIT 200`,
    );
    return res.json({ withdrawals: r.rows });
  } catch (err) {
    logger.error({ err }, "admin list gbp withdrawals failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

router.post(
  "/withdrawals-gbp/:id/status",
  validateBody(gbpWdStatusSchema),
  async (req: Request, res: Response) => {
    const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
    const { adminSetGbpWithdrawalStatus } = await import("../lib/monetisation/gbpWithdrawals");
    const result = await adminSetGbpWithdrawalStatus({
      withdrawalId: String(req.params.id),
      toStatus: req.body.toStatus,
      adminUserId: adminId,
      note: req.body.note,
      payoutProviderRef: req.body.payoutProviderRef,
      failureReason: req.body.failureReason,
    });
    if (!result.ok) return res.status(400).json(result);
    return res.json({ ok: true });
  },
);

router.post("/withdrawals-gbp/:id/submit-provider", async (req: Request, res: Response) => {
  const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
  const { submitWithdrawalToProvider } = await import("../lib/monetisation/payoutProvider");
  const result = await submitWithdrawalToProvider({
    withdrawalId: String(req.params.id),
    adminUserId: adminId,
  });
  if (!result.ok) return res.status(400).json(result);
  return res.json(result);
});

const manualPaidSchema = z.object({
  note: z.string().min(8).max(1000),
  externalReference: z.string().max(200).optional(),
});

router.post(
  "/withdrawals-gbp/:id/mark-paid-manual",
  validateBody(manualPaidSchema),
  async (req: Request, res: Response) => {
    const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
    const { markPaidManualOffline } = await import("../lib/monetisation/payoutProvider");
    const result = await markPaidManualOffline({
      withdrawalId: String(req.params.id),
      adminUserId: adminId,
      note: req.body.note,
      externalReference: req.body.externalReference,
    });
    if (!result.ok) return res.status(400).json(result);
    return res.json({ ok: true, payment_rail: "manual_offline" });
  },
);

const importReportSchema = z.object({
  store: z.enum(["apple", "google"]),
  reportType: z.string().min(1).max(80),
  reportPeriod: z.string().max(80).optional(),
  sourceFilename: z.string().min(1).max(260),
  csvText: z.string().min(10).max(5_000_000),
});

router.post(
  "/financial-reports/import",
  validateBody(importReportSchema),
  async (req: Request, res: Response) => {
    const adminId = (req.authContext as NonNullable<typeof req.authContext>).userId;
    const { importStoreFinancialReport } = await import("../lib/monetisation/financialReports");
    const result = await importStoreFinancialReport({
      store: req.body.store,
      reportType: req.body.reportType,
      reportPeriod: req.body.reportPeriod,
      sourceFilename: req.body.sourceFilename,
      csvText: req.body.csvText,
      importedBy: adminId,
    });
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  },
);

router.get("/reports/dashboard", async (_req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  try {
    const [
      unsettledLots,
      settledLots,
      unmatchedLines,
      gifts,
      subs,
      promote,
      rewards,
      withdrawals,
      failedPayouts,
      refunds,
      fraudOpen,
      wallets,
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS c, COALESCE(SUM(gross_pence),0)::bigint AS gross
           FROM elix_paid_coin_lots WHERE settlement_status = 'pending_settlement'`,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c, COALESCE(SUM(net_pence),0)::bigint AS net
           FROM elix_paid_coin_lots WHERE settlement_status = 'settled'`,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM elix_store_financial_report_lines WHERE match_status = 'unmatched'`,
      ).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query(
        `SELECT COALESCE(SUM(creator_amount_pence),0)::bigint AS creator,
                COALESCE(SUM(platform_amount_pence),0)::bigint AS platform
           FROM elix_financial_ledger WHERE revenue_source = 'PAID_GIFT'`,
      ),
      pool.query(
        `SELECT COALESCE(SUM(creator_amount_pence),0)::bigint AS creator,
                COALESCE(SUM(platform_amount_pence),0)::bigint AS platform
           FROM elix_financial_ledger WHERE revenue_source = 'CREATOR_SUBSCRIPTION'`,
      ),
      pool.query(
        `SELECT COALESCE(SUM(platform_amount_pence),0)::bigint AS platform
           FROM elix_financial_ledger WHERE revenue_source = 'PROMOTE_VIDEO'`,
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS c, COALESCE(SUM(monthly_budget_pence),0)::bigint AS budget
           FROM elix_creator_reward_periods GROUP BY status`,
      ),
      pool.query(
        `SELECT status, payment_rail, COUNT(*)::int AS c,
                COALESCE(SUM(amount_pence),0)::bigint AS pence
           FROM elix_creator_withdrawals_gbp GROUP BY status, payment_rail`,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM elix_creator_withdrawals_gbp WHERE status = 'failed'`,
      ),
      pool.query(
        `SELECT revenue_source, COUNT(*)::int AS c,
                COALESCE(SUM(creator_amount_pence),0)::bigint AS creator
           FROM elix_financial_ledger
          WHERE revenue_source IN ('REFUND_REVERSAL','CHARGEBACK_REVERSAL')
          GROUP BY revenue_source`,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM elix_fraud_reviews WHERE status IN ('open','under_review')`,
      ).catch(() => ({ rows: [{ c: 0 }] })),
      pool.query(
        `SELECT COALESCE(SUM(pending_pence),0)::bigint AS pending,
                COALESCE(SUM(available_pence),0)::bigint AS available,
                COALESCE(SUM(held_pence),0)::bigint AS held,
                COALESCE(SUM(withdrawn_pence),0)::bigint AS withdrawn,
                COALESCE(SUM(reversed_pence),0)::bigint AS reversed
           FROM elix_creator_wallet_gbp`,
      ),
    ]);
    return res.json({
      unsettled_purchases: unsettledLots.rows[0],
      settled_paid_coin_lots: settledLots.rows[0],
      unmatched_financial_report_lines: unmatchedLines.rows[0],
      gifts: gifts.rows[0],
      subscriptions: subs.rows[0],
      promote: promote.rows[0],
      rewards_periods: rewards.rows,
      withdrawals: withdrawals.rows,
      failed_payouts: failedPayouts.rows[0],
      refunds_chargebacks: refunds.rows,
      fraud_review_open: fraudOpen.rows[0],
      wallets: wallets.rows[0],
      currency: "GBP",
    });
  } catch (err) {
    logger.error({ err }, "admin reports dashboard failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

export default router;
