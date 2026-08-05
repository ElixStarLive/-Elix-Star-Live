/**
 * Recreate Stripe TEST webhook endpoint; write secret to .env only (never stdout).
 * Then probe production /api/stripe-webhook with signed events.
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
const EVENTS = [
  "account.updated",
  "transfer.created",
  "transfer.updated",
  "transfer.reversed",
  "capability.updated",
] as const;

function upsertEnvKey(filePath: string, key: string, value: string) {
  let text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) text = text.replace(re, `${key}=${value}`);
  else text = `${text.trimEnd()}\n${key}=${value}\n`;
  fs.writeFileSync(filePath, text, "utf8");
}

async function main() {
  const key = (process.env.STRIPE_SECRET_KEY_TEST || "").trim();
  if (!key.startsWith("sk_test_")) {
    console.log(JSON.stringify({ ok: false, error: "no_test_key" }));
    process.exit(2);
  }
  const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as never });

  // Disable old endpoints pointing at TARGET (keep history; create fresh secret)
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  for (const ep of list.data) {
    if (ep.url === TARGET && !ep.livemode) {
      await stripe.webhookEndpoints.update(ep.id, { disabled: true });
    }
  }

  const created = await stripe.webhookEndpoints.create({
    url: TARGET,
    enabled_events: [...EVENTS] as unknown as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
    description: "Elix Star Live Connect payouts (test) — rotated",
  });
  const secret = (created as { secret?: string }).secret;
  if (!secret?.startsWith("whsec_")) {
    console.log(JSON.stringify({ ok: false, error: "no_secret_on_create" }));
    process.exit(1);
  }

  const envPath = path.join(root, ".env");
  upsertEnvKey(envPath, "STRIPE_WEBHOOK_SECRET_TEST", secret);
  process.env.STRIPE_WEBHOOK_SECRET_TEST = secret;

  const delivery: Array<Record<string, unknown>> = [];
  for (const type of ["account.updated", "transfer.created", "transfer.updated", "transfer.reversed"] as const) {
    const eventId = `evt_whrot_${randomUUID()}`;
    const object =
      type === "account.updated"
        ? {
            id: `acct_probe_${randomUUID().slice(0, 8)}`,
            object: "account",
            metadata: {},
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
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const res = await fetch(TARGET, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header },
      body: payload,
    });
    const bodyText = await res.text().catch(() => "");
    delivery.push({
      type,
      eventId,
      httpStatus: res.status,
      accepted: res.status >= 200 && res.status < 300,
      bodySnippet: bodyText.slice(0, 120),
    });
  }

  const out = {
    finishedAt: new Date().toISOString(),
    endpointId: created.id,
    url: created.url,
    secretWrittenToEnv: true,
    secretLogged: false,
    delivery,
    allAccepted: delivery.every((d) => d.accepted === true),
    note: "If allAccepted=false, Coolify lacks matching STRIPE_WEBHOOK_SECRET_TEST (set from local .env — never paste in chat).",
  };
  const file = path.join(
    root,
    "docs/evidence",
    `stripe-webhook-rotate-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
  process.exit(out.allAccepted ? 0 : 3);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
