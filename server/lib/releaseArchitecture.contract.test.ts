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

  it("a live room belongs to the creator whose id it is", () => {
    const live = read("server/routes/livestream.ts");
    const start = live.slice(
      live.indexOf("export async function handleLiveStart"),
      live.indexOf("export async function handleLiveEnd"),
    );
    // The room name came from the request body, so any authenticated user could
    // register as host of an offline creator's room, publish into it, and lock the
    // real creator out with the 409.
    expect(start).toContain("const ownRoom = sanitizeRoomName(auth.userId)");
    expect(start).toContain("You can only go live in your own room");
    expect(start).toContain("const roomName = ownRoom;");
    expect(start).not.toMatch(/roomName\s*=\s*raw/);
  });

  it("a revoked session cannot keep acting on an open socket", () => {
    const ws = read("server/websocket/index.ts");
    // Sockets are tagged with the session that opened them so a logout on one
    // device closes that socket without signing the other devices out.
    expect(ws).toContain("sessionTokenHash: string;");
    expect(ws).toContain("export function disconnectUserSession(");
    expect(ws).toContain("if (sessionTokenHash && client.sessionTokenHash !== sessionTokenHash) continue;");
    const auth = read("server/routes/auth.ts");
    expect(auth).toContain('ws.disconnectUserSession(payload.sub, hashSessionToken(token), "Signed out")');
    // Delete and password reset end every session, so they close every socket.
    expect(auth.match(/disconnectUserSessions\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("logout does not report a sign-out the database refused", () => {
    const auth = read("server/routes/auth.ts");
    const logout = auth.slice(
      auth.indexOf("export async function handleLogout"),
      auth.indexOf("export async function handleMe"),
    );
    expect(logout).toContain("Could not sign out. Please try again.");
    expect(logout.indexOf("503")).toBeLessThan(logout.indexOf("ok: true"));
  });

  it("every path that mints a session refuses a suspended account", () => {
    const auth = read("server/routes/auth.ts");
    expect(auth).toContain("async function refuseIfSuspended");
    // Password login, the email-confirmation callback and Apple sign-in.
    expect(auth.match(/await refuseIfSuspended\(/g)?.length).toBe(3);
    // An unreadable ban state must not issue the session.
    expect(auth).toContain("banned_until check failed — refusing to issue a session");
  });

  it("login attempts are counted against the account, not only the address", () => {
    const auth = read("server/routes/auth.ts");
    expect(auth).toContain("async function loginLockedOut");
    expect(auth).toContain("valkeyTryHincrby");
    // Shared counter, hashed identifier, and an unreadable counter refuses.
    expect(auth).toContain("login lockout: counter unreadable — refusing attempt");
    expect(auth).toContain("loginFailureKey(identifier)");
    expect(auth).toContain("hashSessionToken(identifier.trim().toLowerCase())");
    // Checked before the password is examined so the answer cannot separate a
    // locked account from an unknown one.
    expect(auth.indexOf("if (await loginLockedOut(e))")).toBeLessThan(
      auth.indexOf("const user = await dbFindUserByEmailOrUsername(e)"),
    );
  });

  it("2FA and REST chat sends have their own per-account limits", () => {
    const limits = read("server/middleware/rateLimit.ts");
    expect(limits).toContain("export const twoFactorLimiter");
    expect(limits).toContain('keyPrefix: "twofa_user"');
    expect(limits).toContain("export const chatSendLimiter");
    expect(limits).toContain('keyPrefix: "chat_send_user"');
    const authRouter = read("server/routes/auth.router.ts");
    expect(authRouter.match(/twoFactorLimiter/g)?.length).toBe(4);
    const chatRouter = read("server/routes/chat.router.ts");
    expect(chatRouter.match(/chatSendLimiter/g)?.length).toBe(3);
  });

  it("rate-limit keys come from the trusted hop, not a client header", () => {
    // X-Forwarded-For is caller-supplied. Rotating it gave a fresh budget per
    // request, so a limit keyed on it counted nothing.
    for (const file of ["server/routes/feed.ts", "server/routes/testCoins.ts"]) {
      const source = read(file);
      expect(source).toContain("req.ip");
      expect(source).not.toContain('headers["x-forwarded-for"]');
    }
  });

  it("view and moderation limits refuse rather than open when Valkey cannot answer", () => {
    const feed = read("server/routes/feed.ts");
    const limit = feed.slice(
      feed.indexOf("async function allowViewRateLimit"),
      feed.indexOf("async function allowViewRateLimit") + 900,
    );
    expect(limit).toContain('process.env.NODE_ENV === "production"');
    expect(limit).toContain("refusing view (fail closed)");
    expect(limit).not.toMatch(/catch[\s\S]{0,80}return true;\s*\n\s*\}\s*\n\}/);
    const moderation = read("server/routes/moderation.ts");
    // Each accepted call is a paid vision request, so an unanswerable limiter
    // must not become an open door.
    expect(moderation).toContain("refusing request (fail closed)");
    expect(moderation).toContain("requires Valkey in production — refusing request");
    const authFile = read("server/routes/auth.ts");
    // An unclaimable resend cooldown skips the mail instead of sending it, so an
    // outage cannot turn confirmation email into an uncapped sender.
    expect(authFile).toContain("cooldown unavailable — skipping send");
  });

  it("who is live in a room is the server's answer, not the sharer's", () => {
    const share = read("server/lib/liveShareOps.ts");
    expect(share).toContain("await dbGetStreamOwnerUserId(streamKey)");
    expect(share).toContain("const hostVerified = !input.hostUserId || input.hostUserId === hostUserId");
    // Unverified host display fields are dropped rather than forwarded.
    expect(share).toContain("hostName: hostVerified ? input.hostName || \"\" : \"\"");
    expect(share).toContain("hostAvatar: hostVerified ? input.hostAvatar || \"\" : \"\"");
  });

  it("a block stops a co-host invite or request from being sent, not just accepted", () => {
    const handlers = read("server/websocket/handlers.ts");
    const invite = handlers.slice(
      handlers.indexOf('case "cohost_invite_send"'),
      handlers.indexOf('case "cohost_invite_accept"'),
    );
    const request = handlers.slice(
      handlers.indexOf('case "cohost_request_send"'),
      handlers.indexOf('case "cohost_request_accept"'),
    );
    expect(invite).toContain("await dbIsBlockedEitherWay(client.userId, targetUserId)");
    expect(request).toContain("await dbIsBlockedEitherWay(client.userId, hostUserId)");
  });

  it("the moderator list is not an anonymous targeting query", () => {
    const mods = read("server/routes/liveModerators.ts");
    const list = mods.slice(
      mods.indexOf("export async function handleListLiveModerators"),
      mods.indexOf("export async function handleAddLiveModerator"),
    );
    expect(list).toContain("if (!requireAuthUser(req, res)) return;");
  });

  it("a public profile read does not hand out a login address", () => {
    const profiles = read("server/routes/profiles.ts");
    const get = profiles.slice(
      profiles.indexOf("export async function handleGetProfile"),
      profiles.indexOf("/** GET /api/profiles — list all known users/profiles */"),
    );
    // Non-owners get the local part the UI already renders; the domain stays here.
    expect(get).toContain("const isOwner = jwtUser?.sub === userId");
    expect(get).toContain('const email = !fullEmail || isOwner ? fullEmail : `${fullEmail.split("@")[0]}@`');
  });

  it("the local Valkey opt-out cannot turn a production deployment into dev", () => {
    const config = read("server/config.ts");
    // One variable used to skip env validation, the Valkey boot gate, shared rate
    // limits and the CORS allowlist by rewriting NODE_ENV.
    expect(config).not.toMatch(/process\.env\.NODE_ENV\s*=\s*['"]development['"]/);
    expect(config).toContain("ELIX_LOCAL_NO_VALKEY is a development-only flag");
    expect(config).toContain("process.exit(1)");
    const env = read("server/lib/envValidate.ts");
    expect(env).toContain("ELIX_LOCAL_NO_VALKEY must not be set in production");
  });

  it("Google service account credentials are validated as usable, not merely present", () => {
    const env = read("server/lib/envValidate.ts");
    expect(env).toContain("JSON.parse");
    expect(env).toContain("client_email");
    expect(env).toContain("private_key");
  });
});
