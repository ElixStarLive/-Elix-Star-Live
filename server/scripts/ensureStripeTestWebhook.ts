/**
 * Ensure Stripe TEST webhook endpoint for production URL.
 * Never prints secrets. Writes safe IDs only to docs/evidence.
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const TARGET_URL = "https://www.elixstarlive.co.uk/api/stripe-webhook";
const EVENTS = [
  "account.updated",
  "transfer.created",
  "transfer.updated",
  "transfer.reversed",
  "capability.updated",
] as const;

async function main() {
  const key = (process.env.STRIPE_SECRET_KEY_TEST || "").trim();
  if (!key.startsWith("sk_test_")) {
    console.log(JSON.stringify({ ok: false, error: "STRIPE_SECRET_KEY_TEST_missing" }));
    process.exit(2);
  }
  const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as never });
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  let endpoint = list.data.find((w) => w.url === TARGET_URL && !w.livemode) || null;
  let created = false;
  if (!endpoint) {
    endpoint = await stripe.webhookEndpoints.create({
      url: TARGET_URL,
      enabled_events: [...EVENTS] as unknown as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
      description: "Elix Star Live Connect payouts (test)",
      connect: false,
    });
    created = true;
  } else {
    const missing = EVENTS.filter((e) => !endpoint!.enabled_events.includes(e));
    if (missing.length || endpoint.status !== "enabled") {
      endpoint = await stripe.webhookEndpoints.update(endpoint.id, {
        enabled_events: [...EVENTS] as unknown as Stripe.WebhookEndpointUpdateParams.EnabledEvent[],
        disabled: false,
      });
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = {
    ok: true,
    created,
    endpointId: endpoint.id,
    url: endpoint.url,
    status: endpoint.status,
    livemode: endpoint.livemode,
    enabled_events: endpoint.enabled_events,
    secretPresentInResponse: typeof (endpoint as { secret?: string }).secret === "string",
    note:
      "If created, copy whsec from Stripe Dashboard into Coolify STRIPE_WEBHOOK_SECRET_TEST only — not logged here.",
    finishedAt: new Date().toISOString(),
  };
  const file = path.join(root, "docs/evidence", `stripe-test-webhook-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
