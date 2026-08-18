/**
 * POST /api/live-share — share current live with another user (persists + optional WS).
 * GET /api/inbox/live-share-requests — people who shared a live with you, excluding users you follow.
 */

import type { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { listLiveShareRequestsNonFollowing } from "../lib/postgres";
import { executeLiveShareSend } from "../lib/liveShareOps";
import { isValkeyConfigured, valkeyRateCheck } from "../lib/valkey";
import { logger } from "../lib/logger";

// Dev/test only: local in-memory window when Valkey is off (never in production),
// matching the main API limiter and checkRateLimit.
const postRate = new Map<string, number[]>();
const MAX_POST_RATE_ENTRIES = 10_000;
const allowLocalRateLimit = process.env.NODE_ENV !== "production";

if (allowLocalRateLimit) {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of postRate) {
      const fresh = v.filter((t) => now - t < 60_000);
      if (fresh.length === 0) postRate.delete(k);
      else postRate.set(k, fresh);
    }
  }, 60_000).unref();
}

function allowPostLocal(userId: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const prev = postRate.get(userId) || [];
  const fresh = prev.filter((t) => now - t < windowMs);
  if (fresh.length >= max) return false;
  fresh.push(now);
  if (postRate.size >= MAX_POST_RATE_ENTRIES && !postRate.has(userId)) {
    const oldest = postRate.keys().next().value;
    if (oldest) postRate.delete(oldest);
  }
  postRate.set(userId, fresh);
  return true;
}

/**
 * A per-process window is not a limit once more than one instance is running:
 * the real send ceiling becomes the limit times the instance count, which is the
 * whole point of the limit for a message that lands in someone else's inbox.
 * Valkey holds the window, and production refuses rather than quietly loosening
 * it when Valkey cannot answer.
 */
async function allowPost(userId: string, max: number, windowMs: number): Promise<boolean> {
  if (isValkeyConfigured()) {
    try {
      return await valkeyRateCheck(`rl:live-share:${userId}`, windowMs, max);
    } catch (err) {
      if (!allowLocalRateLimit) {
        logger.error({ err, userId }, "live-share rate limit: Valkey unavailable — failing closed");
        return false;
      }
    }
  } else if (!allowLocalRateLimit) {
    logger.error({ userId }, "live-share rate limit: Valkey required in production");
    return false;
  }
  return allowPostLocal(userId, max, windowMs);
}

export async function handlePostLiveShare(req: Request, res: Response): Promise<void> {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const jwt = verifyAuthToken(token);
  if (!jwt?.sub) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }
  if (!(await allowPost(jwt.sub, 40, 60_000))) {
    res.status(429).json({ error: "Too many shares" });
    return;
  }

  const body = req.body ?? {};
  const targetUserId = typeof body.targetUserId === "string" ? body.targetUserId.trim() : "";
  const streamKey = typeof body.streamKey === "string" ? body.streamKey.trim() : "";
  const hostUserId = typeof body.hostUserId === "string" ? body.hostUserId.trim() : "";
  const hostName = typeof body.hostName === "string" ? body.hostName : "";
  const hostAvatar = typeof body.hostAvatar === "string" ? body.hostAvatar : "";
  const sharerName = typeof body.sharerName === "string" ? body.sharerName : "";
  const sharerAvatar = typeof body.sharerAvatar === "string" ? body.sharerAvatar : "";

  const result = await executeLiveShareSend({
    sharerId: jwt.sub,
    sharerName: sharerName || "Someone",
    sharerAvatar,
    targetUserId,
    streamKey,
    hostUserId,
    hostName,
    hostAvatar,
  });

  if (!result.ok) {
    res.status(400).json({ error: "Invalid share" });
    return;
  }

  res.status(200).json({ ok: true, persisted: result.persisted });
}

export async function handleGetLiveShareRequests(req: Request, res: Response): Promise<void> {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const jwt = verifyAuthToken(token);
  if (!jwt?.sub) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }

  try {
    const items = await listLiveShareRequestsNonFollowing(jwt.sub);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ items });
  } catch (err) {
    if (err instanceof Error && err.message === "DATABASE_UNAVAILABLE") {
      res.status(503).json({ error: "DATABASE_UNAVAILABLE" });
      return;
    }
    logger.error({ err, userId: jwt.sub }, "handleGetLiveShareRequests failed");
    res.status(500).json({ error: "Failed to load requests" });
  }
}
