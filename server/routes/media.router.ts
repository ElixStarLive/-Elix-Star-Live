import { Router } from "express";
import express from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { uploadToBunny, isBunnyConfigured } from "../services/bunny";
import { handleUploadVideo, handleUploadAvatar } from "./upload";
import { uploadLimiter } from "../middleware/rateLimit";

const router = Router();

// Video upload: raw body (must come before express.json())
router.use(
  "/upload-file",
  express.raw({
    type: ["application/octet-stream", "video/mp4", "video/webm", "image/jpeg", "image/png", "image/webp"],
    limit: "600mb",
  }),
);

router.post("/upload-file", uploadLimiter, async (req, res) => {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "Not authenticated." });
  const payload = verifyAuthToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired session." });
  if (!isBunnyConfigured()) return res.status(503).json({ error: "Bunny storage not configured." });
  const storagePath = (req.query.path as string)?.trim();
  const ct = (req.query.ct as string)?.trim() || req.headers["content-type"] || "application/octet-stream";
  if (!storagePath || storagePath.includes("..")) return res.status(400).json({ error: "path query param is required and must be safe." });
  const body = req.body;
  if (!body || !(body instanceof Buffer) || body.length === 0) return res.status(400).json({ error: "Request body must be non-empty binary." });
  const result = await uploadToBunny(storagePath, body, ct);
  if (!result.success) return res.status(502).json({ error: result.error || "Upload failed." });
  return res.status(200).json({ path: result.path, cdnUrl: result.cdnUrl });
});

router.delete("/delete", async (req, res) => {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "Not authenticated." });
  const payload = verifyAuthToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired session." });
  const { path: storagePath } = req.body ?? {};
  if (!storagePath || typeof storagePath !== "string") return res.status(400).json({ error: "path is required in body." });
  const STORAGE_REGION = process.env.BUNNY_STORAGE_REGION || "de";
  const STORAGE_ZONE = (process.env.BUNNY_STORAGE_ZONE || "").split(".")[0];
  const ACCESS_KEY = process.env.BUNNY_STORAGE_API_KEY;
  if (!ACCESS_KEY || !STORAGE_ZONE) return res.status(503).json({ error: "Bunny storage not configured." });
  const baseUrl = STORAGE_REGION === "de" ? "https://storage.bunnycdn.com" : `https://${STORAGE_REGION}.storage.bunnycdn.com`;
  const url = `${baseUrl}/${STORAGE_ZONE}/${storagePath.replace(/^\/+/, "")}`;
  try {
    const delRes = await fetch(url, { method: "DELETE", headers: { AccessKey: ACCESS_KEY } });
    if (!delRes.ok && delRes.status !== 404) return res.status(500).json({ error: `Bunny delete failed (${delRes.status})` });
    return res.status(200).json({ success: true, path: storagePath });
  } catch {
    return res.status(502).json({ error: "Could not reach Bunny Storage" });
  }
});

router.use("/public", (req, res) => {
  const filePath = req.path.replace(/^\/+/, "");
  if (!filePath) return res.status(400).json({ error: "path is required" });
  const cdnHost = process.env.VITE_BUNNY_CDN_HOSTNAME || "";
  if (!cdnHost) return res.status(503).json({ error: "CDN hostname not configured" });
  return res.status(200).json({ url: `https://${cdnHost}/${filePath}` });
});

export default router;

// Separate video upload router (needs raw body BEFORE express.json)
export const videoUploadRouter = Router();
videoUploadRouter.use(
  express.raw({
    type: ["application/octet-stream", "video/mp4", "video/webm"],
    limit: "500mb",
  }),
  handleUploadVideo,
);
