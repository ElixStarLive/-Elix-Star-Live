import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(resolve(root, relative), "utf8");

describe("release architecture contracts", () => {
  it("1. GBP ledger failure rolls back the paid gift (no swallowed catch)", () => {
    const wallet = read("server/lib/walletNeon.ts");
    const start = wallet.indexOf("export async function neonDebitGiftWithCreatorCredit");
    const fn = wallet.slice(start, wallet.indexOf("export function creatorEarningHoldHours", start));
    expect(fn).toContain("await client.query(\"ROLLBACK\")");
    expect(fn).toContain("await postLedgerEntry");
    expect(fn).not.toContain("ledger skipped");
    expect(fn).not.toMatch(/catch \(ledgerErr\)/);
  });

  it("2. refund GBP failure does not acknowledge Apple/Google webhooks", () => {
    const wallet = read("server/lib/walletNeon.ts");
    const reverse = wallet.slice(wallet.indexOf("export async function neonReverseIapPurchase"));
    expect(reverse.indexOf("reversePurchaseFinancialsOnClient")).toBeLessThan(
      reverse.indexOf('await client.query("COMMIT")'),
    );
    const apple = read("server/routes/iapNotifications.ts");
    expect(apple).toContain('return res.status(500).json({ error: "reverse_failed" })');
    expect(apple).toContain('result.error !== "purchase_not_found"');
  });

  it("3. Stripe payout status failure does not permanently consume the webhook event", () => {
    const payout = read("server/lib/monetisation/payoutProvider.ts");
    const confirm = payout.slice(payout.indexOf("export async function confirmPayoutFromProvider"));
    expect(confirm).toContain("applyGbpWithdrawalStatusOnClient");
    expect(confirm.indexOf("applyGbpWithdrawalStatusOnClient")).toBeLessThan(
      confirm.indexOf('await client.query("COMMIT")'),
    );
    expect(confirm).toContain("event not committed");
    const webhook = read("server/routes/webhook.ts");
    expect(webhook).toContain("if (!payout.ok)");
    expect(webhook).toContain('res.status(500).json({ error: "Webhook processing failed" })');
  });

  it("4-5. co-host self-leave frees one seat and does not end the live", () => {
    const handlers = read("server/websocket/handlers.ts");
    const start = handlers.indexOf('case "cohost_seat_leave"');
    const end = handlers.indexOf('case "cohost_seats_clear"', start);
    const block = handlers.slice(start, end);
    expect(block).toContain("removeCohostSlot(seats, targetUserId)");
    expect(block).not.toContain("removeActiveStream");
    expect(block).not.toContain("stream_ended");
    expect(block).not.toContain("for (const seat of seats)");
  });

  it("pins Apple JWS trust to Apple Root CA G3", () => {
    const apple = read("server/lib/appleIap.ts");
    expect(apple).toContain("63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179");
    expect(apple).toContain("chainTerminatesAtAppleRootG3");
    expect(apple).not.toContain("does not look Apple-issued");
  });

  it("enforces Apple appAccountToken ownership on coins, promote and membership", () => {
    const misc = read("server/routes/misc.ts");
    expect(misc).toContain("appAccountTokenForUserId(userId)");
    expect(misc).toContain("missing_app_account_token");
    expect(misc).toContain("app_account_token_mismatch");
    // One ownership check, used by every Apple settlement route.
    expect(misc.match(/appleTokenOwnershipError\(\s*\n?\s*user\.sub/g)?.length).toBe(3);
  });

  it("enforces Google obfuscatedExternalAccountId ownership on coins, promote and membership", () => {
    const misc = read("server/routes/misc.ts");
    // One ownership check, used by every Google settlement route.
    expect(misc.match(/googleTokenOwnershipError\(user\.sub/g)?.length).toBe(3);
    // Google only returns the id when the billing flow supplied it, so an absent
    // id must fall back to first-settlement binding rather than reject the buyer.
    expect(misc).toContain("if (!actual) return null;");
  });

  it("Google consume is server-authoritative after durable credit", () => {
    const misc = read("server/routes/misc.ts");
    expect(misc).toContain("consumeGooglePlayAfterCredit");
    expect(misc).toContain("googlePlayConsume");
    const consume = read("server/lib/googlePlayConsume.ts");
    expect(consume).toContain('type: "google_play_consume"');
  });

  it("one Google Play verifier, and no verdict from Google stays retryable", () => {
    const misc = read("server/routes/misc.ts");
    // Every Play settlement route asks the same androidpublisher client. A
    // second hand-rolled verifier in a route file drifts from this one.
    expect(misc).toContain("verifyGooglePlayProductPurchase");
    expect(misc).not.toContain("oauth2.googleapis.com/token");
    expect(misc).not.toContain("androidpublisher.googleapis.com");
    expect(misc.match(/google\.valid === false && google\.reason === 'unavailable'/g)?.length).toBe(
      2,
    );
    const play = read("server/lib/googlePlaySubscriptions.ts");
    expect(play).toContain("function googleApiFailureReason");
    expect(play).toContain("google-purchase-refunded");
  });

  it("an unreachable Google never revokes a Play subscriber", () => {
    const notif = read("server/routes/iapNotifications.ts");
    const reconcile = notif.slice(
      notif.indexOf("async function reconcileGoogleSubscriptionEntitlement"),
      notif.indexOf("export async function handleGooglePlayRtdn"),
    );
    expect(reconcile).toContain('reason === "unavailable"');
    expect(reconcile.indexOf('reason === "unavailable"')).toBeLessThan(
      reconcile.indexOf("neonUpdateMembershipSubscriptionState"),
    );
    // RTDN must name this app; a message with no packageName is not evidence.
    expect(notif).toContain("decoded.packageName !== expectedPackage");
  });

  it("creator payout Connect uses v2 Account Links and stays in-app", () => {
    const payout = read("server/lib/monetisation/payoutProvider.ts");
    expect(payout).toContain("v2.core.accountLinks.create");
    expect(payout).toContain('configurations: ["merchant", "recipient"]');
    expect(payout).not.toContain("stripeClient.accountLinks.create");
    const page = read("src/pages/CreatorPayout.tsx");
    expect(page).toContain("openStripeHostedUrl");
    expect(page).not.toContain("window.location.href");
    const platform = read("src/lib/platform.ts");
    expect(platform).toContain("Browser.open");
  });

  it("test coins stay in the app by default (battle + animation, never money)", () => {
    const client = read("src/lib/testCoins.ts");
    expect(client).toContain("BATTLE GAME SCORE");
    expect(client).toMatch(/export function areTestCoinsEnabled\(\)[\s\S]*return true;/);
    const storeEnv = read(".env.store.example");
    expect(storeEnv).toContain("VITE_ALLOW_TEST_COINS=1");
    expect(storeEnv).not.toMatch(/VITE_ALLOW_TEST_COINS=0/);
    const mint = read("server/routes/testCoins.ts");
    expect(mint).not.toContain("TEST_COINS_MINT_DISABLED");
    expect(mint).toContain("financialValueGbp: 0");
    const spec = read("src/features/live/spectator/SpectatorLiveScreen.tsx");
    const host = read("src/features/live/host/LiveHostScreen.tsx");
    expect(spec).toContain('aria-label="Test coins"');
    expect(host).toContain('aria-label="Test coins"');
  });
});
