/**
 * LIVE-mode Stripe Connect only (production). No test keys. No fake success.
 * Creates/refreshes one Express Account Link using sk_live.
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import Stripe from "stripe";
import { initPostgres, getPool } from "../lib/postgres.ts";
import { requireValue } from "./_env.ts";

// Force LIVE path — never test
delete process.env.ELIX_STRIPE_CONNECT_MODE;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function main() {
  const live =
    (process.env.STRIPE_SECRET_KEY_LIVE || "").trim() ||
    (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!live.startsWith("sk_live_")) {
    console.log(JSON.stringify({ ok: false, error: "sk_live_required" }));
    process.exit(2);
  }

  const stripe = new Stripe(live, { apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion });

  const listed = await stripe.accounts.list({ limit: 15 });
  const recent = listed.data.map((a) => ({
    id: a.id,
    type: a.type,
    payouts_enabled: a.payouts_enabled,
    details_submitted: a.details_submitted,
    charges_enabled: a.charges_enabled,
  }));
  const anyLivePayouts = recent.some((a) => a.payouts_enabled);

  await initPostgres();
  const pool = requireValue(getPool(), "postgres pool");
  // Ensure payout provider uses live (mode not forced to test)
  const { createOrGetPayoutAccount, getStripeModeSafe } = await import(
    "../lib/monetisation/payoutProvider.ts"
  );
  const mode = getStripeModeSafe();
  if (mode.mode !== "live") {
    console.log(JSON.stringify({ ok: false, error: "provider_not_live", mode }));
    process.exit(2);
  }

  const creatorId = `live_creator_${randomUUID()}`;
  await pool.query(
    `INSERT INTO elix_payout_methods (id, user_id, type, is_default, details)
     VALUES ($1,$2,'stripe_connect',TRUE,'{}'::jsonb)`,
    [`pm_${randomUUID()}`, creatorId],
  );

  const onboard = await createOrGetPayoutAccount(creatorId);
  if (!onboard.ok || !onboard.onboardingUrl) {
    console.log(JSON.stringify({ ok: false, error: onboard.error || "no_url", mode }));
    process.exit(3);
  }

  try {
    spawn("cmd", ["/c", "start", "", onboard.onboardingUrl], {
      detached: true,
      stdio: "ignore",
    }).unref();
  } catch {
    /* */
  }

  const out = {
    ok: true,
    mode: "live",
    productionReadyExpress: anyLivePayouts,
    anyLiveConnectedPayoutsEnabled: anyLivePayouts,
    creatorId,
    accountId: onboard.accountId,
    onboardingUrl: onboard.onboardingUrl,
    recentLiveAccounts: recent,
    note: "Complete this LIVE Account Link with real business/identity/bank details. Test Jenny Rosen data will NOT work for production.",
  };
  const file = path.join(
    root,
    "docs/evidence",
    `express-live-link-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
