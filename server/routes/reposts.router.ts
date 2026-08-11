/**
 * Profile → Reposts API. One owner table: elix_reposts.
 */
import { Router, Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import {
  dbLiveStreamExists,
  dbListUserReposts,
  dbRepostExists,
  dbToggleRepost,
  type RepostTargetType,
} from "../lib/repostsNeon";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";
import { validateBody } from "../middleware/validate";
import { z } from "zod";

const router = Router();

const targetSchema = z.object({
  targetType: z.enum(["live", "video"]),
  targetId: z.string().trim().min(1).max(200),
});

function requireAuthUserId(req: Request, res: Response): string | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const payload = verifyAuthToken(token);
  if (!payload?.sub) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return payload.sub;
}

async function assertTargetExists(
  targetType: RepostTargetType,
  targetId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (targetType === "live") {
    const exists = await dbLiveStreamExists(targetId);
    if (!exists) {
      return { ok: false, status: 404, error: "Live stream not found" };
    }
    return { ok: true };
  }
  const pool = getPool();
  if (!pool) {
    return { ok: false, status: 503, error: "Database not configured" };
  }
  const r = await pool.query(`SELECT 1 FROM videos WHERE id = $1 LIMIT 1`, [targetId]);
  if ((r.rowCount ?? 0) === 0) {
    return { ok: false, status: 404, error: "Video not found" };
  }
  return { ok: true };
}

/** POST /api/reposts/toggle — one tap creates or removes; never duplicates. */
router.post("/toggle", validateBody(targetSchema), async (req: Request, res: Response) => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  const targetType = req.body.targetType as RepostTargetType;
  const targetId = String(req.body.targetId).trim();

  try {
    const check = await assertTargetExists(targetType, targetId);
    if (!check.ok) {
      return res.status(check.status).json({ error: check.error });
    }

    const { reposted } = await dbToggleRepost(userId, targetType, targetId);
    return res.status(200).json({
      ok: true,
      reposted,
      targetType,
      targetId,
    });
  } catch (err) {
    logger.error({ err, userId, targetType, targetId }, "POST /api/reposts/toggle failed");
    return res.status(500).json({ error: "Failed to save repost" });
  }
});

/** GET /api/reposts/status?targetType=live&targetId=... */
router.get("/status", async (req: Request, res: Response) => {
  const userId = requireAuthUserId(req, res);
  if (!userId) return;

  const targetTypeRaw = String(req.query.targetType || "").trim();
  const targetId = String(req.query.targetId || "").trim();
  if ((targetTypeRaw !== "live" && targetTypeRaw !== "video") || !targetId) {
    return res.status(400).json({ error: "targetType and targetId required" });
  }

  try {
    const reposted = await dbRepostExists(userId, targetTypeRaw, targetId);
    return res.status(200).json({ reposted, targetType: targetTypeRaw, targetId });
  } catch (err) {
    logger.error({ err, userId }, "GET /api/reposts/status failed");
    return res.status(500).json({ error: "Failed to load repost status" });
  }
});

/**
 * GET /api/reposts/list?user_id=&limit=&offset=
 * Lists that profile's reposts (public). Defaults to the authenticated user.
 */
router.get("/list", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;

  const queryUserId =
    typeof req.query.user_id === "string" ? req.query.user_id.trim() : "";
  const userId = queryUserId || payload?.sub || "";
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized", items: [] });
  }

  const limit = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50),
  );
  const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10) || 0);

  try {
    const items = await dbListUserReposts(userId, limit, offset);
    return res.status(200).json({
      items,
      limit,
      offset,
      hasMore: items.length === limit,
    });
  } catch (err) {
    logger.error({ err, userId }, "GET /api/reposts/list failed");
    return res.status(500).json({ error: "Failed to load reposts", items: [] });
  }
});

export default router;
