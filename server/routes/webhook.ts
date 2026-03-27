import { Request, Response } from "express";
import Stripe from "stripe";
import { dbMarkShopItemSold } from "../lib/postgres";
import { neonInsertShopPurchase } from "../lib/walletNeon";

// --- Configuration ---
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.error("[stripe-webhook] STRIPE_SECRET_KEY is not set in server environment");
}

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2025-01-27.acacia" as any })
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
        console.warn("[stripe-webhook] DEV ONLY: No webhook secret configured, skipping signature check");
        event = JSON.parse(rawBody.toString("utf8"));
      }
    }
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return res.status(400).json({ error: "Invalid signature" });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleSuccessfulPayment(session);
        break;
      }
      default:
        // Stripe is shop-only here. Ignore non-shop/digital events.
        console.log("Ignoring non-shop Stripe event type: " + event.type);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}

// --- Helper Functions ---

async function handleSuccessfulPayment(session: Stripe.Checkout.Session) {
  const type = session.metadata?.type;
  const userId = session.metadata?.userId;

  if (type !== "shop_item") {
    console.warn("[stripe-webhook] Rejected non-shop payment type:", type || "unknown", session.id);
    return;
  }

  const itemId = session.metadata?.itemId || "";
  const sellerId = session.metadata?.sellerId || "";
  const amountGbp = session.amount_total ? session.amount_total / 100 : 0;
  try {
    await dbMarkShopItemSold(itemId);
    await neonInsertShopPurchase({
      stripeSessionId: session.id,
      itemId,
      buyerId: userId || "",
      sellerId,
      amountGbp,
    });
    console.log("Shop item purchased: item=" + itemId + " buyer=" + userId);
  } catch (err) {
    console.error("Failed to record shop purchase:", err);
  }
}

