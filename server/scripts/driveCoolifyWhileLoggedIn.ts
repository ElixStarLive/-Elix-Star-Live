/**
 * Drive Coolify UI while user is logged in (Chrome persistent profile).
 * Sets STRIPE_WEBHOOK_SECRET_TEST from local .env (never prints value) and triggers Redeploy.
 */
import "../config.ts";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const chromeUser = path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data");
const tmpProfile = path.join(os.tmpdir(), `elix-coolify-${Date.now()}`);

function copyProfile() {
  fs.mkdirSync(path.join(tmpProfile, "Default", "Network"), { recursive: true });
  const pairs: Array<[string, string]> = [
    [path.join(chromeUser, "Local State"), path.join(tmpProfile, "Local State")],
    [path.join(chromeUser, "Default", "Network", "Cookies"), path.join(tmpProfile, "Default", "Network", "Cookies")],
    [path.join(chromeUser, "Default", "Preferences"), path.join(tmpProfile, "Default", "Preferences")],
  ];
  for (const [from, to] of pairs) {
    if (fs.existsSync(from)) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      try {
        fs.copyFileSync(from, to);
      } catch {
        /* locked */
      }
    }
  }
}

async function main() {
  const whsec = (process.env.STRIPE_WEBHOOK_SECRET_TEST || "").trim();
  if (!whsec.startsWith("whsec_")) {
    console.log(JSON.stringify({ ok: false, error: "STRIPE_WEBHOOK_SECRET_TEST_missing_in_env" }));
    process.exit(2);
  }

  copyProfile();
  const context = await chromium.launchPersistentContext(tmpProfile, {
    headless: false,
    channel: "chrome",
    viewport: { width: 1400, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  }).catch(() =>
    chromium.launchPersistentContext(tmpProfile, {
      headless: false,
      viewport: { width: 1400, height: 900 },
    }),
  );

  const steps: Array<Record<string, unknown>> = [];
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(30_000);

  try {
    await page.goto("https://app.coolify.io", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3000);
    steps.push({ step: "coolify_home", url: page.url(), title: await page.title() });

    // Navigate projects / search Elix
    const search = page.getByPlaceholder(/search/i).first();
    if (await search.count()) {
      await search.fill("elix");
      await page.waitForTimeout(1500);
    }

    // Click anything matching Elix / Star / Live
    const appLink = page.getByRole("link", { name: /elix|star.?live/i }).first();
    if (await appLink.count()) {
      await appLink.click();
      await page.waitForTimeout(2500);
      steps.push({ step: "opened_app", url: page.url() });
    } else {
      // try text click
      await page.locator("text=/Elix/i").first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
      steps.push({ step: "opened_app_fallback", url: page.url() });
    }

    // Environment / Configuration
    for (const label of ["Environment", "Environment Variables", "Configuration", "Settings"]) {
      const tab = page.getByRole("link", { name: new RegExp(label, "i") }).first();
      if (await tab.count()) {
        await tab.click().catch(() => {});
        await page.waitForTimeout(1500);
        steps.push({ step: "nav", label, url: page.url() });
        break;
      }
      const btn = page.getByRole("button", { name: new RegExp(label, "i") }).first();
      if (await btn.count()) {
        await btn.click().catch(() => {});
        await page.waitForTimeout(1500);
        steps.push({ step: "nav_btn", label, url: page.url() });
        break;
      }
    }

    // Look for existing STRIPE_WEBHOOK_SECRET_TEST row or add new
    const body = await page.content();
    const hasKey = /STRIPE_WEBHOOK_SECRET_TEST/.test(body);
    steps.push({ step: "env_key_visible", hasKey });

    // Try add variable UI patterns in Coolify v4
    const addBtn = page.getByRole("button", { name: /add|new|create/i }).first();
    if (await addBtn.count()) await addBtn.click().catch(() => {});

    const keyInput = page.locator('input[placeholder*="KEY" i], input[name*="key" i], input[placeholder*="Name" i]').first();
    const valInput = page.locator('input[placeholder*="VALUE" i], input[name*="value" i], textarea').first();
    if (await keyInput.count()) {
      await keyInput.fill("STRIPE_WEBHOOK_SECRET_TEST");
      if (await valInput.count()) await valInput.fill(whsec);
      const save = page.getByRole("button", { name: /save|add|create|update/i }).first();
      if (await save.count()) await save.click().catch(() => {});
      steps.push({ step: "env_write_attempted", ok: true });
    } else {
      steps.push({ step: "env_write_attempted", ok: false, reason: "no_key_input" });
    }

    // Redeploy
    for (const label of ["Redeploy", "Deploy", "Force Deploy"]) {
      const b = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first();
      if (await b.count()) {
        await b.click();
        await page.waitForTimeout(2000);
        // confirm dialog
        const confirm = page.getByRole("button", { name: /confirm|yes|redeploy|deploy/i }).last();
        if (await confirm.count()) await confirm.click().catch(() => {});
        steps.push({ step: "redeploy_clicked", label });
        break;
      }
    }

    // Also open Stripe test for user
    const stripePage = await context.newPage();
    await stripePage.goto("https://dashboard.stripe.com/test/radar", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    }).catch((e) => {
      steps.push({ step: "stripe_open_error", error: e instanceof Error ? e.message : "fail" });
    });
    await stripePage.waitForTimeout(4000);
    steps.push({
      step: "stripe_page",
      url: stripePage.url(),
      title: await stripePage.title().catch(() => ""),
    });

    // Keep browser open briefly so user can see
    await page.waitForTimeout(8000);
  } finally {
    const file = path.join(
      root,
      "docs/evidence",
      `coolify-drive-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    fs.writeFileSync(file, JSON.stringify({ finishedAt: new Date().toISOString(), steps }, null, 2));
    console.log(JSON.stringify({ evidenceFile: file, steps }, null, 2));
    await context.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
