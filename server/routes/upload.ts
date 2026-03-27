/**
 * Upload API: upload video (and other files) to Bunny Storage.
 * Flow: Client sends file -> Backend -> Bunny Storage; users consume via CDN.
 */

import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { uploadToBunny, isBunnyConfigured, getBunnyConfigError } from "../services/bunny";
import { logger } from "../lib/logger";

function requireAuth(req: Request, res: Response): { userId: string } | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated." });
    return null;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired session." });
    return null;
  }
  return { userId: payload.sub };
}

/**
 * POST /api/upload/video
 * Body: raw binary (Content-Type: application/octet-stream or video/*)
 * Query: path=streams/filename.mp4 (required path under storage zone)
 * Or use multipart later with multer if needed.
 */
export async function handleUploadVideo(req: Request, res: Response) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  if (!isBunnyConfigured()) {
    return res.status(503).json({ error: getBunnyConfigError() });
  }

  const path = (req.query.path as string)?.trim();
  if (!path || path.includes("..")) {
    return res
      .status(400)
      .json({
        error:
          'Query "path" is required and must be a safe path (e.g. streams/video.mp4).',
      });
  }

  const body = req.body;
  if (!body || !(body instanceof Buffer) || body.length === 0) {
    return res
      .status(400)
      .json({ error: "Request body must be non-empty binary (video file)." });
  }

  const contentType = req.headers["content-type"] || "video/mp4";
  const result = await uploadToBunny(path, body, contentType);

  if (!result.success) {
    logger.error({ path, error: result.error }, "Video upload to Bunny failed");
    return res.status(502).json({ error: result.error || "Upload failed." });
  }

  return res.status(201).json({
    path: result.path,
    cdn_url: result.cdnUrl,
  });
}

/**
 * POST /api/upload/avatar
 * Body: raw image binary (Content-Type: image/*)
 * Query: userId=xxx (optional, defaults to authenticated user)
 */
export async function handleUploadAvatar(req: Request, res: Response) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  // If Bunny not configured, return a generated avatar so the app still works
  if (!isBunnyConfigured()) {
    const userId = (req.query.userId as string)?.trim() || auth.userId;
    return res.status(200).json({
      cdn_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(userId)}&background=random&size=400`,
      url: "",
      path: "",
    });
  }

  const userId = (req.query.userId as string)?.trim() || auth.userId;
  const contentType = (req.headers["content-type"] || "image/jpeg")
    .split(";")[0]
    .trim();
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const ext = extMap[contentType] || "jpg";
  const path = `avatars/${userId}/${Date.now()}.${ext}`;

  const body = req.body;
  if (!body || !(body instanceof Buffer) || body.length === 0) {
    return res
      .status(400)
      .json({ error: "Request body must be a non-empty image." });
  }

  const result = await uploadToBunny(path, body, contentType);
  if (!result.success) {
    logger.error({ path, error: result.error }, "Avatar upload to Bunny failed");
    return res
      .status(502)
      .json({ error: result.error || "Avatar upload failed." });
  }

  return res.status(201).json({
    path: result.path,
    cdn_url: result.cdnUrl || "",
  });
}
