import { Router } from "express";
import {
  handleAnalytics,
  handleBlockUser,
  handleUnblockUser,
  handleListBlockedUsers,
  handleReport,
  handleVerifyPurchase,
  handlePromoteIAPComplete,
  handleMembershipIAPComplete,
} from "./misc";
import { handleRegisterDeviceToken, handleDeleteDeviceToken } from "./deviceTokens";
import { handlePostLiveShare, handleGetLiveShareRequests } from "./liveShareInbox";
import { handleGetMyActivity } from "./activity";
import { handleLiveModerationCheck } from "./moderation";
import { handleGetStickers, handleUploadSticker, handleDeleteSticker } from "./stickers";
import { validateBody } from "../middleware/validate";
import { blockUserSchema, reportSchema, verifyPurchaseSchema } from "../validation/schemas";
import { analyticsPostLimiter, verifyPurchaseLimiter } from "../middleware/rateLimit";

const router = Router();

// Analytics
router.post("/analytics/track", analyticsPostLimiter, handleAnalytics);

// Block & report
router.post("/block-user", validateBody(blockUserSchema), handleBlockUser);
router.post("/unblock-user", handleUnblockUser);
router.get("/blocked-users", handleListBlockedUsers);
router.post("/report", validateBody(reportSchema), handleReport);

// Live moderation
router.post("/live/moderation/check", handleLiveModerationCheck);

// IAP verification
router.post("/verify-purchase", verifyPurchaseLimiter, validateBody(verifyPurchaseSchema), handleVerifyPurchase);
router.post("/promote-iap-complete", handlePromoteIAPComplete);
router.post("/membership/iap-complete", handleMembershipIAPComplete);

// Device tokens
router.post("/device-tokens", handleRegisterDeviceToken);
router.delete("/device-tokens", handleDeleteDeviceToken);

// Live share
router.post("/live-share", handlePostLiveShare);
router.get("/inbox/live-share-requests", handleGetLiveShareRequests);

// Activity & notifications
router.get("/activity", handleGetMyActivity);
router.get("/notifications", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const { getTokenFromRequest, verifyAuthToken } = await import("./auth");
  const { getPool } = await import("../lib/postgres");
  const { logger } = await import("../lib/logger");
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized", notifications: [] });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not available", notifications: [] });
  try {
    const r = await db.query(
      `SELECT id, user_id, type, title, body, action_url, read, created_at
       FROM elix_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [payload.sub],
    );
    return res.json({ notifications: r.rows });
  } catch (err) {
    logger.error({ err }, "GET /notifications failed");
    return res.status(500).json({ error: "Failed to load notifications", notifications: [] });
  }
});

// Hearts & Membership stats
router.get("/hearts/daily/:creatorUserId", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const { getTokenFromRequest, verifyAuthToken } = await import("./auth");
  const { dbGetDailyHeartCount, dbGetTotalHeartCount, dbHasSentDailyHeart } = await import("../lib/postgres");
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  const creatorId = req.params.creatorUserId;
  const todayCount = await dbGetDailyHeartCount(creatorId);
  const totalCount = await dbGetTotalHeartCount(creatorId);
  const hasSent = payload?.sub ? await dbHasSentDailyHeart(creatorId, payload.sub) : false;
  return res.json({ todayCount, totalCount, hasSent });
});

router.post("/hearts/daily", async (req, res) => {
  const { getTokenFromRequest, verifyAuthToken } = await import("./auth");
  const { dbSendDailyHeart } = await import("../lib/postgres");
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const { creatorId } = req.body ?? {};
  if (!creatorId) return res.status(400).json({ error: "creatorId required" });
  const result = await dbSendDailyHeart(creatorId, payload.sub);
  return res.json({ ok: result === "sent", already: result === "already" });
});

router.get("/membership/:creatorId", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const { dbGetCreatorMembershipStats } = await import("../lib/postgres");
  const stats = await dbGetCreatorMembershipStats(req.params.creatorId);
  return res.json(stats);
});

// Rankings
router.get("/rankings/weekly", async (req, res) => {
  res.setHeader("Cache-Control", "private, max-age=300");
  const { getPool } = await import("../lib/postgres");
  const { logger } = await import("../lib/logger");
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not available", rankings: [] });
  try {
    const r = await db.query(
      `SELECT p.user_id, p.username, p.display_name, p.avatar_url, p.followers_count,
              COALESCE(w.total_received, 0) AS total_coins
       FROM profiles p
       LEFT JOIN (
         SELECT recipient_id, SUM(amount) AS total_received
         FROM wallet_ledger
         WHERE type = 'gift_received' AND created_at > NOW() - INTERVAL '7 days'
         GROUP BY recipient_id
       ) w ON w.recipient_id = p.user_id
       ORDER BY total_coins DESC, p.followers_count DESC
       LIMIT 50`
    );
    const rankings = r.rows.map((row: any, i: number) => ({
      rank: i + 1,
      user_id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      total_coins: Number(row.total_coins) || 0,
      followers_count: Number(row.followers_count) || 0,
    }));
    return res.json({ rankings });
  } catch (err) {
    logger.error({ err }, "GET /rankings/weekly failed");
    return res.status(500).json({ error: "Failed to load rankings", rankings: [] });
  }
});

// Stickers
router.get("/stickers/:creatorUserId", handleGetStickers);
router.post("/stickers/upload", handleUploadSticker);
router.delete("/stickers/:id", handleDeleteSticker);

export default router;
