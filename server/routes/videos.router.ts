import { Router } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { addVideo, getVideoAsync, getAllVideosAsync, getVideosByUserAsync, deleteVideoFromCache, type Video } from "../lib/videoStore";
import { saveVideoToDb, deleteVideoFromDb, getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import {
  detectedTrackToMusicMeta,
} from "../services/audioScan";
import { clearCachedAudioScanResult, getCachedAudioScanResult } from "../lib/audioScanValkey";
import { fetchVoiceOnlyVideoBuffer, isSafeMediaUrl } from "../services/videoDownload";
import { insertNotification } from "../lib/notifications";

const router = Router();

// User-scoped Bunny storage prefixes (mirror media.router.ts). A stored media
// URL must embed the owner's id right after one of these path segments.
const MEDIA_SCOPED_PREFIXES = new Set(["videos", "stories", "thumbnails", "avatars"]);

/**
 * Ownership guard: a media URL belongs to a user only when its path contains a
 * scoped prefix immediately followed by that user's id (e.g. videos/<uid>/...).
 * Blocks attaching another user's Bunny object to your own video record.
 */
function mediaUrlBelongsToUser(rawUrl: string, userId: string): boolean {
  try {
    const segs = new URL(rawUrl).pathname.split("/").filter(Boolean);
    for (let i = 0; i < segs.length - 1; i++) {
      if (MEDIA_SCOPED_PREFIXES.has(segs[i].toLowerCase()) && segs[i + 1] === userId) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

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
    if (typeof body.url !== "string" || !isSafeMediaUrl(body.url)) {
      return res.status(400).json({ error: "url must be an https Bunny CDN media URL" });
    }
    if (!mediaUrlBelongsToUser(body.url, payload.sub)) {
      return res.status(403).json({ error: "url must be your own uploaded media path." });
    }
    const thumb =
      body.thumbnailUrl || body.thumbnail_url || body.thumbnail || "";
    if (thumb && (typeof thumb !== "string" || !isSafeMediaUrl(thumb))) {
      return res.status(400).json({ error: "thumbnail must be an https Bunny CDN media URL" });
    }
    if (thumb && !mediaUrlBelongsToUser(thumb, payload.sub)) {
      return res.status(403).json({ error: "thumbnail must be your own uploaded media path." });
    }

    const { getOrCreateProfile } = await import("./profiles");
    const profile = await getOrCreateProfile(payload.sub);

    const requestedId =
      typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
    if (requestedId) {
      const db = getPool();
      if (db) {
        const owned = await db.query(
          `SELECT user_id FROM videos WHERE id = $1 LIMIT 1`,
          [requestedId],
        );
        const ownerId = owned.rows[0]?.user_id;
        if (ownerId && ownerId !== payload.sub) {
          return res.status(403).json({ error: "Not allowed to overwrite this video." });
        }
      }
    }
    const id =
      requestedId || `vid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    let music = body.music || null;
    if (!music && body.id) {
      const scan = await getCachedAudioScanResult(String(body.id));
      if (scan?.detectedTrack) {
        music = detectedTrackToMusicMeta(
          scan.detectedTrack,
          profile.displayName || "User",
        );
        await clearCachedAudioScanResult(String(body.id));
      }
    }

    const privacy =
      typeof body.privacy === "string" && body.privacy.trim()
        ? String(body.privacy).trim()
        : body.isPublic === false || body.isPrivate === true
          ? "private"
          : "public";

    const video: Video = {
      id,
      url: body.url,
      thumbnail: thumb || "",
      duration: body.duration || 0,
      userId: payload.sub,
      username: profile.username || body.username || "user",
      displayName: profile.displayName || body.displayName || "User",
      avatar: profile.avatarUrl || body.avatar || "",
      description: body.description || "",
      hashtags: body.hashtags || [],
      music,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      createdAt: body.createdAt || new Date().toISOString(),
      privacy,
    };

    addVideo(video);
    await saveVideoToDb(video);

    const videoMusic = music as { id?: string; provider?: string } | null;
    if (videoMusic?.provider === "epidemic_sound" && videoMusic.id) {
      const { reportTracksExported } = await import("../services/epidemicSound");
      void reportTracksExported(payload.sub, [String(videoMusic.id)], "OTHER");
    }

    logger.info({ videoId: id }, "Video created");

    return res.status(201).json(video);
  } catch (err) {
    logger.error({ err: (err as { message?: string })?.message || err }, "POST /api/videos failed");
    return res.status(500).json({ error: "Failed to create video" });
  }
});

router.get("/", async (_req, res) => {
  const videos = await getAllVideosAsync();
  res.json({ videos, total: videos.length });
});

router.get("/user/:userId", async (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  const videos = await getVideosByUserAsync(
    req.params.userId,
    200,
    payload?.sub === req.params.userId,
  );
  res.json({ videos, total: videos.length });
});

router.get("/saved/list", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized", videos: [] });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured", videos: [] });
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);
    const r = await db.query(
      `SELECT v.id, v.url, v.thumbnail, v.description, v.views, v.likes, v.created_at, v.user_id
       FROM saves s
       INNER JOIN videos v ON v.id = s.video_id
       WHERE s.user_id = $1
         AND (v.user_id = $1 OR COALESCE(v.privacy, 'public') <> 'private')
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [payload.sub, limit, offset],
    );
    return res.json({ videos: r.rows, limit, offset, hasMore: r.rows.length === limit });
  } catch (err) {
    logger.error({ err }, "GET saved/list failed");
    return res.status(500).json({ error: "Failed to load saved videos", videos: [] });
  }
});

router.get("/liked/list", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized", videos: [] });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured", videos: [] });
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);
    const r = await db.query(
      `SELECT v.id, v.url, v.thumbnail, v.description, v.views, v.likes, v.created_at, v.user_id
       FROM likes l
       INNER JOIN videos v ON v.id = l.video_id
       WHERE l.user_id = $1
         AND (v.user_id = $1 OR COALESCE(v.privacy, 'public') <> 'private')
       ORDER BY l.created_at DESC
       LIMIT $2 OFFSET $3`,
      [payload.sub, limit, offset],
    );
    return res.json({ videos: r.rows, limit, offset, hasMore: r.rows.length === limit });
  } catch (err) {
    logger.error({ err }, "GET liked/list failed");
    return res.status(500).json({ error: "Failed to load liked videos", videos: [] });
  }
});

/** GET /api/videos/:id/download — voice-only MP4 (licensed in-app music never included). */
router.get("/:id/download", async (req, res) => {
  try {
    const video = await getVideoAsync(req.params.id);
    if (!video?.url) {
      return res.status(404).json({ error: "Video not found" });
    }

    if (video.privacy === "private") {
      const token = getTokenFromRequest(req);
      const payload = token ? verifyAuthToken(token) : null;
      if (!payload?.sub || payload.sub !== video.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    if (!isSafeMediaUrl(video.url)) {
      return res.status(400).json({ error: "Video source is not downloadable" });
    }

    const buffer = await fetchVoiceOnlyVideoBuffer(video.url);
    const filename = `elix_${video.id}.mp4`;

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Length", String(buffer.length));
    return res.status(200).send(buffer);
  } catch (err) {
    logger.error({ err, videoId: req.params.id }, "GET /api/videos/:id/download failed");
    return res.status(502).json({ error: "DOWNLOAD_FAILED" });
  }
});

router.get("/:id", async (req, res) => {
  const video = await getVideoAsync(req.params.id);
  if (!video) return res.status(404).json({ error: "Video not found" });
  if (video.privacy === "private") {
    const token = getTokenFromRequest(req);
    const payload = token ? verifyAuthToken(token) : null;
    if (payload?.sub !== video.userId) {
      return res.status(404).json({ error: "Video not found" });
    }
  }
  res.json(video);
});

router.get("/:id/likes", async (req, res) => {
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured", users: [] });
  const gate = await getVideoAsync(req.params.id);
  if (gate?.privacy === "private") {
    const token = getTokenFromRequest(req);
    const payload = token ? verifyAuthToken(token) : null;
    if (payload?.sub !== gate.userId) {
      return res.status(404).json({ error: "Video not found", users: [] });
    }
  }
  try {
    const r = await db.query(
      `SELECT l.user_id, p.username, p.display_name, p.avatar_url
       FROM likes l LEFT JOIN profiles p ON p.user_id = l.user_id
       WHERE l.video_id = $1 ORDER BY l.created_at DESC LIMIT 50`,
      [req.params.id],
    );
    return res.json({ users: r.rows });
  } catch (err) {
    logger.error({ err, videoId: req.params.id }, "get likes failed");
    return res.status(500).json({ error: "Failed to load likes", users: [] });
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
      try {
        const owner = await db.query(`SELECT user_id FROM videos WHERE id = $1 LIMIT 1`, [req.params.id]);
        const ownerId = owner.rows[0]?.user_id ? String(owner.rows[0].user_id) : "";
        if (ownerId && ownerId !== payload.sub) {
          await insertNotification({
            userId: ownerId,
            type: "video_like",
            title: "New like",
            body: "Someone liked your video.",
            actionUrl: `/video/${encodeURIComponent(req.params.id)}`,
            data: { path: `/video/${req.params.id}`, video_id: req.params.id, actor_id: payload.sub },
          });
        }
      } catch (e) {
        logger.warn({ err: e, videoId: req.params.id }, "like notification skipped");
      }
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
  if (!db) return res.status(503).json({ error: "Database not configured", comments: [] });
  const gate = await getVideoAsync(req.params.id);
  if (gate?.privacy === "private") {
    const token = getTokenFromRequest(req);
    const payload = token ? verifyAuthToken(token) : null;
    if (payload?.sub !== gate.userId) {
      return res.status(404).json({ error: "Video not found", comments: [] });
    }
  }
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
    return res.status(500).json({ error: "Failed to load comments", comments: [] });
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
    const { dbIsBlockedEitherWay } = await import("../lib/postgres");
    const owner = await db.query(`SELECT user_id FROM videos WHERE id = $1 LIMIT 1`, [req.params.id]);
    const ownerId = owner.rows[0]?.user_id ? String(owner.rows[0].user_id) : "";
    if (ownerId && (await dbIsBlockedEitherWay(payload.sub, ownerId))) {
      return res.status(403).json({ error: "You cannot comment on this content." });
    }
    await db.query(
      `INSERT INTO comments (id, video_id, user_id, text, parent_id) VALUES ($1, $2, $3, $4, $5)`,
      [id, req.params.id, payload.sub, text.trim(), parentId || null],
    );
    await db.query(`UPDATE videos SET comments = comments + 1 WHERE id = $1`, [req.params.id]).catch((e) => logger.warn({ err: e }, "comment counter increment failed"));
    if (ownerId && ownerId !== payload.sub) {
      try {
        await insertNotification({
          userId: ownerId,
          type: "video_comment",
          title: "New comment",
          body: text.trim().slice(0, 80),
          actionUrl: `/video/${encodeURIComponent(req.params.id)}`,
          data: { path: `/video/${req.params.id}`, video_id: req.params.id, actor_id: payload.sub },
        });
      } catch (e) {
        logger.warn({ err: e, videoId: req.params.id }, "comment notification skipped");
      }
    }
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

router.post("/:id/comments/:commentId/like", async (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    await db.query(
      `INSERT INTO comment_likes (user_id, comment_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [payload.sub, req.params.commentId],
    );
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, commentId: req.params.commentId }, "comment like failed");
    return res.status(500).json({ error: "Failed to like comment" });
  }
});

router.post("/:id/comments/:commentId/unlike", async (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  try {
    await db.query(
      `DELETE FROM comment_likes WHERE user_id = $1 AND comment_id = $2`,
      [payload.sub, req.params.commentId],
    );
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, commentId: req.params.commentId }, "comment unlike failed");
    return res.status(500).json({ error: "Failed to unlike comment" });
  }
});

router.patch("/:id/comments/:commentId", async (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const { text } = req.body ?? {};
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text is required" });
  }
  try {
    const upd = await db.query(
      `UPDATE comments SET text = $1 WHERE id = $2 AND user_id = $3`,
      [text.trim(), req.params.commentId, payload.sub],
    );
    if ((upd.rowCount ?? 0) === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }
    const r = await db.query(
      `SELECT c.id, c.video_id, c.user_id, c.text, c.parent_id, c.created_at,
              p.username, p.display_name, p.avatar_url
       FROM comments c LEFT JOIN profiles p ON p.user_id = c.user_id
       WHERE c.id = $1`,
      [req.params.commentId],
    );
    return res.json({ comment: r.rows[0] || { id: req.params.commentId, text: text.trim() } });
  } catch (err) {
    logger.error({ err, commentId: req.params.commentId }, "edit comment failed");
    return res.status(500).json({ error: "Failed to edit comment" });
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

// POST /:id/fyp — persist an initial FYP score row for a freshly uploaded video
// (called by the client right after upload). Owner-only. The For You feed ranks
// primarily by recency; this row seeds the score table consumed by /feed/score.
router.post("/:id/fyp", async (req, res) => {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Not authenticated." });
  const db = getPool();
  if (!db) return res.status(503).json({ error: "Database not configured" });
  const video = await getVideoAsync(req.params.id);
  if (!video) return res.status(404).json({ error: "Video not found" });
  if (video.userId !== payload.sub) {
    return res.status(403).json({ error: "You can only boost your own videos." });
  }
  const initialScore = req.body?.boost === true ? 100 : 0;
  try {
    await db.query(
      `INSERT INTO video_scores (video_id, score, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (video_id)
       DO UPDATE SET score = GREATEST(video_scores.score, EXCLUDED.score), updated_at = NOW()`,
      [req.params.id, initialScore],
    );
    return res.json({ ok: true, video_id: req.params.id, score: initialScore });
  } catch (err) {
    logger.error({ err, videoId: req.params.id }, "fyp score persist failed");
    return res.status(500).json({ error: "Failed to record FYP score" });
  }
});

export default router;
