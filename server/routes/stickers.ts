import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { dbGetCreatorStickers, dbAddCreatorSticker, dbDeleteCreatorSticker } from "../lib/postgres";
import { logger } from "../lib/logger";

export async function handleGetStickers(req: Request, res: Response) {
  const { creatorUserId } = req.params;
  if (!creatorUserId) return res.status(400).json({ error: "Missing creatorUserId" });
  try {
    const stickers = await dbGetCreatorStickers(creatorUserId);
    return res.json({ stickers });
  } catch (err) {
    logger.error({ err, creatorUserId }, "handleGetStickers failed");
    return res.json({ stickers: [] });
  }
}

export async function handleUploadSticker(req: Request, res: Response) {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });

  const contentType = req.headers["content-type"] || "";
  if (!contentType.startsWith("image/")) {
    return res.status(400).json({ error: "Content-Type must be image/*" });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length === 0) return res.status(400).json({ error: "Empty body" });
  if (buffer.length > 2 * 1024 * 1024) return res.status(413).json({ error: "Sticker too large (max 2MB)" });

  const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg";
  const fileName = `stickers/${payload.sub}/${Date.now()}.${ext}`;

  let imageUrl = "";
  const bunnyZone = process.env.BUNNY_STORAGE_ZONE;
  const bunnyKey = process.env.BUNNY_STORAGE_API_KEY;
  const bunnyHost = process.env.BUNNY_STORAGE_HOSTNAME;

  if (bunnyZone && bunnyKey && bunnyHost) {
    try {
      const uploadRes = await fetch(
        `https://storage.bunnycdn.com/${bunnyZone}/${fileName}`,
        {
          method: "PUT",
          headers: { AccessKey: bunnyKey, "Content-Type": contentType },
          body: buffer,
        },
      );
      if (!uploadRes.ok) {
        logger.error({ status: uploadRes.status }, "Bunny sticker upload failed");
        return res.status(502).json({ error: "Upload failed" });
      }
      imageUrl = `https://${bunnyHost}/${fileName}`;
    } catch (err) {
      logger.error({ err }, "Bunny sticker upload error");
      return res.status(502).json({ error: "Upload failed" });
    }
  } else {
    const b64 = buffer.toString("base64");
    imageUrl = `data:${contentType};base64,${b64}`;
  }

  const sticker = await dbAddCreatorSticker(payload.sub, imageUrl, "");
  if (!sticker) return res.status(400).json({ error: "Max sticker limit reached (20)" });
  return res.json({ sticker });
}

export async function handleDeleteSticker(req: Request, res: Response) {
  const token = getTokenFromRequest(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload?.sub) return res.status(401).json({ error: "Unauthorized" });

  const id = Number(req.params.id);
  if (!id || isNaN(id)) return res.status(400).json({ error: "Invalid sticker id" });

  const deleted = await dbDeleteCreatorSticker(payload.sub, id);
  if (!deleted) return res.status(404).json({ error: "Sticker not found or not yours" });
  return res.json({ ok: true });
}
