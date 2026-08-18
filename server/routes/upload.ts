/**
 * Upload API: upload video (and other files) to Bunny Storage.
 * Flow: Client sends file -> Backend -> Bunny Storage; users consume via CDN.
 */

import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { uploadToBunny, isBunnyConfigured, getBunnyConfigError } from "../services/bunny";
import { logger } from "../lib/logger";
import {
  extractVideoIdFromStoragePath,
  isVideoUpload,
  scanVideoUpload,
} from "../services/audioScan";
import { cacheAudioScanResult } from "../lib/audioScanValkey";

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
  // Enforce that uploads land under the authenticated user's own folder.
  const segs = path.replace(/^\/+/, "").split("/").filter(Boolean);
  const ownScoped = new Set(["videos", "stories", "thumbnails", "avatars", "shop"]);
  if (segs.length < 2 || !ownScoped.has(segs[0].toLowerCase()) || segs[1] !== auth.userId) {
    return res.status(403).json({ error: "You can only upload to your own storage path." });
  }

  const body = req.body;
  if (!body || !(body instanceof Buffer) || body.length === 0) {
    return res
      .status(400)
      .json({ error: "Request body must be non-empty binary (video file)." });
  }

  const contentType = req.headers["content-type"] || "video/mp4";

  if (isVideoUpload(contentType, path)) {
    const scan = await scanVideoUpload({
      buffer: body,
      contentType,
      storagePath: path,
      userId: auth.userId,
    });
    if (scan.action === "reject") {
      return res.status(403).json({
        error: "AUDIO_BLOCKED",
        code: "COPYRIGHT_AUDIO_BLOCKED",
        message:
          "This video contains copyrighted music. Remove the music or use sounds from the app library.",
        reason: scan.reason,
      });
    }
    const videoId = extractVideoIdFromStoragePath(path);
    if (videoId && scan.detectedTrack) {
      await cacheAudioScanResult(videoId, scan);
    }
  }

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
