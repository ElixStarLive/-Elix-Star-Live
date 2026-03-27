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

const router = Router();

// Analytics
router.post("/analytics/track", handleAnalytics);

// Block & report
router.post("/block-user", handleBlockUser);
router.post("/unblock-user", handleUnblockUser);
router.get("/blocked-users", handleListBlockedUsers);
router.post("/report", handleReport);

// Live moderation
router.post("/live/moderation/check", handleLiveModerationCheck);

// IAP verification
router.post("/verify-purchase", handleVerifyPurchase);
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
  const { getTokenFromRequest, verifyAuthToken } = await import("./auth");
  const { getPool } = await import("../lib/postgres");
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.json({ notifications: [] });
  const db = getPool();
  if (!db) return res.json({ notifications: [] });
  try {
    const r = await db.query(
      `SELECT id, user_id, type, title, body, action_url, read, created_at
       FROM elix_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [payload.sub],
    );
    return res.json({ notifications: r.rows });
  } catch {
    return res.json({ notifications: [] });
  }
});

// Hearts & Membership stats
router.get("/hearts/daily/:creatorUserId", async (req, res) => {
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
  const { dbGetCreatorMembershipStats } = await import("../lib/postgres");
  const stats = await dbGetCreatorMembershipStats(req.params.creatorId);
  return res.json(stats);
});

// Stickers
router.get("/stickers/:creatorUserId", handleGetStickers);
router.post("/stickers/upload", handleUploadSticker);
router.delete("/stickers/:id", handleDeleteSticker);

export default router;
