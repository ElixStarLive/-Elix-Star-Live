/**
 * Complete one Stripe Connect TEST recipient account to payouts_enabled=true.
 * Tries Accounts v1 update (test data) then headed Playwright Account Link.
 * Never prints secrets. Writes evidence JSON only.
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import Stripe from "stripe";
import { chromium, type Page } from "playwright";
import { initPostgres, getPool } from "../lib/postgres.ts";
import { requireValue } from "./_env.ts";

process.env.ELIX_STRIPE_CONNECT_MODE = "test";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function fill(page: Page, sels: string[], val: string) {
  for (const sel of sels) {
    const loc = page.locator(sel).first();
    try {
      if ((await loc.count()) && (await loc.isVisible({ timeout: 600 }))) {
        await loc.fill(val);
        return true;
      }
    } catch {
      /* */
    }
  }
  return false;
}

async function clickText(page: Page, texts: string[]) {
  for (const t of texts) {
    try {
      const btn = page.getByRole("button", { name: new RegExp(t, "i") }).first();
      if (await btn.count()) {
        await btn.click({ timeout: 4000 });
        await page.waitForTimeout(1500);
        return true;
      }
    } catch {
      /* */
    }
  }
  return false;
}

async function main() {
  const key = (process.env.STRIPE_SECRET_KEY_TEST || "").trim();
  if (!key.startsWith("sk_test_")) {
    console.log(JSON.stringify({ ok: false, error: "STRIPE_SECRET_KEY_TEST_missing" }));
    process.exit(2);
  }
  const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion });

  await initPostgres();
  const pool = requireValue(getPool(), "postgres pool");
  const {
    createOrGetPayoutAccount,
    refreshPayoutAccountStatus,
  } = await import("../lib/monetisation/payoutProvider.ts");

  const creatorId = `express_done_${randomUUID()}`;
  await pool.query(
    `INSERT INTO elix_payout_methods (id, user_id, type, is_default, details)
     VALUES ($1,$2,'stripe_connect',TRUE,'{}'::jsonb)`,
    [`pm_${randomUUID()}`, creatorId],
  );

  let onboard = await createOrGetPayoutAccount(creatorId);
  const accountId = requireValue(onboard.accountId, "accountId");
  const steps: Array<Record<string, unknown>> = [
    { step: "created", accountId, onboardingUrl: onboard.onboardingUrl ? "yes" : "no" },
  ];

  // Attempt 1: API update with Stripe GB test identity values
  try {
    const updated = await stripe.accounts.update(accountId, {
      business_type: "individual",
      business_profile: {
        url: "https://www.elixstarlive.co.uk",
        mcc: "5815",
        product_description: "Creator live streaming rewards payouts",
      },
      individual: {
        first_name: "Jenny",
        last_name: "Rosen",
        email: `jenny+${creatorId.slice(0, 8)}@elixstarlive.co.uk`,
        phone: "+447700900000",
        dob: { day: 1, month: 1, year: 1901 },
        address: {
          line1: "address_full_match",
          city: "London",
          postal_code: "E1 6AN",
          country: "GB",
        },
      },
      external_account: {
        object: "bank_account",
        country: "GB",
        currency: "gbp",
        account_number: "00012345",
        routing_number: "108800",
        account_holder_name: "Jenny Rosen",
        account_holder_type: "individual",
      },
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: "127.0.0.1",
      },
    });
    steps.push({
      step: "api_update",
      ok: true,
      payouts_enabled: updated.payouts_enabled,
      details_submitted: updated.details_submitted,
      currently_due: updated.requirements?.currently_due?.slice(0, 15) ?? [],
    });
  } catch (e) {
    steps.push({
      step: "api_update",
      ok: false,
      error: e instanceof Error ? e.message : "api_fail",
    });
  }

  let retrieved = await stripe.accounts.retrieve(accountId);
  if (retrieved.payouts_enabled) {
    await refreshPayoutAccountStatus(creatorId);
    const out = {
      ok: true,
      method: "api",
      creatorId,
      accountId,
      payouts_enabled: true,
      steps,
    };
    const file = path.join(
      root,
      "docs/evidence",
      `express-complete-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
    process.exit(0);
  }

  // Attempt 2: headed Playwright through Account Link (user can watch / help)
  onboard = await createOrGetPayoutAccount(creatorId);
  const url = onboard.onboardingUrl;
  if (!url) {
    console.log(JSON.stringify({ ok: false, error: "no_onboarding_url", steps }));
    process.exit(3);
  }

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: ["--disable-blink-features=AutomationControlled"],
  }).catch(() =>
    chromium.launch({
      headless: false,
      args: ["--disable-blink-features=AutomationControlled"],
    }),
  );
  const context = await browser.newContext({ locale: "en-GB" });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(3000);
    steps.push({ step: "browser_open", host: new URL(page.url()).host });

    for (let i = 0; i < 50; i++) {
      if (/elixstarlive\.co\.uk/i.test(page.url())) {
        steps.push({ step: "returned_to_app", url: page.url() });
        break;
      }

      // Prefer Stripe test shortcuts when present
      await page.getByText(/use test (data|info)|fill with test|skip this form|skip for now/i).first().click({ timeout: 1200 }).catch(() => {});

      await fill(page, ['input[type="email"]', 'input[name="email"]'], `express+${creatorId.slice(0, 8)}@elixstarlive.co.uk`);
      await fill(page, ['input[type="tel"]', 'input[autocomplete="tel"]'], "07000000000");
      await fill(page, ['input[name="code"]', 'input[autocomplete="one-time-code"]'], "000000");
      await fill(page, ['input[name="first_name"]', 'input[name="individual[first_name]"]'], "Jenny");
      await fill(page, ['input[name="last_name"]', 'input[name="individual[last_name]"]'], "Rosen");
      await fill(page, ['input[name="address[line1]"]', 'input[name="line1"]', 'input[placeholder*="address" i]'], "address_full_match");
      await fill(page, ['input[name="address[city]"]', 'input[name="city"]'], "London");
      await fill(page, ['input[name="address[postal_code]"]', 'input[name="postal_code"]'], "E1 6AN");
      await fill(page, ['input[name="individual[dob][day]"]', 'input[name="dob_day"]', '#dob-day'], "01");
      await fill(page, ['input[name="individual[dob][month]"]', 'input[name="dob_month"]'], "01");
      await fill(page, ['input[name="individual[dob][year]"]', 'input[name="dob_year"]'], "1901");
      await fill(page, ['input[name*="account_number"]', 'input[autocomplete="off"][inputmode="numeric"]'], "00012345");
      await fill(page, ['input[name*="routing"]', 'input[name*="sort"]'], "108800");

      for (const cb of await page.locator('input[type="checkbox"]').all()) {
        await cb.check({ force: true }).catch(() => {});
      }

      const clicked = await clickText(page, [
        "Agree and continue",
        "Agree",
        "Continue",
        "Submit",
        "Save and continue",
        "Next",
        "Confirm",
        "Done",
        "Add bank account",
        "Verify",
      ]);
      if (!clicked) {
        await page.keyboard.press("Enter").catch(() => {});
        await page.waitForTimeout(1200);
      }

      if (i % 5 === 0) {
        retrieved = await stripe.accounts.retrieve(accountId);
        steps.push({
          step: `poll_${i}`,
          payouts_enabled: retrieved.payouts_enabled,
          details_submitted: retrieved.details_submitted,
          due: retrieved.requirements?.currently_due?.slice(0, 8) ?? [],
        });
        if (retrieved.payouts_enabled) break;
      }
    }
  } finally {
    // leave browser 20s for owner assist if stuck
    await page.waitForTimeout(20_000).catch(() => {});
    await browser.close().catch(() => {});
  }

  await refreshPayoutAccountStatus(creatorId);
  retrieved = await stripe.accounts.retrieve(accountId);
  const out = {
    ok: retrieved.payouts_enabled === true,
    method: "browser",
    creatorId,
    accountId,
    payouts_enabled: retrieved.payouts_enabled,
    details_submitted: retrieved.details_submitted,
    currently_due: retrieved.requirements?.currently_due?.slice(0, 20) ?? [],
    steps,
  };
  const file = path.join(
    root,
    "docs/evidence",
    `express-complete-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
  process.exit(out.ok ? 0 : 3);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
