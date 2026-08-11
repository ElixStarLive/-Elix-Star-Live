/**
 * Read-only: prove live Stripe platform + Connect create readiness for Elix Star Live.
 * Uses STRIPE_SECRET_KEY from .env. Never prints secret values.
 * Usage: npx tsx server/scripts/checkStripeLiveReady.ts
 */
import "../config.ts";
import Stripe from "stripe";

function mask(id: string | undefined | null): string {
  if (!id) return "(none)";
  if (id.length <= 10) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

async function main(): Promise<void> {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  const whsec = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  const pub = (process.env.VITE_STRIPE_PUBLISHABLE_KEY || "").trim();
  const connectMode = String(process.env.ELIX_STRIPE_CONNECT_MODE || "").trim();

  const inventory = {
    STRIPE_SECRET_KEY: key
      ? { present: true, live: key.startsWith("sk_live_"), len: key.length }
      : { present: false },
    STRIPE_WEBHOOK_SECRET: whsec
      ? { present: true, looksWhsec: whsec.startsWith("whsec_"), len: whsec.length }
      : { present: false },
    VITE_STRIPE_PUBLISHABLE_KEY: pub
      ? { present: true, live: pub.startsWith("pk_live_"), len: pub.length }
      : { present: false },
    ELIX_STRIPE_CONNECT_MODE: connectMode || "(unset)",
  };

  if (!key.startsWith("sk_live_")) {
    console.log(JSON.stringify({ status: "NOT_LIVE_KEY", inventory }, null, 2));
    process.exit(2);
  }

  const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion });

  const account = await stripe.accounts.retrieve();
  const platform = {
    id: account.id,
    business_profile_name: account.business_profile?.name ?? null,
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    country: account.country,
    type: account.type,
  };

  let expressCreate: { ok: boolean; message?: string; accountId?: string } = { ok: false };
  try {
    // Accounts v2 recipient path used by this app; fall back to v1 Express if needed for readiness signal.
    const created = await stripe.accounts.create({
      type: "express",
      country: "GB",
      capabilities: {
        transfers: { requested: true },
      },
      metadata: { elix_probe: "live_ready_check", created_at: new Date().toISOString() },
    });
    expressCreate = { ok: true, accountId: mask(created.id) };
    // Clean up probe account if Stripe allows delete (Express often cannot be deleted immediately).
    try {
      await stripe.accounts.del(created.id);
    } catch {
      /* leave orphan probe; harmless */
    }
  } catch (e: unknown) {
    const err = e as { message?: string; code?: string; type?: string; raw?: { message?: string } };
    expressCreate = {
      ok: false,
      message: err.raw?.message || err.message || String(e),
    };
  }

  let checkout: { ok: boolean; id?: string; message?: string } = { ok: false };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: "https://www.elixstarlive.co.uk/?stripe=ok",
      cancel_url: "https://www.elixstarlive.co.uk/?stripe=cancel",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            unit_amount: 50,
            product_data: { name: "Elix live readiness probe (do not pay)" },
          },
          quantity: 1,
        },
      ],
      metadata: { elix_probe: "live_ready_check" },
    });
    checkout = { ok: true, id: mask(session.id) };
  } catch (e: unknown) {
    const err = e as { message?: string; raw?: { message?: string } };
    checkout = { ok: false, message: err.raw?.message || err.message || String(e) };
  }

  let webhookEndpoints: Array<{ url: string; status: string; livemode: boolean }> = [];
  try {
    const list = await stripe.webhookEndpoints.list({ limit: 20 });
    webhookEndpoints = list.data.map((w) => ({
      url: w.url,
      status: w.status,
      livemode: w.livemode,
    }));
  } catch {
    webhookEndpoints = [];
  }

  const prodWebhook = webhookEndpoints.find(
    (w) => w.url.includes("elixstarlive.co.uk") && w.url.includes("/api/stripe-webhook"),
  );

  console.log(
    JSON.stringify(
      {
        status: "OK",
        checkedAt: new Date().toISOString(),
        inventory,
        platform,
        expressCreate,
        checkout,
        webhookEndpoints,
        prodWebhookConfigured: !!prodWebhook,
        prodWebhook,
        verdict: {
          keysLive: inventory.STRIPE_SECRET_KEY.live === true && inventory.VITE_STRIPE_PUBLISHABLE_KEY.live === true,
          platformCharges: platform.charges_enabled === true,
          platformPayouts: platform.payouts_enabled === true,
          checkoutLive: checkout.ok,
          connectExpressLive: expressCreate.ok,
          webhookUrlPresent: !!prodWebhook && prodWebhook.status === "enabled",
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.log(JSON.stringify({ status: "ERROR", message: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
