/**
 * Send signed Stripe TEST events to production webhook; record safe event IDs.
 * Uses STRIPE_WEBHOOK_SECRET_TEST + STRIPE_SECRET_KEY_TEST only.
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import Stripe from "stripe";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const TARGET = "https://www.elixstarlive.co.uk/api/stripe-webhook";

async function main() {
  const key = (process.env.STRIPE_SECRET_KEY_TEST || "").trim();
  const whsec = (process.env.STRIPE_WEBHOOK_SECRET_TEST || "").trim();
  if (!key.startsWith("sk_test_") || !whsec.startsWith("whsec_")) {
    console.log(JSON.stringify({ ok: false, error: "test_key_or_whsec_missing" }));
    process.exit(2);
  }
  const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as never });

  const delivery: Array<Record<string, unknown>> = [];
  const types = [
    "account.updated",
    "transfer.created",
    "transfer.updated",
    "transfer.reversed",
  ] as const;

  for (const type of types) {
    const eventId = `evt_deploy_probe_${randomUUID()}`;
    const object =
      type === "account.updated"
        ? {
            id: `acct_probe_${randomUUID().slice(0, 8)}`,
            object: "account",
            metadata: { elix_creator_user_id: `probe_${randomUUID()}` },
            charges_enabled: false,
            payouts_enabled: false,
            details_submitted: false,
          }
        : {
            id: `tr_probe_${randomUUID().slice(0, 8)}`,
            object: "transfer",
            amount: 100,
            currency: "gbp",
            reversed: type === "transfer.reversed",
            metadata: {},
          };
    const payload = JSON.stringify({
      id: eventId,
      object: "event",
      type,
      data: { object },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: whsec });
    const res = await fetch(TARGET, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": header,
      },
      body: payload,
    });
    const bodyText = await res.text().catch(() => "");
    delivery.push({
      type,
      eventId,
      httpStatus: res.status,
      bodySnippet: bodyText.slice(0, 200),
      accepted: res.status >= 200 && res.status < 300,
    });
  }

  // Also prove unsigned rejection
  const unsigned = await fetch(TARGET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = {
    finishedAt: new Date().toISOString(),
    target: TARGET,
    unsignedStatus: unsigned.status,
    delivery,
    allAccepted: delivery.every((d) => d.accepted === true),
    note: "accepted=true requires Coolify STRIPE_WEBHOOK_SECRET_TEST match; 400 = signature rejected",
  };
  const file = path.join(root, "docs/evidence", `stripe-webhook-delivery-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
  process.exit(out.allAccepted ? 0 : 3);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
