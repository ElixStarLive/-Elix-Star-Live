/**
 * Gifts API: POST /api/gifts/send — validate and record gift (optional).
 * Real-time delivery stays via WebSocket (gift_sent). This endpoint can be used
 * for server-side validation, idempotency, or when client prefers REST.
 */

import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { getPool, dbLoadGifts, dbGetGiftCost } from "../lib/postgres";
import { neonDebitGift, neonEnsureBalanceFromFile } from "../lib/walletNeon";
import { logger } from "../lib/logger";
import { assertGiftRestVelocityOk } from "../lib/fraud";
import {
  giftIconUrlFromAnimation,
  resolveGiftMediaUrl,
} from "../lib/giftAssets";

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

/** POST /api/gifts/send — send gift (server validates; broadcast still via WS in live room) */
export async function handleSendGift(req: Request, res: Response) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    const { room_id, gift_id, transaction_id, streamKey, giftId: giftIdAlt } = req.body ?? {};
    const roomId = typeof room_id === "string" ? room_id.trim() : (typeof streamKey === "string" ? streamKey.trim() : "");
    const giftId = typeof gift_id === "string" ? gift_id.trim() : (typeof giftIdAlt === "string" ? giftIdAlt.trim() : "");

    if (!roomId || !giftId) {
      return res.status(400).json({ error: "room_id and gift_id are required." });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database not configured" });

    const fraud = await assertGiftRestVelocityOk(auth.userId);
    if (!fraud.ok) {
      return res.status(429).json({ error: fraud.code });
    }

    const coinCost = await dbGetGiftCost(giftId);
    if (coinCost === null) {
      return res.status(400).json({ error: "INVALID_GIFT_ID" });
    }
    const clientTransactionId =
      typeof transaction_id === "string" && transaction_id.trim()
        ? transaction_id.trim()
        : `${auth.userId}:${roomId}:${giftId}:${Date.now()}`;

    if (coinCost > 0) {
      await neonEnsureBalanceFromFile(auth.userId);
      const debited = await neonDebitGift({
        userId: auth.userId,
        giftId,
        roomId,
        coins: coinCost,
        clientTransactionId,
      });
      if (!debited.ok) {
        return res.status(400).json({
          error: debited.error,
          new_balance: debited.newBalance,
        });
      }
      await pool.query(
        `INSERT INTO elix_gift_transactions (user_id, room_id, gift_id, coins, client_transaction_id, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (client_transaction_id) DO NOTHING`,
        [auth.userId, roomId, giftId, coinCost, clientTransactionId],
      );
      return res.status(200).json({
        ok: true,
        room_id: roomId,
        gift_id: giftId,
        transaction_id: clientTransactionId,
        new_balance: debited.newBalance,
        message: "Gift sent. Delivery in room is via WebSocket.",
      });
    }

    await pool.query(
      `INSERT INTO elix_gift_transactions (user_id, room_id, gift_id, coins, client_transaction_id, created_at)
       VALUES ($1, $2, $3, 0, $4, NOW())
       ON CONFLICT (client_transaction_id) DO NOTHING`,
      [auth.userId, roomId, giftId, clientTransactionId],
    );

    return res.status(200).json({
      ok: true,
      room_id: roomId,
      gift_id: giftId,
      transaction_id: clientTransactionId,
      message: "Gift sent. Delivery in room is via WebSocket.",
    });
  } catch (err) {
    logger.error({ err }, "handleSendGift failed");
    return res.status(500).json({ error: "GIFT_SEND_ERROR" });
  }
}

/** GET /api/gifts/catalog — return active gifts from DB */
export async function handleGetGiftCatalog(_req: Request, res: Response) {
  try {
    const rows = await dbLoadGifts();
    const gifts = rows.map((g) => {
      const animation_url = resolveGiftMediaUrl(g.animation_url);
      const icon_url = giftIconUrlFromAnimation(animation_url);
      return {
        ...g,
        animation_url,
        icon_url,
      };
    });
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    return res.status(200).json({ gifts });
  } catch (err) {
    logger.error({ err }, "handleGetGiftCatalog failed");
    return res.status(500).json({ error: "DATABASE_ERROR" });
  }
}

/** GET /api/sounds — licensed tracks for upload picker (Epidemic Sound or Neon fallback) */
export async function handleGetSounds(_req: Request, res: Response) {
  const { isEpidemicSoundConfigured, buildEpidemicSoundTracksForClient } = await import("./music");

  if (isEpidemicSoundConfigured()) {
    try {
      const tracks = await buildEpidemicSoundTracksForClient(60);
      res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
      return res.status(200).json({
        tracks,
        configured: true,
        source: "epidemic_sound",
      });
    } catch (err) {
      logger.error({ err }, "handleGetSounds epidemic failed");
      return res.status(502).json({ tracks: [], error: "MUSIC_PROVIDER_ERROR" });
    }
  }

  const pool = getPool();
  if (!pool) {
    return res.status(200).json({ tracks: [], configured: false, source: null });
  }
  try {
    const r = await pool.query(
      `SELECT id, title, artist, audio_url, cover_url, duration, use_count
       FROM sounds
       WHERE is_active = true
       ORDER BY use_count DESC, created_at DESC
       LIMIT 200`
    );
    const tracks = r.rows.map((row: {
      id: string | number;
      title: string;
      artist: string;
      audio_url: string;
      duration: number | string | null;
    }) => ({
      id: String(row.id),
      title: row.title,
      artist: row.artist,
      duration: typeof row.duration === "number"
        ? `${Math.floor(row.duration / 60)}:${String(row.duration % 60).padStart(2, "0")}`
        : String(row.duration || "0:30"),
      url: row.audio_url,
      license: "Licensed",
      source: "Catalog",
      provider: "local" as const,
      clipStartSeconds: 0,
      clipEndSeconds: 30,
    }));
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    return res.status(200).json({ tracks, configured: true, source: "database" });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01") {
      return res.status(200).json({ tracks: [], configured: false, source: null });
    }
    logger.error({ err }, "handleGetSounds failed");
    return res.status(500).json({ tracks: [], error: "Failed to load sounds" });
  }
}
