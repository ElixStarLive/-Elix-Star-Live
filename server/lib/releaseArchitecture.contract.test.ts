import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

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

  it("an unknown Stripe transfer outcome never releases the reserved payout", () => {
    const payout = read("server/lib/monetisation/payoutProvider.ts");
    const submit = payout.slice(
      payout.indexOf("export async function submitWithdrawalToProvider"),
      payout.indexOf("async function recordTransferOutcome"),
    );
    // A timeout or 5xx may have created the transfer. Only a definite refusal
    // may hand the money back, and only after asking Stripe what happened.
    expect(submit).toContain('classifyStripeFailure(err) === "unknown"');
    expect(submit).toContain("provider_outcome_unknown");
    expect(submit.indexOf("provider_outcome_unknown")).toBeLessThan(
      submit.indexOf('toStatus: "failed"'),
    );
    expect(submit).toContain("findTransferForWithdrawal");
    expect(payout).toContain("transfer_group: withdrawalId");
    // Only these four Stripe errors prove nothing was created.
    const classify = payout.slice(
      payout.indexOf("export function classifyStripeFailure"),
      payout.indexOf("async function findTransferForWithdrawal"),
    );
    expect(classify).toMatch(/default:\s*return "unknown";/);
    expect(classify.match(/return "refused";/g)?.length).toBe(1);
  });

  it("a withdrawal that already returned its money cannot be submitted or paid", () => {
    const payout = read("server/lib/monetisation/payoutProvider.ts");
    expect(payout).toContain("withdrawal_not_payable");
    const withdrawals = read("server/lib/monetisation/gbpWithdrawals.ts");
    // One transition table owns every status change, so a stale provider event
    // cannot resurrect a failed payout or pay a cancelled one.
    expect(withdrawals).toContain("const ALLOWED_TRANSITIONS");
    expect(withdrawals).toContain('failed: ["failed"]');
    expect(withdrawals).toContain('rejected: ["rejected"]');
    expect(withdrawals).toContain('cancelled: ["cancelled"]');
    expect(withdrawals).toContain('paid: ["paid", "failed"]');
    expect(withdrawals).toContain('return { ok: false, error: "invalid_transition" }');
  });

  it("a reversed payout gives the creator their money back", () => {
    const withdrawals = read("server/lib/monetisation/gbpWithdrawals.ts");
    expect(withdrawals).toContain('revenueSource: "PAYOUT_REVERSAL"');
    expect(withdrawals).toContain("withdrawn_pence = GREATEST(0, withdrawn_pence - $2)");
    expect(withdrawals).toContain("idempotencyKey: `payout_reversal:${input.withdrawalId}`");
    expect(withdrawals).toContain("if (!reversal.alreadyExisted)");
  });

  it("a refund cannot claw back pence reserved for a payout in flight", () => {
    const ledger = read("server/lib/monetisation/ledger.ts");
    const reversal = ledger.slice(
      ledger.indexOf("// Negative creator amount (reversal)"),
      ledger.indexOf("/** Platform GBP books"),
    );
    // held_pence belongs to a transfer that will still settle. Taking it here
    // makes the payout subtract from a balance that no longer holds it.
    expect(reversal).not.toContain("held_pence - ");
    expect(reversal).not.toContain("fromHeld");
    expect(reversal).toContain("recoverable_pence = recoverable_pence + $5");
  });

  it("the withdrawal function validates the amount itself", () => {
    const withdrawals = read("server/lib/monetisation/gbpWithdrawals.ts");
    // Infinity survives `Number(x) || 0`, so the guard must be explicit.
    expect(withdrawals).toContain("if (!Number.isFinite(requested))");
    expect(withdrawals).toContain("!Number.isSafeInteger(amount)");
    expect(withdrawals).not.toContain("Math.floor(Number(input.amountPence) || 0)");
  });

  it("withdrawal idempotency keys are bound to the creator, amount and currency", () => {
    const withdrawals = read("server/lib/monetisation/gbpWithdrawals.ts");
    expect(withdrawals).toContain("idempotency_key_conflict");
    expect(withdrawals).toContain("settled.creatorUserId !== input.creatorUserId");
    expect(withdrawals).toContain("settled.amountPence !== amount");
    expect(withdrawals).toContain("settled.currency !== currency");
  });

  it("both withdrawal rails share one email gate that fails closed", () => {
    const payout = read("server/routes/payout.ts");
    expect(payout).toContain("async function withdrawalEmailGate");
    expect(payout).toContain("isEmailConfigured()");
    expect(payout).toContain("Please confirm your email before requesting a payout");
    // Coins and GBP both go through the gate, and a broken check refuses.
    expect(payout.match(/await withdrawalEmailGate\(db, userId\)/g)?.length).toBe(2);
    expect(payout.match(/if \(emailGate\) \{/g)?.length).toBe(2);
    expect(payout).toContain("payout email-confirm check failed — withdrawal refused");
  });

  it("withdrawals and Connect onboarding are rate limited per creator", () => {
    const router = read("server/routes/payout.router.ts");
    expect(router.match(/creatorPayoutLimiter/g)?.length).toBe(4);
    const limits = read("server/middleware/rateLimit.ts");
    expect(limits).toContain("export const creatorPayoutLimiter");
    expect(limits).toContain('keyPrefix: "creator_payout_user"');
  });

  it("Connect account identity comes from our records, not from event metadata", () => {
    const payout = read("server/lib/monetisation/payoutProvider.ts");
    const resolver = payout.slice(
      payout.indexOf("async function creatorForProviderAccount"),
      payout.indexOf("export async function handleStripeConnectPayoutWebhook"),
    );
    expect(resolver).toContain("FROM elix_creator_payout_accounts");
    expect(resolver).toContain("provider_account_id = $1");
    const hook = payout.slice(payout.indexOf('if (eventType === "account.updated")'));
    expect(hook).toContain("creatorForProviderAccount");
    // A capability change we failed to store must be redelivered.
    expect(hook).toContain("return { ok: refreshed.ok }");
  });

  it("payout provider events are recorded durably for failures as well as payments", () => {
    const payout = read("server/lib/monetisation/payoutProvider.ts");
    expect(payout).toContain("async function recordProviderEvent");
    expect(payout).toContain("ON CONFLICT (provider, event_id) DO NOTHING");
    expect(payout).toContain("async function failPayoutFromProvider");
    const fail = payout.slice(
      payout.indexOf("async function failPayoutFromProvider"),
      payout.indexOf("async function creatorForProviderAccount"),
    );
    expect(fail).toContain("recordProviderEvent");
    // A database failure is a retry; an impossible event is acknowledged.
    expect(fail).toContain("isPermanentSettlementError");
    expect(fail).toContain('retryable: true');
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

  it("every client module the server imports is shipped in the runtime image", () => {
    // The production image runs the server from TypeScript, so an import that
    // resolves at build time but is absent from the runner stage does not fail
    // the build — it kills every worker on boot with ERR_MODULE_NOT_FOUND.
    const serverFiles: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) serverFiles.push(rel);
      }
    };
    walk("server");

    const reached = new Set<string>();
    for (const file of serverFiles) {
      const source = read(file);
      for (const match of source.matchAll(/from\s+["']((?:\.\.\/)+src\/[^"']+)["']/g)) {
        // Resolve the relative specifier against the importing file's directory
        // so the result is the repo-relative path Docker has to copy.
        const fromDir = resolve(root, file, "..");
        const abs = resolve(fromDir, match[1]);
        reached.add(relative(root, abs).split("\\").join("/"));
      }
    }

    const dockerfile = read("Dockerfile");
    for (const target of reached) {
      expect(
        dockerfile.includes(`${target}.ts`),
        `server imports ${target} but the Dockerfile runner stage never copies it`,
      ).toBe(true);
    }
  });
});
