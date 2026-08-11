/**
 * Headed Chrome: Radar enable + Express Account Link using the user's logged-in Stripe session.
 * Prefer attaching to an already-running Chrome with --remote-debugging-port=9222.
 * Fallback: launch Chrome (may need user to log in if cookies not shared).
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EXPRESS_URL =
  process.env.ELIX_EXPRESS_ONBOARD_URL ||
  "https://connect.stripe.com/setup/e/acct_1U1CBSEBKvSEZoIE/Lbx6hVV7B3T6";

async function attachOrLaunch(): Promise<{ browser: Browser | null; context: BrowserContext }> {
  try {
    const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
    const context = browser.contexts()[0] || (await browser.newContext());
    return { browser, context };
  } catch {
    /* not running with debug port */
  }

  const chromeUser = path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data");
  const tmp = path.join(os.tmpdir(), `elix-stripe-${Date.now()}`);
  fs.mkdirSync(path.join(tmp, "Default", "Network"), { recursive: true });
  for (const rel of [
    ["Local State", "Local State"],
    ["Default/Network/Cookies", "Default/Network/Cookies"],
    ["Default/Preferences", "Default/Preferences"],
  ] as const) {
    const from = path.join(chromeUser, rel[0]);
    const to = path.join(tmp, rel[1]);
    if (fs.existsSync(from)) {
      try {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      } catch {
        /* locked */
      }
    }
  }

  const context = await chromium
    .launchPersistentContext(tmp, {
      headless: false,
      channel: "chrome",
      viewport: { width: 1400, height: 900 },
      args: ["--disable-blink-features=AutomationControlled"],
    })
    .catch(() =>
      chromium.launchPersistentContext(tmp, {
        headless: false,
        viewport: { width: 1400, height: 900 },
      }),
    );
  return { browser: null, context };
}

async function tryEnableRadar(page: Page, steps: Array<Record<string, unknown>>) {
  await page.goto("https://dashboard.stripe.com/test/radar", {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(4000);
  const url = page.url();
  const title = await page.title().catch(() => "");
  const loggedIn = /dashboard\.stripe\.com/i.test(url) && !/login|sign.?in/i.test(url);
  steps.push({ step: "radar_page", url, title, loggedIn });

  if (!loggedIn) {
    steps.push({ step: "radar", status: "not_logged_in" });
    return;
  }

  // Prefer Connect / Platforms radar settings if linked
  const platforms = page.getByRole("link", { name: /platforms|connect|for platforms/i }).first();
  if (await platforms.count()) {
    await platforms.click().catch(() => {});
    await page.waitForTimeout(2000);
    steps.push({ step: "platforms_nav", url: page.url() });
  }

  const enableSelectors = [
    page.getByRole("button", { name: /enable radar|turn on|get started|enable/i }).first(),
    page.locator("button:has-text('Enable')").first(),
    page.locator("a:has-text('Enable')").first(),
  ];
  let clicked = false;
  for (const el of enableSelectors) {
    if (await el.count()) {
      await el.click({ timeout: 5000 }).catch(() => {});
      clicked = true;
      await page.waitForTimeout(2000);
      break;
    }
  }

  // Confirm dialogs
  const confirm = page.getByRole("button", { name: /confirm|yes|enable|continue|agree/i }).last();
  if (await confirm.count()) {
    await confirm.click().catch(() => {});
    await page.waitForTimeout(1500);
  }

  const after = (await page.content().catch(() => "")).slice(0, 4000);
  const likelyOn =
    /radar is (on|enabled)|enabled|active|rules/i.test(after) &&
    !/enable radar for platforms/i.test(after);
  steps.push({
    step: "radar",
    status: clicked ? "enable_clicked" : likelyOn ? "already_likely_on" : "page_open_no_button",
    url: page.url(),
  });
}

async function openExpress(page: Page, steps: Array<Record<string, unknown>>) {
  await page.goto(EXPRESS_URL, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch((e) => {
    steps.push({ step: "express_nav_error", error: e instanceof Error ? e.message : "fail" });
  });
  await page.waitForTimeout(3000);
  steps.push({
    step: "express_page",
    url: page.url(),
    title: await page.title().catch(() => ""),
  });
  // Do not invent KYC answers in headless — leave form for owner; try obvious Continue if present
  for (let i = 0; i < 3; i++) {
    const cont = page.getByRole("button", { name: /continue|next|agree|submit|done/i }).first();
    if (await cont.count()) {
      await cont.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(2000);
      steps.push({ step: "express_click", i, url: page.url() });
    } else break;
  }
}

async function main() {
  const steps: Array<Record<string, unknown>> = [];
  const { browser, context } = await attachOrLaunch();
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(45_000);

  try {
    await tryEnableRadar(page, steps);
    const expressPage = await context.newPage();
    await openExpress(expressPage, steps);
    // Keep open so owner can finish KYC / confirm Radar
    steps.push({ step: "waiting_owner", seconds: 90 });
    await page.waitForTimeout(90_000);
  } finally {
    const file = path.join(
      root,
      "docs/evidence",
      `stripe-session-drive-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    );
    fs.writeFileSync(file, JSON.stringify({ finishedAt: new Date().toISOString(), steps }, null, 2));
    console.log(JSON.stringify({ evidenceFile: file, steps }, null, 2));
    await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
