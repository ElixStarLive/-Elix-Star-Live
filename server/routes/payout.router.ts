import { Router } from "express";
import { logger } from "../lib/logger";
import { creatorPayoutLimiter } from "../middleware/rateLimit";
import {
  handleGetCreatorBalance, handleSetPayoutMethod, handleGetPayoutMethods,
  handleAdminListPayouts, handleAdminApprovePayout, handleAdminRejectPayout,
  handleAdminChargeback, handleAdminMarkPayoutPaid, handleAdminCancelPayout,
  handleAdminReviewPayout,
  handleCreatorWithdrawGbp,
  handleGetCreatorGbpWithdrawals,
  handleGetCreatorLedgerHistory,
} from "./payout";

const creatorRouter = Router();
creatorRouter.get("/balance", handleGetCreatorBalance);
creatorRouter.post("/withdraw-gbp", creatorPayoutLimiter, handleCreatorWithdrawGbp);
creatorRouter.get("/withdrawals-gbp", handleGetCreatorGbpWithdrawals);
creatorRouter.get("/ledger", handleGetCreatorLedgerHistory);
creatorRouter.post("/payout-method", handleSetPayoutMethod);
creatorRouter.get("/payout-methods", handleGetPayoutMethods);

creatorRouter.post("/payout-account/onboard", creatorPayoutLimiter, async (req, res) => {
  try {
    const { getTokenFromRequest, verifyAuthToken } = await import("./auth");
    const token = getTokenFromRequest(req);
    const payload = token ? verifyAuthToken(token) : null;
    if (!payload) return res.status(401).json({ error: "Unauthorized" });
    const { createOrGetPayoutAccount } = await import("../lib/monetisation/payoutProvider");
    const result = await createOrGetPayoutAccount(payload.sub);
    if (!result.ok) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "payout-account onboard failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

creatorRouter.get("/payout-account", async (req, res) => {
  try {
    const { getTokenFromRequest, verifyAuthToken } = await import("./auth");
    const token = getTokenFromRequest(req);
    const payload = token ? verifyAuthToken(token) : null;
    if (!payload) return res.status(401).json({ error: "Unauthorized" });
    const { refreshPayoutAccountStatus } = await import("../lib/monetisation/payoutProvider");
    const { getPool } = await import("../lib/postgres");
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });

    const existing = await pool.query(
      `SELECT provider_account_id, payouts_enabled, verification_status, charges_enabled, onboarding_url
         FROM elix_creator_payout_accounts WHERE creator_user_id = $1 LIMIT 1`,
      [payload.sub],
    );
    if (!existing.rowCount) {
      return res.json({
        ok: true,
        accountId: null,
        onboardingUrl: null,
        payouts_enabled: false,
        verificationStatus: "none",
      });
    }

    await refreshPayoutAccountStatus(payload.sub);
    const row = await pool.query(
      `SELECT provider_account_id, payouts_enabled, verification_status, charges_enabled, onboarding_url
         FROM elix_creator_payout_accounts WHERE creator_user_id = $1 LIMIT 1`,
      [payload.sub],
    );
    const r = row.rows[0];
    return res.json({
      ok: true,
      accountId: r.provider_account_id,
      onboardingUrl: r.onboarding_url,
      payouts_enabled: r.payouts_enabled === true,
      charges_enabled: r.charges_enabled === true,
      verificationStatus: String(r.verification_status || "pending"),
    });
  } catch (err) {
    logger.error({ err }, "payout-account get failed");
    return res.status(500).json({ error: "SERVER_ERROR" });
  }
});

const adminPayoutRouter = Router();
adminPayoutRouter.get("/payouts", handleAdminListPayouts);
adminPayoutRouter.post("/payout/:id/approve", handleAdminApprovePayout);
adminPayoutRouter.post("/payout/:id/reject", handleAdminRejectPayout);
adminPayoutRouter.post("/payout/:id/mark-paid", handleAdminMarkPayoutPaid);
adminPayoutRouter.post("/payout/:id/cancel", handleAdminCancelPayout);
adminPayoutRouter.post("/payout/:id/review", handleAdminReviewPayout);
adminPayoutRouter.post("/chargeback", handleAdminChargeback);
// NOTE: GET /reports is intentionally NOT defined here. The richer handler in
// adminActions.ts serves it (reporter username join, admin_note, and correct
// all-statuses filtering). Defining it here shadowed that handler and broke the
// "All" reports filter + reporter names on the admin dashboard.

adminPayoutRouter.get("/shop-purchases", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const { getPool } = await import("../lib/postgres");
  const { getTokenFromRequest, verifyAuthToken } = await import("./auth");
  const db = getPool();
  if (!db) return res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload) return res.status(401).json({ error: "Unauthorized" });
  const adminR = await db.query(`SELECT is_admin FROM profiles WHERE user_id = $1`, [payload.sub]);
  if (!adminR.rows.length || !adminR.rows[0].is_admin) return res.status(403).json({ error: "Admin only" });
  try {
    const r = await db.query(
      `SELECT * FROM elix_shop_purchases ORDER BY created_at DESC LIMIT 100`,
    );
    return res.json({ data: r.rows, source: "shop" });
  } catch (err) {
    logger.error({ err }, "admin/shop-purchases query failed");
    return res.status(500).json({ error: "DATABASE_ERROR" });
  }
});

adminPayoutRouter.post("/unfreeze/:userId", async (req, res) => {
  try {
    const { getPool } = await import("../lib/postgres");
    const { getTokenFromRequest, verifyAuthToken } = await import("./auth");
    const db = getPool();
    if (!db) return res.status(503).json({ error: "Database not configured" });
    const token = getTokenFromRequest(req);
    const payload = token ? verifyAuthToken(token) : null;
    if (!payload) return res.status(401).json({ error: "Unauthorized" });
    const adminR = await db.query(`SELECT is_admin FROM profiles WHERE user_id = $1`, [payload.sub]);
    if (!adminR.rows.length || !adminR.rows[0].is_admin) return res.status(403).json({ error: "Admin only" });
    const { userId } = req.params;
    // Release only coins no open payout request still reserves. Zeroing
    // locked_coins destroyed a creator's reserved earnings, and left open
    // requests able to approve against a lock that no longer existed.
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const reservedR = await client.query(
        `SELECT COALESCE(SUM(coins_amount), 0)::bigint AS reserved
           FROM elix_payout_requests
          WHERE user_id = $1
            AND status IN ('pending', 'under_review', 'approved')`,
        [userId],
      );
      const reserved = Math.max(0, Math.floor(Number(reservedR.rows[0]?.reserved) || 0));
      const balR = await client.query(
        `SELECT locked_coins FROM elix_creator_balances WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      if (!balR.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Creator balance not found" });
      }
      const locked = Math.max(0, Math.floor(Number(balR.rows[0].locked_coins) || 0));
      const released = Math.max(0, locked - reserved);
      await client.query(
        `UPDATE elix_creator_balances
            SET locked_coins = $2,
                available_coins = available_coins + $3,
                updated_at = NOW()
          WHERE user_id = $1`,
        [userId, reserved, released],
      );
      await client.query("COMMIT");
      logger.info({ userId, adminId: payload.sub, released, reserved }, "admin unfreeze released stuck locked coins");
      return res.json({ ok: true, userId, released, still_reserved: reserved });
    } catch (e) {
      await client.query("ROLLBACK").catch((re) => logger.warn({ err: re }, "ROLLBACK failed"));
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error({ err }, "admin/unfreeze failed");
    return res.status(500).json({ error: "DATABASE_ERROR" });
  }
});

// NOTE: GET /stats/dau is intentionally NOT defined here. adminActions.ts serves
// it with identical output ({ dau }) via the shared RBAC middleware. Keeping a
// duplicate here only shadowed that handler with no behavioural difference.

export { creatorRouter, adminPayoutRouter };
