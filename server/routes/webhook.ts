import { Request, Response } from "express";
import Stripe from "stripe";
import { dbMarkShopItemSold } from "../lib/postgres";
import { neonInsertShopPurchase } from "../lib/walletNeon";
import { logger } from "../lib/logger";
import { postAlertWebhook } from "../lib/alerting";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  logger.warn("[stripe-webhook] STRIPE_SECRET_KEY is not set in server environment");
}

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2025-01-27.acacia" as unknown as Stripe.LatestApiVersion })
  : (null as unknown as Stripe);

// --- Main Webhook Handler ---
export async function handleStripeWebhook(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const isProd = process.env.NODE_ENV === "production";
  const sig = req.headers["stripe-signature"] as string | undefined;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

  let event: Stripe.Event;

  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe is not configured on server" });
    }

    // IMPORTANT: req.body MUST be a Buffer here (express.raw on this route)
    const rawBody = req.body as Buffer;

    if (isProd) {
      if (!sig || !webhookSecret) {
        return res.status(400).json({ error: "Missing signature or webhook secret" });
      }
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      if (sig && webhookSecret) {
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      } else if (webhookSecret) {
        // Secret is set but no signature — reject (possible tampering)
        return res.status(400).json({ error: "Missing Stripe signature" });
      } else {
        logger.warn("[stripe-webhook] DEV ONLY: No webhook secret configured, skipping signature check");
        event = JSON.parse(rawBody.toString("utf8"));
      }
    }
  } catch (err) {
    logger.error({ err }, "Webhook signature verification failed");
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleSuccessfulPayment(session);
        break;
      }
      default:
        // Stripe is shop-only here. Ignore non-shop/digital events.
        logger.info({ eventType: event.type }, "Ignoring non-shop Stripe event");
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ err: error }, "Webhook processing error");
    res.status(500).json({ error: "Webhook processing failed" });
  }
}

// --- Helper Functions ---

async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
  const type = session.metadata?.type;
  const userId = session.metadata?.userId;

  if (type !== "shop_item") {
    logger.warn({ type, sessionId: session.id }, "Rejected non-shop payment type");
    return;
  }

  // Only fulfil once Stripe confirms the money is actually captured. A
  // checkout.session.completed can arrive with payment_status "unpaid" for async
  // payment methods — those fulfil later via async_payment_succeeded.
  if (session.payment_status && session.payment_status !== "paid") {
    logger.info(
      { sessionId: session.id, paymentStatus: session.payment_status },
      "Shop checkout completed but not paid yet — deferring fulfilment",
    );
    return;
  }

  const itemId = session.metadata?.itemId || "";
  const sellerId = session.metadata?.sellerId || "";
  const amountGbp = session.amount_total ? session.amount_total / 100 : 0;

  // Record the purchase first (idempotent on stripe_session_id). If this returns
  // false the webhook is a duplicate delivery and nothing else should happen.
  const newlyInserted = await neonInsertShopPurchase({
    stripeSessionId: session.id,
    itemId,
    buyerId: userId || "",
    sellerId,
    amountGbp,
  });
  if (!newlyInserted) {
    logger.info({ itemId, sessionId: session.id }, "Duplicate shop webhook delivery — already fulfilled");
    return;
  }

  // First paid wins the single-quantity item. If a second buyer paid for an item
  // that is already sold, we have a genuine double-sale that needs a refund.
  const claimed = await dbMarkShopItemSold(itemId);
  if (!claimed) {
    logger.error(
      { itemId, buyerId: userId, sessionId: session.id, paymentIntent: session.payment_intent },
      "Double-sale: shop item already sold when this payment settled — refund required",
    );
    void postAlertWebhook({
      text: "Shop double-sale — buyer paid for an already-sold item and must be refunded",
      severity: "critical",
      context: {
        itemId,
        buyerId: userId || "",
        sessionId: session.id,
        paymentIntent: String(session.payment_intent || ""),
        amountGbp,
      },
    });
    return;
  }
  logger.info({ itemId, buyerId: userId }, "Shop item purchased");
}

