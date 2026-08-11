/**
 * Complete Express hosted onboarding in Stripe TEST using Playwright.
 * Uses official Stripe test identity values. Exits 0 only when payouts_enabled=true.
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
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function fill(page: Page, sels: string[], val: string) {
  for (const sel of sels) {
    const loc = page.locator(sel).first();
    try {
      if ((await loc.count()) && (await loc.isVisible({ timeout: 800 }))) {
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
        await btn.click({ timeout: 5000 });
        await page.waitForTimeout(2000);
        return true;
      }
    } catch {
      /* */
    }
    try {
      const link = page.getByText(new RegExp(`^${t}$`, "i")).first();
      if (await link.count()) {
        await link.click({ timeout: 5000 });
        await page.waitForTimeout(2000);
        return true;
      }
    } catch {
      /* */
    }
  }
  return false;
}

async function main() {
  await initPostgres();
  const pool = requireValue(getPool(), "postgres pool");
  const {
    createOrGetPayoutAccount,
    refreshPayoutAccountStatus,
  } = await import("../lib/monetisation/payoutProvider.ts");

  const creatorId = `express_full_${randomUUID()}`;
  await pool.query(
    `INSERT INTO elix_payout_methods (id, user_id, type, is_default, details)
     VALUES ($1,$2,'stripe_connect',TRUE,'{}'::jsonb)`,
    [`pm_${randomUUID()}`, creatorId],
  );

  let onboard = await createOrGetPayoutAccount(creatorId);
  const onboardingUrl = onboard.onboardingUrl;
  if (!onboardingUrl) {
    console.log(JSON.stringify({ ok: false, error: onboard.error || "no_url" }));
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    locale: "en-GB",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);
  const trail: string[] = [];

  try {
    await page.goto(onboardingUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForTimeout(4000);
    trail.push(page.url());

    for (let step = 0; step < 40; step++) {
      trail.push(page.url());
      if (/elixstarlive\.co\.uk/i.test(page.url()) && /payout_return|creator-payout/i.test(page.url())) {
        break;
      }

      await fill(page, ['input[type="email"]', 'input[name="email"]', '#email'], `express+${creatorId.slice(0, 10)}@elixstarlive.co.uk`);
      await fill(page, ['input[type="tel"]', 'input[name="phone"]', 'input[autocomplete="tel"]'], "0000000000");
      await fill(page, ['input[name="code"]', 'input[autocomplete="one-time-code"]', 'input[inputmode="numeric"]'], "000000");
      await fill(page, ['input[name="first_name"]', 'input[name="individual[first_name]"]', '#first_name'], "Jenny");
      await fill(page, ['input[name="last_name"]', 'input[name="individual[last_name]"]', '#last_name'], "Rosen");
      await fill(page, ['input[name="address[line1]"]', 'input[name="line1"]', '#addressLine1', 'input[placeholder*="address" i]'], "address_full_match");
      await fill(page, ['input[name="address[city]"]', 'input[name="city"]', '#locality'], "London");
      await fill(page, ['input[name="address[postal_code]"]', 'input[name="postal_code"]', '#postalCode'], "E1 6AN");
      await fill(page, ['input[name="ssn_last_4"]', 'input[name="id_number"]', 'input[name="individual[id_number]"]'], "000000000");
      await fill(page, ['input[name="individual[dob][day]"]', 'input[name="dob_day"]', '#dob-day'], "01");
      await fill(page, ['input[name="individual[dob][month]"]', 'input[name="dob_month"]'], "01");
      await fill(page, ['input[name="individual[dob][year]"]', 'input[name="dob_year"]'], "1901");

      // select UK / individual if present
      const country = page.locator('select[name*="country"], select#country').first();
      if (await country.count()) await country.selectOption({ label: /United Kingdom|GB/i }).catch(() => {});

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
        "Skip this form",
        "Use test data",
        "Fill with test data",
      ]);

      // Stripe sometimes uses Test mode "Skip" link
      await page.locator('text=/skip/i').first().click({ timeout: 1500 }).catch(() => {});

      if (!clicked) {
        await page.keyboard.press("Enter").catch(() => {});
        await page.waitForTimeout(1500);
      }

      // refresh link if session expired
      if (/expired|invalid/i.test(await page.content().catch(() => ""))) {
        onboard = await createOrGetPayoutAccount(creatorId);
        if (onboard.onboardingUrl) {
          await page.goto(onboard.onboardingUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  // Poll refresh until transfers active or timeout
  let refreshed = await refreshPayoutAccountStatus(creatorId);
  for (let i = 0; i < 10 && !refreshed.payoutsEnabled; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    refreshed = await refreshPayoutAccountStatus(creatorId);
  }

  const row = await pool.query(
    `SELECT provider_account_id, verification_status, payouts_enabled, details_submitted
       FROM elix_creator_payout_accounts WHERE creator_user_id=$1`,
    [creatorId],
  );

  const out = {
    finishedAt: new Date().toISOString(),
    creatorId,
    accountId: onboard.accountId || row.rows[0]?.provider_account_id || null,
    trailHosts: [...new Set(trail.map((u) => { try { return new URL(u).host; } catch { return u; } }))],
    payoutsEnabled: refreshed.payoutsEnabled === true,
    verificationStatus: refreshed.verificationStatus || null,
    db: row.rows[0] || null,
    expressVerified: refreshed.payoutsEnabled === true,
  };
  const file = path.join(root, "docs/evidence", `express-full-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
  process.exit(out.expressVerified ? 0 : 3);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
