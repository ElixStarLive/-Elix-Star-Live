/**
 * Use existing Chrome profile cookies to access Coolify / Stripe Dashboard.
 * Never prints secrets. Writes safe evidence only.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import os from "os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const chromeUser = path.join(
  process.env.LOCALAPPDATA || "",
  "Google",
  "Chrome",
  "User Data",
);
const tmpProfile = path.join(os.tmpdir(), `elix-chrome-profile-${Date.now()}`);

async function copyEssential(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  // Copy Default Network cookies + Local State minimally via junction is hard on Windows;
  // launch with userDataDir=chromeUser and channel chrome may fail if Chrome is open.
  // Prefer channel chrome with temporary copy of Default folder files we need.
  const defSrc = path.join(src, "Default");
  const defDest = path.join(dest, "Default");
  fs.mkdirSync(path.join(defDest, "Network"), { recursive: true });
  for (const f of ["Local State", "Default/Preferences", "Default/Network/Cookies", "Default/Network/Cookies-journal"]) {
    const from = path.join(src, f.replace(/^Default\//, f.startsWith("Default") ? "" : "").replace(/^/, ""));
  }
  // Simpler: copy Cookies DB if present
  const cookieSrc = path.join(defSrc, "Network", "Cookies");
  if (fs.existsSync(cookieSrc)) {
    fs.copyFileSync(cookieSrc, path.join(defDest, "Network", "Cookies"));
  }
  const localState = path.join(src, "Local State");
  if (fs.existsSync(localState)) fs.copyFileSync(localState, path.join(dest, "Local State"));
}

async function main() {
  const out: Record<string, unknown> = {
    coolifyLoggedIn: "no",
    stripeLoggedIn: "no",
    redeployTriggered: "no",
    radarEnabled: "no",
    appUuid: null as string | null,
  };

  try {
    await copyEssential(chromeUser, tmpProfile);
  } catch (e) {
    out.copyError = e instanceof Error ? e.message : "copy_failed";
  }

  let browser;
  try {
    browser = await chromium.launchPersistentContext(tmpProfile, {
      headless: true,
      channel: "chrome",
      args: ["--disable-blink-features=AutomationControlled"],
      timeout: 60_000,
    });
  } catch {
    browser = await chromium.launchPersistentContext(tmpProfile, {
      headless: true,
      timeout: 60_000,
    });
  }

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20_000);

    // Coolify
    await page.goto("https://app.coolify.io", { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => null);
    await page.waitForTimeout(2500);
    const coolifyUrl = page.url();
    const coolifyBody = (await page.content().catch(() => "")).slice(0, 2000);
    const coolifyLogged =
      /projects|applications|dashboard|servers/i.test(coolifyBody) &&
      !/login|sign in|password/i.test(coolifyUrl);
    out.coolifyLoggedIn = coolifyLogged ? "yes" : "no";
    out.coolifyUrlHost = (() => {
      try {
        return new URL(coolifyUrl).host;
      } catch {
        return coolifyUrl;
      }
    })();

    if (coolifyLogged) {
      // try find uuid in page
      const uuidMatch = coolifyBody.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
      if (uuidMatch) out.appUuid = uuidMatch[0];
      const redeploy = page.getByRole("button", { name: /redeploy|deploy/i }).first();
      if (await redeploy.count()) {
        await redeploy.click({ timeout: 5000 }).catch(() => {});
        out.redeployTriggered = "attempted";
      }
    }

    // Stripe Dashboard test radar
    await page.goto("https://dashboard.stripe.com/test/radar", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    }).catch(() => null);
    await page.waitForTimeout(3000);
    const stripeUrl = page.url();
    const stripeBody = (await page.content().catch(() => "")).slice(0, 3000);
    const stripeLogged =
      /radar|rules|risk/i.test(stripeBody) && !/login|sign.in/i.test(stripeUrl);
    out.stripeLoggedIn = stripeLogged ? "yes" : "no";
    out.stripeUrlHost = (() => {
      try {
        return new URL(stripeUrl).host;
      } catch {
        return stripeUrl;
      }
    })();
    if (stripeLogged) {
      if (/enabled|active|radar for platforms/i.test(stripeBody)) out.radarEnabled = "likely_yes";
      const enable = page.getByRole("button", { name: /enable|turn on|get started/i }).first();
      if (await enable.count()) {
        await enable.click({ timeout: 5000 }).catch(() => {});
        out.radarEnabled = "enable_clicked";
      } else {
        out.radarEnabled = /radar/i.test(stripeBody) ? "page_loaded" : "no";
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const file = path.join(
    root,
    "docs/evidence",
    `dashboard-session-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ...out, evidenceFile: file }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
