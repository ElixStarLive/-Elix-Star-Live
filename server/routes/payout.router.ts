import { Router } from "express";
import { logger } from "../lib/logger";
import {
  handleGetCreatorBalance, handleGetCreatorEarnings, handleCreatorWithdraw,
  handleGetCreatorPayouts, handleSetPayoutMethod, handleGetPayoutMethods,
  handleAdminListPayouts, handleAdminApprovePayout, handleAdminRejectPayout,
  handleAdminChargeback,
} from "./payout";

const creatorRouter = Router();
creatorRouter.get("/balance", handleGetCreatorBalance);
creatorRouter.get("/earnings", handleGetCreatorEarnings);
creatorRouter.post("/withdraw", handleCreatorWithdraw);
creatorRouter.get("/payouts", handleGetCreatorPayouts);
creatorRouter.post("/payout-method", handleSetPayoutMethod);
creatorRouter.get("/payout-methods", handleGetPayoutMethods);

const adminPayoutRouter = Router();
adminPayoutRouter.get("/payouts", handleAdminListPayouts);
adminPayoutRouter.post("/payout/:id/approve", handleAdminApprovePayout);
adminPayoutRouter.post("/payout/:id/reject", handleAdminRejectPayout);
adminPayoutRouter.post("/chargeback", handleAdminChargeback);
adminPayoutRouter.get("/reports", async (req, res) => {
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
  const status = req.query.status || "pending";
  try {
    const r = await db.query(
      `SELECT * FROM elix_reports WHERE status = $1 ORDER BY created_at DESC LIMIT 100`,
      [status],
    );
    return res.json({ data: r.rows });
  } catch (err) {
    logger.error({ err }, "admin/reports query failed");
    return res.status(500).json({ error: "DATABASE_ERROR" });
  }
});

adminPayoutRouter.get("/purchases", async (req, res) => {
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
    return res.json({ data: r.rows });
  } catch (err) {
    logger.error({ err }, "admin/purchases query failed");
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
    await db.query(`UPDATE elix_creator_balances SET locked_coins = 0, updated_at = NOW() WHERE user_id = $1`, [userId]);
    return res.json({ ok: true, userId });
  } catch (err) {
    logger.error({ err }, "admin/unfreeze failed");
    return res.status(500).json({ error: "DATABASE_ERROR" });
  }
});

export { creatorRouter, adminPayoutRouter };
