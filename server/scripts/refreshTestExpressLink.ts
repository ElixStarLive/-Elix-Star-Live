import "../config.ts";
import Stripe from "stripe";
import { spawn } from "child_process";

process.env.ELIX_STRIPE_CONNECT_MODE = "test";

async function main() {
  const key = (process.env.STRIPE_SECRET_KEY_TEST || "").trim();
  const s = new Stripe(key, { apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion });
  const accountId = process.env.ELIX_EXPRESS_ACCT || "acct_1U1EYwEBKvYtF8Ar";
  const link = await s.accountLinks.create({
    account: accountId,
    refresh_url: "https://www.elixstarlive.co.uk/creator-payout?payout_refresh=1",
    return_url: "https://www.elixstarlive.co.uk/creator-payout?payout_return=1",
    type: "account_onboarding",
  });
  spawn("cmd", ["/c", "start", "", link.url], { detached: true, stdio: "ignore" }).unref();
  console.log(JSON.stringify({ ok: true, accountId, onboardingUrl: link.url }, null, 2));
}
main();
