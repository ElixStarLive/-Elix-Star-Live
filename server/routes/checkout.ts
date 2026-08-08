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

/**
 * Capacitor WebView origins (http://localhost, capacitor://localhost) are
 * unreachable from the system browser Stripe redirects to after payment, so
 * they must never be used for success/cancel URLs. Real browser origins always
 * carry a domain or an explicit port (e.g. localhost:5173 in dev).
 */
function isNativeShellOrigin(origin: string): boolean {
  return /^(capacitor|ionic):\/\//i.test(origin) || /^https?:\/\/localhost$/i.test(origin);
}

function resolveOrigin(req: Request): string {
  const headerOrigin =
    typeof req.headers.origin === "string" ? req.headers.origin.trim() : "";
  const clientUrl = (process.env.CLIENT_URL || "").trim();
  if (process.env.NODE_ENV === "production") {
    if (!clientUrl.startsWith("https://") || /127\.0\.0\.1|localhost/i.test(clientUrl)) {
      throw new Error("CLIENT_URL must be https:// public origin in production");
    }
    return clientUrl.replace(/\/$/, "");
  }
  const origin =
    (headerOrigin && !isNativeShellOrigin(headerOrigin) && headerOrigin) ||
    clientUrl;
  if (origin) return origin;
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
    if (
      process.env.NODE_ENV === "production" &&
      !(process.env.STRIPE_SECRET_KEY || "").trim().startsWith("sk_live_")
    ) {
      return res.status(500).json({ error: "Stripe live key required in production" });
    }

    const authUserId = getAuthenticatedUserId(req);
    if (!authUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Accept a single itemId (legacy) or a basket of items with optional quantity.
    const body = req.body ?? {};
    type BasketLine = { id: string; quantity: number };
    const clampQty = (n: unknown) => {
      const q = Math.floor(Number(n));
      if (!Number.isFinite(q) || q < 1) return 1;
      return Math.min(99, q);
    };
    const lines: BasketLine[] = [];
    if (Array.isArray(body.items)) {
      for (const raw of body.items) {
        const id = String(raw?.id ?? "").trim();
        if (!id) continue;
        const quantity = clampQty(raw?.quantity);
        const existing = lines.find((l) => l.id === id);
        if (existing) {
          existing.quantity = clampQty(existing.quantity + quantity);
        } else {
          lines.push({ id, quantity });
        }
      }
    } else if (typeof body.itemId === "string" && body.itemId) {
      lines.push({ id: body.itemId, quantity: clampQty(body.quantity) });
    }
    const capped = lines.slice(0, 10);
    if (capped.length === 0) {
      return res.status(400).json({ error: "itemId or items required" });
    }

    const rateCheck = await checkRateLimit(authUserId, "shop_buy");
    if (!rateCheck.allowed) {
      return res
        .status(429)
        .json({ error: "Too many requests", retryAfter: rateCheck.retryAfter });
    }

    // Validate every item server-side (same rules as single-item purchase).
    const items = await Promise.all(capped.map((l) => dbGetShopItemById(l.id)));
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const line = capped[i];
      if (!item || !item.is_active) {
        return res.status(404).json({ error: "An item is no longer available", itemId: line.id });
      }
      if (item.user_id === authUserId) {
        return res.status(400).json({ error: "Cannot buy your own item", itemId: line.id });
      }
      if (!item.price || item.price <= 0) {
        return res.status(400).json({ error: "An item has no valid price", itemId: line.id });
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
        quantity: line.quantity,
      });
    }

    const validItems = items.filter(
      (it): it is NonNullable<typeof it> => !!it,
    );
    const origin = resolveOrigin(req);

    // Collect shipping so Clearpay (Afterpay UK) can appear for eligible GBP shop orders.
    // Do not hardcode payment_method_types — enable Afterpay/Clearpay in Stripe Dashboard.
    const session = await stripe.checkout.sessions.create({
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/shop?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop?purchase=cancelled`,
      client_reference_id: authUserId,
      shipping_address_collection: {
        allowed_countries: ["GB"],
      },
      metadata: {
        type: "shop_item",
        userId: authUserId,
        // First item kept for legacy readers; itemIds carries the full basket.
        itemId: validItems[0].id,
        sellerId: validItems[0].user_id,
        itemIds: validItems.map((it) => it.id).join(","),
        itemQtys: capped.map((l) => String(l.quantity)).join(","),
        itemTitle: validItems[0].title.slice(0, 200),
      },
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    logger.error({ err: error }, "Shop item checkout error");
    return res.status(500).json({ error: "Failed to create shop checkout" });
  }
}

/** GET /api/shop/checkout-session/:sessionId — payment status for the authenticated buyer only. */
export async function getShopCheckoutSession(req: Request, res: Response) {
  try {
    const authUserId = getAuthenticatedUserId(req);
    if (!authUserId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!stripe) {
      return res.status(503).json({ error: "Payments not configured" });
    }

    const sessionId = String(req.params.sessionId || "").trim();
    if (!sessionId.startsWith("cs_")) {
      return res.status(400).json({ error: "Invalid session id" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const owner =
      (typeof session.client_reference_id === "string" && session.client_reference_id) ||
      (typeof session.metadata?.userId === "string" && session.metadata.userId) ||
      "";
    if (!owner || owner !== authUserId) {
      return res.status(403).json({ error: "Session does not belong to this account" });
    }

    return res.status(200).json({
      sessionId: session.id,
      status: session.status,
      payment_status: session.payment_status,
      paid: session.payment_status === "paid",
    });
  } catch (error) {
    logger.error({ err: error }, "Shop checkout session lookup error");
    return res.status(500).json({ error: "Failed to look up checkout session" });
  }
}
