import { Router } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { addVideo, getVideoAsync, getAllVideosAsync, getVideosByUserAsync, deleteVideoFromCache, type Video } from "../lib/videoStore";
import { saveVideoToDb, deleteVideoFromDb, getPool } from "../lib/postgres";
import { logger } from "../lib/logger";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ error: "Not authenticated." });
    const payload = verifyAuthToken(token);
    if (!payload) return res.status(401).json({ error: "Invalid or expired session." });

    const body = req.body;
    if (!body || !body.url) {
      return res.status(400).json({ error: "url is required" });
    }

    const { getOrCreateProfile } = await import("./profiles");
    const profile = await getOrCreateProfile(payload.sub);

    const id =
      body.id || `vid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const video: Video = {
      id,
      url: body.url,
      thumbnail: body.thumbnailUrl || body.thumbnail_url || body.thumbnail || "",
      duration: body.duration || 0,
      userId: payload.sub,
      username: profile.username || body.username || "user",
      displayName: profile.displayName || body.displayName || "User",
      avatar: profile.avatarUrl || body.avatar || "",
      description: body.description || "",
      hashtags: body.hashtags || [],
      music: body.music || null,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      createdAt: body.createdAt || new Date().toISOString(),
      privacy: body.privacy || "public",
    };

    addVideo(video);
    await saveVideoToDb(video);
    logger.info({ videoId: id }, "Video created");

    return res.status(201).json(video);
  } catch (err: any) {
    logger.error({ err: err?.message || err }, "POST /api/videos failed");
    return res.status(500).json({ error: "Failed to create video" });
  }
});

router.get("/", async (_req, res) => {
  const videos = await getAllVideosAsync();
  res.json({ videos, total: videos.length });
});

router.get("/user/:userId", async (req, res) => {
  const videos = await getVideosByUserAsync(req.params.userId);
  res.json({ videos, total: videos.length });
});

router.get("/:id", async (req, res) => {
  const video = await getVideoAsync(req.params.id);
  if (!video) return res.status(404).json({ error: "Video not found" });
  res.json(video);
});

router.get("/:id/likes", async (req, res) => {
  const db = getPool();
  if (!db) return res.json({ users: [] });
  try {
    const r = await db.query(
      `SELECT l.user_id, p.username, p.display_name, p.avatar_url
       FROM likes l LEFT JOIN profiles p ON p.user_id = l.user_id
       WHERE l.video_id = $1 ORDER BY l.created_at DESC LIMIT 50`,
      [req.params.id],
    );
    return res.json({ users: r.rows });
  } catch {
    return res.json({ users: [] });
  }
});

// Like / Unlike
router.post("/:id/like", async (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    const ins = await db.query(
      `INSERT INTO likes (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [payload.sub, req.params.id],
    );
    if ((ins.rowCount ?? 0) > 0) {
      await db.query(`UPDATE videos SET likes = likes + 1 WHERE id = $1`, [req.params.id]).catch((e) => logger.warn({ err: e }, "like counter increment failed"));
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, videoId: req.params.id }, "like failed");
    return res.status(500).json({ error: "Like failed" });
  }
});

router.post("/:id/unlike", async (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    const r = await db.query(
      `DELETE FROM likes WHERE user_id = $1 AND video_id = $2`,
      [payload.sub, req.params.id],
    );
    if ((r.rowCount ?? 0) > 0) {
      await db.query(`UPDATE videos SET likes = GREATEST(likes - 1, 0) WHERE id = $1`, [req.params.id]).catch((e) => logger.warn({ err: e }, "like counter decrement failed"));
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, videoId: req.params.id }, "unlike failed");
    return res.status(500).json({ error: "Unlike failed" });
  }
});

// Save / Unsave
router.post("/:id/save", async (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    const ins = await db.query(
      `INSERT INTO saves (user_id, video_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [payload.sub, req.params.id],
    );
    if ((ins.rowCount ?? 0) > 0) {
      await db.query(`UPDATE videos SET saves = saves + 1 WHERE id = $1`, [req.params.id]).catch((e) => logger.warn({ err: e }, "save counter increment failed"));
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, videoId: req.params.id }, "save failed");
    return res.status(500).json({ error: "Save failed" });
  }
});

router.post("/:id/unsave", async (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    const r = await db.query(
      `DELETE FROM saves WHERE user_id = $1 AND video_id = $2`,
      [payload.sub, req.params.id],
    );
    if ((r.rowCount ?? 0) > 0) {
      await db.query(`UPDATE videos SET saves = GREATEST(saves - 1, 0) WHERE id = $1`, [req.params.id]).catch((e) => logger.warn({ err: e }, "save counter decrement failed"));
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, videoId: req.params.id }, "unsave failed");
    return res.status(500).json({ error: "Unsave failed" });
  }
});

// Comments
router.get("/:id/comments", async (req, res) => {
  const db = getPool();
  if (!db) return res.json({ comments: [] });
  const sort = req.query.sort === "oldest" ? "ASC" : "DESC";
  try {
    const r = await db.query(
      `SELECT c.id, c.video_id, c.user_id, c.text, c.parent_id, c.created_at,
              p.username, p.display_name, p.avatar_url
       FROM comments c LEFT JOIN profiles p ON p.user_id = c.user_id
       WHERE c.video_id = $1 ORDER BY c.created_at ${sort} LIMIT 200`,
      [req.params.id],
    );
    return res.json({ comments: r.rows });
  } catch (err) {
    logger.error({ err, videoId: req.params.id }, "get comments failed");
    return res.json({ comments: [] });
  }
});

router.post("/:id/comments", async (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const { text, parentId } = req.body ?? {};
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text is required" });
  }
  const id = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  try {
    await db.query(
      `INSERT INTO comments (id, video_id, user_id, text, parent_id) VALUES ($1, $2, $3, $4, $5)`,
      [id, req.params.id, payload.sub, text.trim(), parentId || null],
    );
    await db.query(`UPDATE videos SET comments = comments + 1 WHERE id = $1`, [req.params.id]).catch((e) => logger.warn({ err: e }, "comment counter increment failed"));
    const r = await db.query(
      `SELECT c.id, c.video_id, c.user_id, c.text, c.parent_id, c.created_at,
              p.username, p.display_name, p.avatar_url
       FROM comments c LEFT JOIN profiles p ON p.user_id = c.user_id
       WHERE c.id = $1`,
      [id],
    );
    return res.status(201).json({ comment: r.rows[0] || { id } });
  } catch (err) {
    logger.error({ err, videoId: req.params.id }, "post comment failed");
    return res.status(500).json({ error: "Failed to post comment" });
  }
});

router.delete("/:id/comments/:commentId", async (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    const r = await db.query(
      `DELETE FROM comments WHERE id = $1 AND user_id = $2`,
      [req.params.commentId, payload.sub],
    );
    if ((r.rowCount ?? 0) > 0) {
      await db.query(`UPDATE videos SET comments = GREATEST(comments - 1, 0) WHERE id = $1`, [req.params.id]).catch((e) => logger.warn({ err: e }, "comment counter decrement failed"));
    }
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, commentId: req.params.commentId }, "delete comment failed");
    return res.status(500).json({ error: "Failed to delete comment" });
  }
});

router.delete("/:id", async (req, res) => {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "Not authenticated." });
  const payload = verifyAuthToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired session." });

  const video = await getVideoAsync(req.params.id);
  if (!video) return res.status(404).json({ error: "Video not found" });
  if (video.userId !== payload.sub) return res.status(403).json({ error: "You can only delete your own videos." });

  deleteVideoFromCache(req.params.id);
  await deleteVideoFromDb(req.params.id);
  res.json({ ok: true });
});

export default router;
