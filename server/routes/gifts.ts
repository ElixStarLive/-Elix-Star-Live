/**
 * Gifts API: POST /api/gifts/send — validate and record gift (optional).
 * Real-time delivery stays via WebSocket (gift_sent). This endpoint can be used
 * for server-side validation, idempotency, or when client prefers REST.
 */

import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { getPool } from "../lib/postgres";
import { neonDebitGift, neonEnsureBalanceFromFile } from "../lib/walletNeon";

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

  const { room_id, gift_id, transaction_id, streamKey, giftId: giftIdAlt } = req.body ?? {};
  const roomId = typeof room_id === "string" ? room_id.trim() : (typeof streamKey === "string" ? streamKey.trim() : "");
  const giftId = typeof gift_id === "string" ? gift_id.trim() : (typeof giftIdAlt === "string" ? giftIdAlt.trim() : "");

  if (!roomId || !giftId) {
    return res.status(400).json({ error: "room_id and gift_id are required." });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "Database not configured" });

  const coinCost = Number(DEFAULT_GIFTS.find((g) => g.gift_id === giftId)?.coin_cost ?? 0);
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

  return res.status(200).json({
    ok: true,
    room_id: roomId,
    gift_id: giftId,
    transaction_id: clientTransactionId,
    message: "Gift sent. Delivery in room is via WebSocket.",
  });
}

// Static gift catalog — populated from env or hardcoded defaults.
// Replace with DB query when Hetzner Postgres is connected.
const DEFAULT_GIFTS = [
  {
    gift_id: "rose",
    name: "Rose",
    gift_type: "small",
    coin_cost: 1,
    animation_url: "/gifts/rose.webm",
    sfx_url: null,
    is_active: true,
  },
  {
    gift_id: "heart",
    name: "Heart",
    gift_type: "small",
    coin_cost: 5,
    animation_url: "/gifts/heart.webm",
    sfx_url: null,
    is_active: true,
  },
  {
    gift_id: "kiss",
    name: "Kiss",
    gift_type: "small",
    coin_cost: 10,
    animation_url: "/gifts/kiss.webm",
    sfx_url: null,
    is_active: true,
  },
  {
    gift_id: "crown",
    name: "Crown",
    gift_type: "big",
    coin_cost: 50,
    animation_url: "/gifts/crown.webm",
    sfx_url: null,
    is_active: true,
  },
  {
    gift_id: "diamond",
    name: "Diamond",
    gift_type: "big",
    coin_cost: 100,
    animation_url: "/gifts/diamond.webm",
    sfx_url: null,
    is_active: true,
  },
  {
    gift_id: "rocket",
    name: "Rocket",
    gift_type: "big",
    coin_cost: 500,
    animation_url: "/gifts/rocket.webm",
    sfx_url: null,
    is_active: true,
  },
  {
    gift_id: "elix_global_universe",
    name: "Elix Universe",
    gift_type: "universe",
    coin_cost: 1000,
    animation_url: "/gifts/elix_global_universe.webm",
    sfx_url: null,
    is_active: true,
  },
  {
    gift_id: "elix_live_universe",
    name: "Elix Live",
    gift_type: "universe",
    coin_cost: 2000,
    animation_url: "/gifts/elix_live_universe.webm",
    sfx_url: null,
    is_active: true,
  },
  {
    gift_id: "elix_gold_universe",
    name: "Elix Gold",
    gift_type: "universe",
    coin_cost: 5000,
    animation_url: "/gifts/elix_gold_universe.webm",
    sfx_url: null,
    is_active: true,
  },
];

/** GET /api/gifts/catalog — return active gifts */
export async function handleGetGiftCatalog(_req: Request, res: Response) {
  res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
  return res.status(200).json({ gifts: DEFAULT_GIFTS });
}

/** GET /api/sounds — return active sound tracks */
export async function handleGetSounds(_req: Request, res: Response) {
  // Return empty — sound library will be populated from Bunny CDN storage when ready
  return res.status(200).json({ sounds: [] });
}
