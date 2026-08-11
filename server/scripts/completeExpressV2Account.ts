/**
 * Complete Accounts v2 Express recipient via API (test) then Account Link browser.
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
      if ((await loc.count()) && (await loc.isVisible({ timeout: 500 }))) {
        await loc.fill(val);
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
  const stripeV2 = new Stripe(key, { apiVersion: "2026-07-29.preview" as Stripe.LatestApiVersion });
  const stripeV1 = new Stripe(key, { apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion });

  await initPostgres();
  const pool = requireValue(getPool(), "postgres pool");
  const { createOrGetPayoutAccount, refreshPayoutAccountStatus } = await import(
    "../lib/monetisation/payoutProvider.ts"
  );

  const creatorId = `express_v2_${randomUUID()}`;
  await pool.query(
    `INSERT INTO elix_payout_methods (id, user_id, type, is_default, details)
     VALUES ($1,$2,'stripe_connect',TRUE,'{}'::jsonb)`,
    [`pm_${randomUUID()}`, creatorId],
  );
  let onboard = await createOrGetPayoutAccount(creatorId);
  const accountId = requireValue(onboard.accountId, "accountId");
  const steps: Array<Record<string, unknown>> = [{ step: "created", accountId }];

  // Try Accounts v2 update with identity + bank + TOS attestations
  try {
    const updated = await (stripeV2 as unknown as {
      v2: {
        core: {
          accounts: {
            update: (id: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
          };
        };
      };
    }).v2.core.accounts.update(accountId, {
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
              date: new Date().toISOString(),
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
    steps.push({
      step: "v2_update",
      ok: true,
      keys: Object.keys(updated || {}),
    });
  } catch (e) {
    steps.push({
      step: "v2_update",
      ok: false,
      error: e instanceof Error ? e.message : "fail",
    });
  }

  // External bank via v1 if allowed
  try {
    await stripeV1.accounts.createExternalAccount(accountId, {
      external_account: {
        object: "bank_account",
        country: "GB",
        currency: "gbp",
        account_number: "00012345",
        routing_number: "108800",
        account_holder_name: "Jenny Rosen",
        account_holder_type: "individual",
      },
    });
    steps.push({ step: "external_account", ok: true });
  } catch (e) {
    steps.push({
      step: "external_account",
      ok: false,
      error: e instanceof Error ? e.message : "fail",
    });
  }

  let v1 = await stripeV1.accounts.retrieve(accountId);
  steps.push({
    step: "after_api",
    payouts_enabled: v1.payouts_enabled,
    details_submitted: v1.details_submitted,
    due: v1.requirements?.currently_due?.slice(0, 15) ?? [],
  });

  if (!v1.payouts_enabled) {
    onboard = await createOrGetPayoutAccount(creatorId);
    const url = requireValue(onboard.onboardingUrl, "onboardingUrl");
    steps.push({ step: "account_link", urlHost: "connect.stripe.com" });

    const browser = await chromium
      .launch({
        headless: false,
        channel: "chrome",
        slowMo: 80,
        args: ["--disable-blink-features=AutomationControlled"],
      })
      .catch(() =>
        chromium.launch({ headless: false, slowMo: 80 }),
      );

    const page = await browser.newPage({ locale: "en-GB" });
    page.setDefaultTimeout(45_000);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(4000);

    // Keep driving until payouts enabled or 4 minutes
    const deadline = Date.now() + 240_000;
    let i = 0;
    while (Date.now() < deadline) {
      i += 1;
      const cur = page.url();
      // Ignore early bounce to login — reopen Account Link
      if (/elixstarlive\.co\.uk\/login/i.test(cur)) {
        onboard = await createOrGetPayoutAccount(creatorId);
        if (onboard.onboardingUrl) {
          await page.goto(onboard.onboardingUrl, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(3000);
          steps.push({ step: "reopened_after_login_bounce", i });
        }
      }

      await page
        .getByText(/use test (data|info)|fill with test|skip this form|skip for now|auto-fill/i)
        .first()
        .click({ timeout: 800 })
        .catch(() => {});

      // Radio / choice: Individual
      await page.getByText(/^Individual$/i).first().click({ timeout: 800 }).catch(() => {});
      await page.getByRole("radio", { name: /individual/i }).first().click({ timeout: 800 }).catch(() => {});

      await fill(page, ['input[type="email"]', 'input[name="email"]'], `express+${creatorId.slice(0, 8)}@elixstarlive.co.uk`);
      await fill(page, ['input[type="tel"]'], "07000000000");
      await fill(page, ['input[name="code"]', 'input[autocomplete="one-time-code"]'], "000000");
      await fill(page, ['input[name="first_name"]', 'input[name="individual[first_name]"]', 'input[name*="given"]'], "Jenny");
      await fill(page, ['input[name="last_name"]', 'input[name="individual[last_name]"]', 'input[name*="surname"]'], "Rosen");
      await fill(page, ['input[name="address[line1]"]', 'input[name="line1"]', 'input[placeholder*="Address" i]'], "address_full_match");
      await fill(page, ['input[name="address[city]"]', 'input[name="city"]', 'input[placeholder*="City" i]'], "London");
      await fill(page, ['input[name="address[postal_code]"]', 'input[name="postal_code"]', 'input[placeholder*="Post" i]'], "E1 6AN");
      await fill(page, ['input[name*="dob"][name*="day"]', 'input[placeholder*="DD" i]', '#dob-day'], "01");
      await fill(page, ['input[name*="dob"][name*="month"]', 'input[placeholder*="MM" i]'], "01");
      await fill(page, ['input[name*="dob"][name*="year"]', 'input[placeholder*="YYYY" i]'], "1901");
      await fill(page, ['input[name*="account_number"]', 'input[placeholder*="Account" i]'], "00012345");
      await fill(page, ['input[name*="routing"]', 'input[name*="sort"]', 'input[placeholder*="Sort" i]'], "108800");
      await fill(page, ['input[name*="url"]', 'input[placeholder*="website" i]', 'input[type="url"]'], "https://www.elixstarlive.co.uk");

      for (const cb of await page.locator('input[type="checkbox"]').all()) {
        await cb.check({ force: true }).catch(() => {});
      }

      for (const label of [
        "Agree and continue",
        "Agree",
        "Continue",
        "Submit",
        "Next",
        "Confirm",
        "Done",
        "Save",
        "Add bank account",
      ]) {
        const btn = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first();
        if (await btn.count()) {
          await btn.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(1200);
          break;
        }
      }

      if (i % 4 === 0) {
        v1 = await stripeV1.accounts.retrieve(accountId);
        steps.push({
          step: `poll_${i}`,
          urlHost: (() => {
            try {
              return new URL(page.url()).host;
            } catch {
              return page.url();
            }
          })(),
          payouts_enabled: v1.payouts_enabled,
          details_submitted: v1.details_submitted,
          dueCount: v1.requirements?.currently_due?.length ?? null,
        });
        if (v1.payouts_enabled) break;
        // success return (not login)
        if (/elixstarlive\.co\.uk\/creator-payout/i.test(page.url()) && /payout_return=1/.test(page.url())) {
          break;
        }
      }
      await page.waitForTimeout(800);
    }

    // Keep open briefly for owner if still incomplete
    if (!v1.payouts_enabled) {
      steps.push({ step: "owner_assist_window", seconds: 60, message: "Finish form in open Chrome if needed" });
      await page.waitForTimeout(60_000);
      v1 = await stripeV1.accounts.retrieve(accountId);
    }
    await browser.close().catch(() => {});
  }

  await refreshPayoutAccountStatus(creatorId);
  v1 = await stripeV1.accounts.retrieve(accountId);
  const out = {
    ok: v1.payouts_enabled === true,
    creatorId,
    accountId,
    payouts_enabled: v1.payouts_enabled,
    details_submitted: v1.details_submitted,
    currently_due: v1.requirements?.currently_due?.slice(0, 20) ?? [],
    steps,
  };
  const file = path.join(
    root,
    "docs/evidence",
    `express-v2-complete-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
  process.exit(out.ok ? 0 : 3);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
