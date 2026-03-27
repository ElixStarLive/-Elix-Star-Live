/**
 * POST /api/live-share — share current live with another user (persists + optional WS).
 * GET /api/inbox/live-share-requests — people who shared a live with you, excluding users you follow.
 */

import type { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { listLiveShareRequestsNonFollowing } from "../lib/postgres";
import { executeLiveShareSend } from "../lib/liveShareOps";
import { logger } from "../lib/logger";

const postRate = new Map<string, number[]>();
function allowPost(userId: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const prev = postRate.get(userId) || [];
  const fresh = prev.filter((t) => now - t < windowMs);
  if (fresh.length >= max) return false;
  fresh.push(now);
  postRate.set(userId, fresh);
  return true;
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
  if (!allowPost(jwt.sub, 40, 60_000)) {
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
    res.json({ items });
  } catch (err) {
    logger.error({ err, userId: jwt.sub }, "handleGetLiveShareRequests failed");
    res.status(500).json({ error: "Failed to load requests" });
  }
}
