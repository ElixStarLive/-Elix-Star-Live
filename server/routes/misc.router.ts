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
  handleGetMembershipStatus,
} from "./misc";
import { handleRegisterDeviceToken, handleDeleteDeviceToken } from "./deviceTokens";
import { handlePostLiveShare, handleGetLiveShareRequests } from "./liveShareInbox";
import { handleGetMyActivity } from "./activity";
import { handleLiveModerationCheck } from "./moderation";
import { handleGetStickers, handleUploadSticker, handleDeleteSticker } from "./stickers";
import { validateBody } from "../middleware/validate";
import { blockUserSchema, reportSchema, verifyPurchaseSchema } from "../validation/schemas";
import { analyticsPostLimiter, moderationLimiter, verifyPurchaseLimiter, uploadLimiter } from "../middleware/rateLimit";

const router = Router();

// Analytics
router.post("/analytics/track", analyticsPostLimiter, handleAnalytics);

// Block & report
router.post("/block-user", moderationLimiter, validateBody(blockUserSchema), handleBlockUser);
router.post("/unblock-user", moderationLimiter, handleUnblockUser);
router.get("/blocked-users", handleListBlockedUsers);
router.post("/report", moderationLimiter, validateBody(reportSchema), handleReport);

// Live moderation
router.post("/live/moderation/check", handleLiveModerationCheck);

// IAP verification
router.post("/verify-purchase", verifyPurchaseLimiter, validateBody(verifyPurchaseSchema), handleVerifyPurchase);
router.post("/promote-iap-complete", verifyPurchaseLimiter, handlePromoteIAPComplete);
router.post("/membership/iap-complete", verifyPurchaseLimiter, handleMembershipIAPComplete);
router.get("/membership/:creatorId/status", handleGetMembershipStatus);

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

async function loadGiftRankings(intervalSql: "7 days" | "1 day") {
  const { getPool } = await import("../lib/postgres");
  const db = getPool();
  if (!db) return { ok: false as const, rankings: [] as Record<string, unknown>[] };
  const r = await db.query(
    `SELECT p.user_id, p.username, p.display_name, p.avatar_url,
            COALESCE(p.followers, 0) AS followers,
            COALESCE(e.total_received, 0) AS total_coins
     FROM profiles p
     JOIN (
       SELECT creator_id, SUM(coins) AS total_received
       FROM elix_creator_earnings
       WHERE kind = 'gift' AND created_at > NOW() - $1::interval
       GROUP BY creator_id
     ) e ON e.creator_id = p.user_id
     ORDER BY total_coins DESC, followers DESC
     LIMIT 50`,
    [intervalSql]
  );
  const rankings = r.rows.map((row: Record<string, unknown>, i: number) => ({
    rank: i + 1,
    user_id: row.user_id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    total_coins: Number(row.total_coins) || 0,
    followers_count: Number(row.followers) || 0,
  }));
  return { ok: true as const, rankings };
}

// Rankings
router.get("/rankings/weekly", async (req, res) => {
  res.setHeader("Cache-Control", "private, max-age=300");
  const { logger } = await import("../lib/logger");
  try {
    const result = await loadGiftRankings("7 days");
    if (!result.ok) return res.status(503).json({ error: "Database not available", rankings: [] });
    return res.json({ rankings: result.rankings });
  } catch (err) {
    logger.error({ err }, "GET /rankings/weekly failed");
    return res.status(500).json({ error: "Failed to load rankings", rankings: [] });
  }
});

router.get("/rankings/daily", async (req, res) => {
  res.setHeader("Cache-Control", "private, max-age=120");
  const { logger } = await import("../lib/logger");
  try {
    const result = await loadGiftRankings("1 day");
    if (!result.ok) return res.status(503).json({ error: "Database not available", rankings: [] });
    return res.json({ rankings: result.rankings });
  } catch (err) {
    logger.error({ err }, "GET /rankings/daily failed");
    return res.status(500).json({ error: "Failed to load rankings", rankings: [] });
  }
});

// Hashtags — resolve videos tagged with a hashtag (data lives in videos.hashtags JSONB).
router.get("/hashtags/:tag/videos", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  const { getPool } = await import("../lib/postgres");
  const { logger } = await import("../lib/logger");
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not available", videos: [] });
  const tag = String(req.params.tag || "").replace(/^#/, "").trim();
  if (!tag) return res.json({ videos: [] });
  try {
    const r = await db.query(
      `SELECT id,
              thumbnail AS thumbnail_url,
              COALESCE(views, 0) AS views_count,
              COALESCE(likes, 0) AS likes_count
       FROM videos
       WHERE COALESCE(privacy, 'public') <> 'private'
         AND jsonb_typeof(hashtags) = 'array'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(hashtags) AS h
           WHERE lower(regexp_replace(h, '^#', '')) = lower($1)
         )
       ORDER BY COALESCE(views, 0) DESC, created_at DESC NULLS LAST
       LIMIT 100`,
      [tag],
    );
    return res.json({ videos: r.rows });
  } catch (err) {
    logger.error({ err, tag }, "GET /hashtags/:tag/videos failed");
    return res.status(500).json({ error: "Failed to load hashtag videos", videos: [] });
  }
});

router.get("/hashtags/:tag", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  const { getPool } = await import("../lib/postgres");
  const { logger } = await import("../lib/logger");
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not available" });
  const tag = String(req.params.tag || "").replace(/^#/, "").trim();
  if (!tag) return res.json({ use_count: 0, trending_score: 0 });
  try {
    const r = await db.query(
      `SELECT COUNT(*)::int AS use_count
       FROM videos
       WHERE COALESCE(privacy, 'public') <> 'private'
         AND jsonb_typeof(hashtags) = 'array'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(hashtags) AS h
           WHERE lower(regexp_replace(h, '^#', '')) = lower($1)
         )`,
      [tag],
    );
    return res.json({ use_count: Number(r.rows[0]?.use_count ?? 0), trending_score: 0 });
  } catch (err) {
    logger.error({ err, tag }, "GET /hashtags/:tag failed");
    return res.status(500).json({ error: "Failed to load hashtag" });
  }
});

// Camera creative options — served as app config so the Create camera can
// populate filters/speeds/stickers. Static config (not user data).
const CAMERA_FILTERS = [
  { id: "none", name: "Normal", color: "#3A3A3A", filter: "none" },
  { id: "warm", name: "Warm", color: "#E8A87C", filter: "sepia(0.3) saturate(1.3) brightness(1.05)" },
  { id: "cool", name: "Cool", color: "#7CB5E8", filter: "saturate(1.2) hue-rotate(-10deg) brightness(1.03)" },
  { id: "vivid", name: "Vivid", color: "#E85C7A", filter: "saturate(1.6) contrast(1.1)" },
  { id: "vintage", name: "Vintage", color: "#C7A96B", filter: "sepia(0.5) contrast(0.95) brightness(1.05) saturate(1.1)" },
  { id: "fade", name: "Fade", color: "#B8B0A8", filter: "contrast(0.85) brightness(1.1) saturate(0.85)" },
  { id: "mono", name: "Mono", color: "#9A9A9A", filter: "grayscale(1) contrast(1.1)" },
  { id: "noir", name: "Noir", color: "#4A4A4A", filter: "grayscale(1) contrast(1.4) brightness(0.95)" },
];
const SPEED_OPTIONS = [
  { value: 0.3, label: "0.3x" },
  { value: 0.5, label: "0.5x" },
  { value: 1, label: "1x" },
  { value: 2, label: "2x" },
  { value: 3, label: "3x" },
];
const STICKER_OPTIONS = [
  "😀", "😍", "🔥", "❤️", "😂", "🎉", "👍", "💯", "✨", "🥳", "😎", "🙌",
  "💖", "🌟", "👀", "💪", "🎶", "🌈", "⭐", "😭", "🥰", "😳", "👑", "💎",
].map((emoji) => ({ emoji }));

router.get("/camera-filters", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ data: CAMERA_FILTERS });
});
router.get("/speed-options", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ data: SPEED_OPTIONS });
});
router.get("/sticker-options", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ data: STICKER_OPTIONS });
});

// Boosters catalog — served from the boosters table when present. No boosters
// are configured yet, so this returns an empty catalog (never fabricated data).
router.get("/boosters/catalog", async (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  const { getPool } = await import("../lib/postgres");
  const { logger } = await import("../lib/logger");
  const db = getPool();
  if (!db) return res.json({ data: [] });
  try {
    const exists = await db.query(
      `SELECT to_regclass('public.elix_boosters') AS tbl`,
    );
    if (!exists.rows[0]?.tbl) return res.json({ data: [] });
    const r = await db.query(
      `SELECT id, name, coin_cost, effect_type, is_active
       FROM elix_boosters ORDER BY coin_cost ASC`,
    );
    return res.json({ data: r.rows });
  } catch (err) {
    logger.error({ err }, "GET /boosters/catalog failed");
    return res.json({ data: [] });
  }
});

// Stickers
router.get("/stickers/:creatorUserId", handleGetStickers);
router.post("/stickers/upload", uploadLimiter, handleUploadSticker);
router.delete("/stickers/:id", handleDeleteSticker);

export default router;
