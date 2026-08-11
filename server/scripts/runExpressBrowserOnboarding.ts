/**
 * Browser Express Account Link — Stripe test KYC values.
 * Marks VERIFIED only when payouts_enabled becomes true after refresh.
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { chromium, type Page } from "playwright";
import { initPostgres, getPool } from "../lib/postgres.ts";
import { requireValue } from "./_env.ts";

process.env.ELIX_STRIPE_CONNECT_MODE = "test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

async function fillFirst(page: Page, selectors: string[], value: string) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
      await loc.fill(value).catch(() => {});
      return true;
    }
  }
  return false;
}

async function clickLabel(page: Page, labels: string[]) {
  for (const label of labels) {
    const btn = page.getByRole("button", { name: new RegExp(label, "i") }).first();
    if ((await btn.count()) > 0) {
      await btn.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      return true;
    }
  }
  const link = page.getByRole("link", { name: /agree|continue|next|submit/i }).first();
  if ((await link.count()) > 0) {
    await link.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1200);
    return true;
  }
  return false;
}

async function main() {
  await initPostgres();
  const { createOrGetPayoutAccount, refreshPayoutAccountStatus } = await import(
    "../lib/monetisation/payoutProvider.ts"
  );
  const creatorId = `express_tos_${randomUUID()}`;
  const pool = requireValue(getPool(), "postgres pool");
  await pool.query(
    `INSERT INTO elix_payout_methods (id, user_id, type, is_default, details)
     VALUES ($1,$2,'stripe_connect',TRUE,'{}'::jsonb)`,
    [`pm_${randomUUID()}`, creatorId],
  );

  const onboard = await createOrGetPayoutAccount(creatorId);
  if (!onboard.ok || !onboard.onboardingUrl) {
    console.log(JSON.stringify({ ok: false, error: onboard.error || "no_url", accountId: onboard.accountId }));
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(20_000);
  const trail: string[] = [];
  try {
    await page.goto(onboard.onboardingUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    trail.push(page.url());

    // Iterate common Stripe Connect test steps (best-effort; may still leave restricted)
    for (let i = 0; i < 25; i++) {
      trail.push(page.url());
      await fillFirst(page, ['input[type="email"]', 'input[name="email"]'], `express+${creatorId.slice(0, 10)}@elixstarlive.co.uk`);
      await fillFirst(page, ['input[type="tel"]', 'input[name="phone"]', 'input[name="phone_number"]'], "0000000000");
      await fillFirst(page, ['input[name="code"]', 'input[autocomplete="one-time-code"]', 'input[name="sms"]'], "000000");
      await fillFirst(page, ['input[name="first_name"]', 'input[name="individual[first_name]"]'], "Jenny");
      await fillFirst(page, ['input[name="last_name"]', 'input[name="individual[last_name]"]'], "Rosen");
      await fillFirst(page, ['input[name="address"]', 'input[name="address[line1]"]', '#address'], "address_full_match");
      await fillFirst(page, ['input[name="city"]', 'input[name="address[city]"]'], "London");
      await fillFirst(page, ['input[name="postal_code"]', 'input[name="address[postal_code]"]'], "E16AN");
      await fillFirst(page, ['input[name="ssn_last_4"]', 'input[name="id_number"]'], "0000");
      await fillFirst(page, ['input[name="dob"]', 'input[name="individual[dob][day]"]'], "01");
      const tos = page.locator('input[type="checkbox"]').first();
      if ((await tos.count()) > 0) await tos.check({ force: true }).catch(() => {});
      const clicked = await clickLabel(page, [
        "Agree and continue",
        "Continue",
        "Submit",
        "Save and continue",
        "Next",
        "Confirm",
        "Done",
      ]);
      if (!clicked) break;
      await page.waitForTimeout(1500);
      if (/elixstarlive\.co\.uk/i.test(page.url())) break;
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const refreshed = await refreshPayoutAccountStatus(creatorId);
  const row = await pool.query(
    `SELECT provider_account_id, verification_status, payouts_enabled, details_submitted
       FROM elix_creator_payout_accounts WHERE creator_user_id=$1`,
    [creatorId],
  );
  const out = {
    finishedAt: new Date().toISOString(),
    creatorId,
    accountId: onboard.accountId,
    trailHosts: trail.map((u) => {
      try {
        return new URL(u).host;
      } catch {
        return u;
      }
    }),
    refresh: {
      ok: refreshed.ok,
      payoutsEnabled: refreshed.payoutsEnabled ?? null,
      verificationStatus: refreshed.verificationStatus || null,
    },
    db: row.rows[0] || null,
    expressVerified: refreshed.payoutsEnabled === true,
  };
  const file = path.join(
    root,
    "docs/evidence",
    `express-browser-tos-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
  process.exit(out.expressVerified ? 0 : 3);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
