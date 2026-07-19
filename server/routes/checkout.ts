import { Request, Response } from "express";
import Stripe from "stripe";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { dbGetShopItemById } from "../lib/postgres";
import { valkeyRateCheck, isValkeyConfigured } from "../lib/valkey";
import { logger } from "../lib/logger";

const rateLimits = new Map<string, { count: number; timestamp: number }>();
const MAX_LOCAL_RATE_ENTRIES = 10_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) {
    if (now - v.timestamp > 120_000) rateLimits.delete(k);
  }
}, 60_000).unref();

async function checkRateLimit(userId: string, action: string) {
  const windowMs = 60 * 1000;
  const limit = 5;
  const key = `${userId}:${action}`;

  if (isValkeyConfigured()) {
    try {
      const allowed = await valkeyRateCheck(`rl:${key}`, windowMs, limit);
      return { allowed, retryAfter: Math.ceil(windowMs / 1000) };
    } catch {
      // Valkey unavailable — fall through to local
    }
  }

  const now = Date.now();
  const record = rateLimits.get(key) || { count: 0, timestamp: now };

  if (now - record.timestamp > windowMs) {
    record.count = 0;
    record.timestamp = now;
  }

  record.count++;
  if (rateLimits.size >= MAX_LOCAL_RATE_ENTRIES && !rateLimits.has(key)) {
    const oldest = rateLimits.keys().next().value;
    if (oldest) rateLimits.delete(oldest);
  }
  rateLimits.set(key, record);

  return {
    allowed: record.count <= limit,
    retryAfter: Math.ceil((record.timestamp + windowMs - now) / 1000),
  };
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  logger.warn("[shop-checkout] STRIPE_SECRET_KEY is not set in server environment");
}
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2025-01-27.acacia" })
  : (null as unknown as Stripe);

function getAuthenticatedUserId(req: Request): string | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const payload = verifyAuthToken(token);
  return payload?.sub ?? null;
}

function resolveOrigin(req: Request): string {
  const origin =
    (typeof req.headers.origin === "string" && req.headers.origin.trim()) ||
    process.env.CLIENT_URL;
  if (origin) return origin;
  // Construct from request when behind proxy; require CLIENT_URL in production
  const host = req.headers.host || req.headers["x-forwarded-host"];
  const proto = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  return host ? `${proto}://${host}` : "http://127.0.0.1:3000";
}

/** POST /api/shop/checkout — create Stripe Checkout for a shop item (physical goods) */
export async function createShopItemCheckout(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe is not configured" });
    }

    const authUserId = getAuthenticatedUserId(req);
    if (!authUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Accept a single itemId (legacy) or a basket of items. Dedupe and cap.
    const body = req.body ?? {};
    const rawIds: string[] = Array.isArray(body.items)
      ? body.items.map((i: { id?: unknown }) => String(i?.id ?? "")).filter(Boolean)
      : typeof body.itemId === "string" && body.itemId
        ? [body.itemId]
        : [];
    const itemIds = Array.from(new Set(rawIds)).slice(0, 10);
    if (itemIds.length === 0) {
      return res.status(400).json({ error: "itemId or items required" });
    }

    const rateCheck = await checkRateLimit(authUserId, "shop_buy");
    if (!rateCheck.allowed) {
      return res
        .status(429)
        .json({ error: "Too many requests", retryAfter: rateCheck.retryAfter });
    }

    // Validate every item server-side (same rules as single-item purchase).
    const items = await Promise.all(itemIds.map((id) => dbGetShopItemById(id)));
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || !item.is_active) {
        return res.status(404).json({ error: "An item is no longer available", itemId: itemIds[i] });
      }
      if (item.user_id === authUserId) {
        return res.status(400).json({ error: "Cannot buy your own item", itemId: itemIds[i] });
      }
      if (!item.price || item.price <= 0) {
        return res.status(400).json({ error: "An item has no valid price", itemId: itemIds[i] });
      }
      lineItems.push({
        price_data: {
          currency: "gbp",
          product_data: {
            name: item.title,
            description: item.description || "Shop item on Elix Star Live",
            ...(item.image_url ? { images: [item.image_url] } : {}),
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: 1,
      });
    }

    const validItems = items.filter(
      (it): it is NonNullable<typeof it> => !!it,
    );
    const origin = resolveOrigin(req);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/shop?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop?purchase=cancelled`,
      client_reference_id: authUserId,
      metadata: {
        type: "shop_item",
        userId: authUserId,
        // First item kept for legacy readers; itemIds carries the full basket.
        itemId: validItems[0].id,
        sellerId: validItems[0].user_id,
        itemIds: validItems.map((it) => it.id).join(","),
        itemTitle: validItems[0].title.slice(0, 200),
      },
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    logger.error({ err: error }, "Shop item checkout error");
    return res.status(500).json({ error: "Failed to create shop checkout" });
  }
}
