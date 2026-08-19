import { Request, Response } from "express";
import Stripe from "stripe";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { dbGetShopItemById } from "../lib/postgres";
import { logger } from "../lib/logger";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  logger.warn("[shop-checkout] STRIPE_SECRET_KEY is not set in server environment");
}
/**
 * Null when STRIPE_SECRET_KEY is absent. Both handlers below already check it; the
 * type now says so too, instead of casting null into a non-nullable client.
 *
 * The apiVersion cast stays: the shop is pinned to `2025-01-27.acacia`, and the
 * installed SDK's `LatestApiVersion` literal only admits its own shipped version.
 */
const stripe: Stripe | null = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion,
    })
  : null;

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

/** Sanitize client idempotency key for Stripe (max 255 chars total with prefix). */
function shopCheckoutIdempotencyKey(
  userId: string,
  raw: unknown,
): string | undefined {
  if (typeof raw !== "string") return undefined;
  const key = raw.trim();
  // Stripe idempotency keys: printable ASCII, 1–255 chars.
  if (key.length < 8 || key.length > 200) return undefined;
  if (!/^[A-Za-z0-9._~-]+$/.test(key)) return undefined;
  return `shop_cs_${userId}_${key}`.slice(0, 255);
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
    // Abuse rate-limit is user-scoped shopCheckoutLimiter middleware (not shared IP).
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

    // Validate every item server-side (same rules as single-item purchase).
    // No invented shop £10 floor. Charge the real basket total.
    // Stripe GBP card minimum is 30 pence — only that provider floor is enforced here.
    const STRIPE_GBP_MIN_PENCE = 30;
    const items = await Promise.all(capped.map((l) => dbGetShopItemById(l.id)));
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    let totalPence = 0;
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
      const unitAmount = Math.round(Number(item.price) * 100);
      if (!Number.isFinite(unitAmount) || unitAmount < 1) {
        return res.status(400).json({ error: "An item has no valid price", itemId: line.id });
      }
      totalPence += unitAmount * line.quantity;
      lineItems.push({
        price_data: {
          currency: "gbp",
          product_data: {
            name: item.title,
            description: item.description || "Shop item on Elix Star Live",
            ...(item.image_url ? { images: [item.image_url] } : {}),
          },
          unit_amount: unitAmount,
        },
        quantity: line.quantity,
      });
    }

    if (totalPence < STRIPE_GBP_MIN_PENCE) {
      return res.status(400).json({
        error: `Order total is below Stripe’s minimum for GBP (£${(STRIPE_GBP_MIN_PENCE / 100).toFixed(2)}). Increase the basket total to continue.`,
        code: "amount_below_provider_minimum",
        minimum_pence: STRIPE_GBP_MIN_PENCE,
        total_pence: totalPence,
      });
    }

    const validItems = items.filter(
      (it): it is NonNullable<typeof it> => !!it,
    );
    const origin = resolveOrigin(req);

    // Omit payment_method_types so Stripe dynamic payment methods can offer
    // Apple Pay (iOS), Google Pay (Android Chrome Custom Tabs), card, and Clearpay
    // when eligible. Wallets are Stripe payment methods — not a separate owner.
    // Android Shop must open session.url outside the WebView (see openStripeCheckoutUrl).
    //
    // Use the Elix Live payment method configuration (Google Pay + Apple Pay + card).
    // Stripe's "Default" config had Google Pay display_preference off, which hid GPay
    // even when Apple Pay appeared. Override via STRIPE_SHOP_PAYMENT_METHOD_CONFIGURATION.
    const shopPaymentMethodConfiguration =
      (process.env.STRIPE_SHOP_PAYMENT_METHOD_CONFIGURATION || "").trim() ||
      "pmc_1Szm2lPj8lNavJ3kH1M7kGHj";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      line_items: lineItems,
      mode: "payment",
      success_url: `${origin}/shop?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/shop?purchase=cancelled`,
      client_reference_id: authUserId,
      payment_method_configuration: shopPaymentMethodConfiguration,
      shipping_address_collection: {
        allowed_countries: ["GB"],
      },
      custom_text: {
        submit: {
          message:
            "Elix Live App will contribute 1% of your purchase to help people in need. Pay with Apple Pay, Google Pay, or card when available (Clearpay when eligible).",
        },
        shipping_address: {
          message:
            "Delivery address is required for shop orders. Apple Pay, Google Pay, and card may appear when supported; Clearpay when eligible for UK orders.",
        },
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
        charity_pledge_percent: "1",
        payment_methods_note: "apple_pay_google_pay_card_clearpay_via_stripe",
        payment_method_configuration: shopPaymentMethodConfiguration,
        order_total_pence: String(totalPence),
      },
    };

    const idempotencyKey = shopCheckoutIdempotencyKey(
      authUserId,
      body.idempotencyKey,
    );
    const session = await stripe.checkout.sessions.create(
      sessionParams,
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    // Surface real Stripe amount / rate errors honestly — never as a fake shop £10 rule
    // and never confuse Stripe API rate limits with our checkout abuse limiter.
    if (error instanceof Stripe.errors.StripeError) {
      const code = error.code || "";
      if (code === "amount_too_small") {
        return res.status(400).json({
          error:
            "Order total is below Stripe’s permitted minimum for this currency. Increase the basket total to continue.",
          code: "amount_below_provider_minimum",
        });
      }
      if (error.type === "StripeRateLimitError" || code === "rate_limit") {
        logger.warn({ err: error }, "Stripe API rate limit on shop checkout");
        return res.status(503).json({
          error: "Stripe is temporarily busy creating checkout. Please try again in a moment.",
          code: "stripe_busy",
        });
      }
      logger.error({ err: error, stripeCode: code }, "Shop item checkout Stripe error");
      return res.status(502).json({
        error: error.message || "Stripe could not create checkout",
        code: code || "stripe_error",
      });
    }
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
