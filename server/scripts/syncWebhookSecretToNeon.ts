/**
 * Sync local STRIPE_WEBHOOK_SECRET_TEST into Neon runtime config (never prints secret).
 * Then recreate Stripe test endpoint if needed and probe production after deploy.
 */
import "../config.ts";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";
import { initPostgres } from "../lib/postgres.ts";
import { setRuntimeConfigValue } from "../lib/runtimeConfig.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET = "https://www.elixstarlive.co.uk/api/stripe-webhook";

async function main() {
  const key = (process.env.STRIPE_SECRET_KEY_TEST || "").trim();
  let whsec = (process.env.STRIPE_WEBHOOK_SECRET_TEST || "").trim();
  if (!key.startsWith("sk_test_")) {
    console.log(JSON.stringify({ ok: false, error: "no_test_key" }));
    process.exit(2);
  }

  await initPostgres();
  // Ensure migration applied
  const { spawnSync } = await import("child_process");
  spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", "server/migrate.ts"],
    { cwd: root, env: process.env, stdio: "inherit", shell: false },
  );

  const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as never });
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  let endpoint = list.data.find((e) => e.url === TARGET && e.status === "enabled" && !e.livemode);

  if (!whsec.startsWith("whsec_") || !endpoint) {
    for (const ep of list.data.filter((e) => e.url === TARGET && !e.livemode)) {
      await stripe.webhookEndpoints.update(ep.id, { disabled: true });
    }
    const created = await stripe.webhookEndpoints.create({
      url: TARGET,
      enabled_events: [
        "account.updated",
        "transfer.created",
        "transfer.updated",
        "transfer.reversed",
        "capability.updated",
      ] as never,
      description: "Elix Connect payouts test",
    });
    endpoint = created;
    whsec = (created as { secret?: string }).secret || "";
    if (!whsec.startsWith("whsec_")) {
      console.log(JSON.stringify({ ok: false, error: "create_missing_secret" }));
      process.exit(1);
    }
    // persist to .env
    const envPath = path.join(root, ".env");
    let text = fs.readFileSync(envPath, "utf8");
    if (/^STRIPE_WEBHOOK_SECRET_TEST=/m.test(text)) {
      text = text.replace(/^STRIPE_WEBHOOK_SECRET_TEST=.*$/m, `STRIPE_WEBHOOK_SECRET_TEST=${whsec}`);
    } else {
      text += `\nSTRIPE_WEBHOOK_SECRET_TEST=${whsec}\n`;
    }
    fs.writeFileSync(envPath, text);
    process.env.STRIPE_WEBHOOK_SECRET_TEST = whsec;
  }

  const saved = await setRuntimeConfigValue(
    "STRIPE_WEBHOOK_SECRET_TEST",
    whsec,
    "system:sync_webhook_secret",
  );

  const delivery: Array<Record<string, unknown>> = [];
  for (const type of [
    "account.updated",
    "transfer.created",
    "transfer.updated",
    "transfer.reversed",
  ] as const) {
    const eventId = `evt_sync_${randomUUID()}`;
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
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: whsec });
    const res = await fetch(TARGET, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header },
      body: payload,
    });
    delivery.push({
      type,
      eventId,
      httpStatus: res.status,
      accepted: res.status >= 200 && res.status < 300,
    });
  }

  // duplicate
  const dup = delivery[1];
  if (dup) {
    const type = "transfer.created";
    const eventId = String(dup.eventId);
    const payload = JSON.stringify({
      id: eventId,
      object: "event",
      type,
      data: {
        object: {
          id: `tr_probe_dup`,
          object: "transfer",
          amount: 100,
          currency: "gbp",
          reversed: false,
          metadata: {},
        },
      },
    });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: whsec });
    const res = await fetch(TARGET, {
      method: "POST",
      headers: { "content-type": "application/json", "stripe-signature": header },
      body: payload,
    });
    delivery.push({
      type: "transfer.created_duplicate",
      eventId,
      httpStatus: res.status,
      accepted: res.status >= 200 && res.status < 300,
    });
  }

  const out = {
    finishedAt: new Date().toISOString(),
    endpointId: endpoint?.id || null,
    neonSecretSaved: saved,
    delivery,
    allAccepted: delivery.every((d) => d.accepted === true),
    note: "Requires deployed tip with runtimeConfig webhook fallback + migrate",
  };
  const file = path.join(
    root,
    "docs/evidence",
    `webhook-neon-sync-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
  process.exit(out.allAccepted ? 0 : 3);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
