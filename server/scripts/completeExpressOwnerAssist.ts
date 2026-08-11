/**
 * Fast path: create recipient + try v2 identity update + print Account Link.
 * Polls payouts_enabled while owner finishes hosted form in browser.
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

process.env.ELIX_STRIPE_CONNECT_MODE = "test";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function main() {
  const key = (process.env.STRIPE_SECRET_KEY_TEST || "").trim();
  const stripeV2 = new Stripe(key, { apiVersion: "2026-07-29.preview" as Stripe.LatestApiVersion });
  const stripeV1 = new Stripe(key, { apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion });

  await initPostgres();
  const pool = requireValue(getPool(), "postgres pool");
  const { createOrGetPayoutAccount, refreshPayoutAccountStatus } = await import(
    "../lib/monetisation/payoutProvider.ts"
  );

  const creatorId = `express_owner_${randomUUID()}`;
  await pool.query(
    `INSERT INTO elix_payout_methods (id, user_id, type, is_default, details)
     VALUES ($1,$2,'stripe_connect',TRUE,'{}'::jsonb)`,
    [`pm_${randomUUID()}`, creatorId],
  );

  console.log("[1] creating account…");
  const onboard = await createOrGetPayoutAccount(creatorId);
  const accountId = requireValue(onboard.accountId, "accountId");
  const url = requireValue(onboard.onboardingUrl, "onboardingUrl");
  console.log(JSON.stringify({ step: "created", accountId, url }, null, 2));

  console.log("[2] attempting v2 identity update…");
  try {
    await (
      stripeV2 as unknown as {
        v2: {
          core: {
            accounts: {
              update: (id: string, body: Record<string, unknown>) => Promise<unknown>;
            };
          };
        };
      }
    ).v2.core.accounts.update(accountId, {
      include: ["configuration.recipient", "identity", "requirements"],
      identity: {
        entity_type: "individual",
        country: "gb",
        individual: {
          given_name: "Jenny",
          surname: "Rosen",
          email: `jenny+${creatorId.slice(0, 8)}@elixstarlive.co.uk`,
          phone: "+447700900000",
          date_of_birth: { day: 1, month: 1, year: 1901 },
          address: {
            line1: "address_full_match",
            city: "London",
            postal_code: "E1 6AN",
            country: "GB",
          },
        },
        attestations: {
          terms_of_service: {
            account: {
              date: Math.floor(Date.now() / 1000),
              ip: "127.0.0.1",
              user_agent: "elix-express-complete/1.0",
            },
          },
        },
      },
      defaults: {
        profile: {
          business_url: "https://www.elixstarlive.co.uk",
        },
      },
    });
    console.log(JSON.stringify({ step: "v2_update", ok: true }));
  } catch (e) {
    console.log(
      JSON.stringify({
        step: "v2_update",
        ok: false,
        error: e instanceof Error ? e.message : "fail",
      }),
    );
  }

  // Open browser for owner (Windows)
  try {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    console.log("[3] opened Account Link in default browser");
  } catch {
    console.log("[3] could not auto-open; use url above");
  }

  console.log("[4] polling Stripe for payouts_enabled (up to 8 min) — finish the form now…");
  let enabled = false;
  let lastDue: string[] = [];
  for (let i = 0; i < 96; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const a = await stripeV1.accounts.retrieve(accountId);
    lastDue = a.requirements?.currently_due?.slice(0, 12) ?? [];
    if (i % 6 === 0) {
      console.log(
        JSON.stringify({
          poll: i,
          payouts_enabled: a.payouts_enabled,
          details_submitted: a.details_submitted,
          due: lastDue,
        }),
      );
    }
    if (a.payouts_enabled) {
      enabled = true;
      break;
    }
  }

  if (enabled) await refreshPayoutAccountStatus(creatorId);

  const out = {
    ok: enabled,
    creatorId,
    accountId,
    onboardingUrl: url,
    payouts_enabled: enabled,
    currently_due: lastDue,
    radar: "VERIFIED_owner_dashboard",
  };
  const file = path.join(
    root,
    "docs/evidence",
    `express-owner-poll-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
  process.exit(enabled ? 0 : 3);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
