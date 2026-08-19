import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { appAccountTokenForUserId } from "../../src/lib/storeProductCatalogs";

/**
 * Google Play settlement contract for coin purchases, promotes and memberships.
 *
 * Play takes the money before this server sees anything, so the answers here
 * decide whether a paying customer keeps what they bought. Three answers were
 * wrong on real money: an unreachable androidpublisher was reported as
 * "Invalid receipt" (permanent, and Play auto-refunds the untouched token after
 * three days), a multi-quantity purchase credited a single pack, and replaying
 * somebody else's settled token answered "already processed" with the replayer's
 * own balance — success for an attempted theft.
 */

const verifyGooglePlayProductPurchase = vi.fn();
const verifyGoogleSubscription = vi.fn();
const acknowledgeGoogleSubscription = vi.fn();
const ensureCreatorMembershipProduct = vi.fn();
const consumeGooglePlayAfterCredit = vi.fn();
const neonIsIapProcessed = vi.fn();
const neonSettledIapPurchase = vi.fn();
const neonCreditIap = vi.fn();
const neonGetCoinBalance = vi.fn();
const neonUpsertMembershipEntitlement = vi.fn();
const neonInsertPromotePurchase = vi.fn();
const neonIsPromoteProcessed = vi.fn();
const autoPostSubscriptionRevenue = vi.fn();
const autoPostPromoteRevenue = vi.fn();

vi.mock("../lib/valkey", () => ({
  isValkeyConfigured: () => true,
  valkeyRateConsume: async () => ({ allowed: true, member: "slot" }),
  valkeyRateRelease: async () => {},
}));

vi.mock("./auth", () => ({
  getTokenFromRequest: () => "token",
  verifyAuthToken: () => ({ sub: "user-a" }),
}));

vi.mock("../lib/fraud", () => ({
  assertIapVerifyVelocityOk: async () => ({ ok: true }),
  releaseIapVerifyVelocity: async () => {},
}));

vi.mock("../lib/postgres", () => ({
  getPool: () => ({ query: vi.fn() }),
  dbLoadCoinMap: async () => ({}),
}));

vi.mock("../lib/walletNeon", () => ({
  neonCreditIap: (...args: unknown[]) => neonCreditIap(...args),
  neonGetActiveMembershipEntitlement: vi.fn(async () => null),
  neonGetCoinBalance: (...args: unknown[]) => neonGetCoinBalance(...args),
  neonInsertPromotePurchase: (...args: unknown[]) => neonInsertPromotePurchase(...args),
  neonIsIapProcessed: (...args: unknown[]) => neonIsIapProcessed(...args),
  neonIsPromoteProcessed: (...args: unknown[]) => neonIsPromoteProcessed(...args),
  neonSettledIapPurchase: (...args: unknown[]) => neonSettledIapPurchase(...args),
  neonUpsertMembershipEntitlement: (...args: unknown[]) =>
    neonUpsertMembershipEntitlement(...args),
}));

vi.mock("../lib/googlePlaySubscriptions", () => ({
  CREATOR_MEMBERSHIP_BASE_PLAN_ID: "monthly",
  acknowledgeGoogleSubscription: (...args: unknown[]) => acknowledgeGoogleSubscription(...args),
  consumeGooglePlayProduct: vi.fn(async () => ({ ok: true })),
  creatorMembershipProductId: (creatorId: string) => `elix.creator.${creatorId}`,
  ensureCreatorMembershipProduct: (...args: unknown[]) => ensureCreatorMembershipProduct(...args),
  hashPurchaseToken: (token: string) => `hash:${token}`,
  verifyGooglePlayProductPurchase: (...args: unknown[]) =>
    verifyGooglePlayProductPurchase(...args),
  verifyGoogleSubscription: (...args: unknown[]) => verifyGoogleSubscription(...args),
}));

vi.mock("../lib/googlePlayConsume", () => ({
  consumeGooglePlayAfterCredit: (...args: unknown[]) => consumeGooglePlayAfterCredit(...args),
}));

vi.mock("../lib/appleIap", () => ({
  APPLE_CREATOR_MEMBERSHIP_PRODUCT_ID: "com.elixstarlive.membership",
  ensureAppleCreatorMembershipProduct: vi.fn(),
  fetchAppleTransaction: vi.fn(),
  hashAppleOriginalTransactionId: (id: string) => `hash:${id}`,
  markAppleCreatorMembershipActive: vi.fn(),
  verifyAppleSubscription: vi.fn(),
}));

vi.mock("../lib/monetisation/storeSettlement", () => ({
  autoPostSubscriptionRevenue: (...args: unknown[]) => autoPostSubscriptionRevenue(...args),
  autoPostPromoteRevenue: (...args: unknown[]) => autoPostPromoteRevenue(...args),
}));

vi.mock("../lib/notifications", () => ({ insertNotification: vi.fn() }));

const TOKEN = "gpa.token-aaaa-bbbb";
/** Play returns the obfuscatedAccountId the billing flow was launched with. */
const OWNER_ACCOUNT_TOKEN = appAccountTokenForUserId("user-a");
const OTHER_ACCOUNT_TOKEN = appAccountTokenForUserId("user-b");

function verifiedPurchase(overrides: Record<string, unknown> = {}) {
  return {
    valid: true,
    productId: "coins500a",
    orderId: "GPA.1111",
    quantity: 1,
    purchaseType: null,
    acknowledgementState: 0,
    purchaseTimeMillis: "1750000000000",
    obfuscatedExternalAccountId: null,
    payload: {},
    detail: "{}",
    ...overrides,
  };
}

function req(body: Record<string, unknown>): Request {
  return { method: "POST", headers: {}, body } as unknown as Request;
}

function coinBody(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-a",
    packageId: "coins500a",
    provider: "google",
    transactionId: "GPA.1111",
    receipt: TOKEN,
    ...overrides,
  };
}

function fakeRes() {
  const sent: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: unknown) {
      sent.body = body;
      return res;
    },
    send(body: unknown) {
      sent.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, sent };
}

let handleVerifyPurchase: typeof import("./misc")["handleVerifyPurchase"];
let handleMembershipIAPComplete: typeof import("./misc")["handleMembershipIAPComplete"];
let handlePromoteIAPComplete: typeof import("./misc")["handlePromoteIAPComplete"];

beforeAll(async () => {
  const mod = await import("./misc");
  handleVerifyPurchase = mod.handleVerifyPurchase;
  handleMembershipIAPComplete = mod.handleMembershipIAPComplete;
  handlePromoteIAPComplete = mod.handlePromoteIAPComplete;
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
  neonIsIapProcessed.mockResolvedValue(false);
  neonSettledIapPurchase.mockResolvedValue(null);
  neonGetCoinBalance.mockResolvedValue(1234);
  neonCreditIap.mockResolvedValue({ ok: true, newBalance: 1734, ledgerId: "ledger-1" });
  neonIsPromoteProcessed.mockResolvedValue(false);
  autoPostSubscriptionRevenue.mockResolvedValue({ ok: true });
  autoPostPromoteRevenue.mockResolvedValue({ ok: true });
  consumeGooglePlayAfterCredit.mockResolvedValue(undefined);
  verifyGooglePlayProductPurchase.mockResolvedValue(verifiedPurchase());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Google coin purchase — unreachable Google is retryable, not a rejection", () => {
  it("answers 503 with retry and credits nothing when Google gives no verdict", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue({
      valid: false,
      reason: "unavailable",
      detail: "google-verify-503: backend error",
    });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.status).toBe(503);
    expect(sent.body).toMatchObject({ code: "verification_unavailable", retry: true });
    expect(neonCreditIap).not.toHaveBeenCalled();
    expect(consumeGooglePlayAfterCredit).not.toHaveBeenCalled();
  });

  it("answers 400 and credits nothing when Google rejects the token", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue({
      valid: false,
      reason: "invalid",
      detail: "google-verify-404: purchaseTokenNotFound",
    });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.status).toBe(400);
    expect(sent.body).toMatchObject({ code: "verification_failed" });
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("credits nothing for a pending purchase and never consumes the token", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue({
      valid: false,
      reason: "invalid",
      detail: "google-purchase-state-2",
    });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.status).toBe(400);
    expect(neonCreditIap).not.toHaveBeenCalled();
    expect(consumeGooglePlayAfterCredit).not.toHaveBeenCalled();
  });
});

describe("Google coin purchase — the server owns quantity, product and value", () => {
  it("credits the catalogue amount for the verified product", async () => {
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.body).toMatchObject({ success: true, newBalance: 1734 });
    expect(neonCreditIap).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        provider: "google",
        productId: "coins500a",
        coins: 500,
        quantity: 1,
        unpaidPurchase: false,
        googlePurchaseToken: TOKEN,
      }),
    );
  });

  it("multiplies the pack by the quantity Google verified", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue(verifiedPurchase({ quantity: 3 }));
    const { res } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(neonCreditIap).toHaveBeenCalledWith(
      expect.objectContaining({ coins: 1500, quantity: 3 }),
    );
  });

  it("ignores a coin amount the client tries to dictate", async () => {
    const { res } = fakeRes();

    await handleVerifyPurchase(
      req(coinBody({ coins: 999_999, amountGbp: 0.01, priceGbp: 0 })),
      res,
    );

    expect(neonCreditIap).toHaveBeenCalledWith(expect.objectContaining({ coins: 500 }));
  });

  it("marks a licence-test purchase as unpaid so no GBP is invented", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue(verifiedPurchase({ purchaseType: 0 }));
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.body).toMatchObject({ success: true });
    expect(neonCreditIap).toHaveBeenCalledWith(
      expect.objectContaining({ coins: 500, unpaidPurchase: true }),
    );
  });

  it("marks promo and rewarded purchases as unpaid too", async () => {
    for (const purchaseType of [1, 2]) {
      neonCreditIap.mockClear();
      verifyGooglePlayProductPurchase.mockResolvedValue(verifiedPurchase({ purchaseType }));
      const { res } = fakeRes();

      await handleVerifyPurchase(req(coinBody()), res);

      expect(neonCreditIap).toHaveBeenCalledWith(
        expect.objectContaining({ unpaidPurchase: true }),
      );
    }
  });

  it("refuses a product that is not in the store catalogue", async () => {
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody({ packageId: "coins_free_9999" })), res);

    expect(sent.status).toBe(400);
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("refuses an Apple-only SKU presented as a Google purchase", async () => {
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody({ packageId: "coins500" })), res);

    expect(sent.status).toBe(400);
    expect(sent.body).toMatchObject({ code: "apple_product_as_google" });
    expect(verifyGooglePlayProductPurchase).not.toHaveBeenCalled();
  });

  it("refuses a Google settlement with no purchase token", async () => {
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody({ receipt: "" })), res);

    expect(sent.status).toBe(400);
    expect(verifyGooglePlayProductPurchase).not.toHaveBeenCalled();
  });

  it("refuses a purchase Google says belongs to another account", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue(
      verifiedPurchase({ obfuscatedExternalAccountId: OTHER_ACCOUNT_TOKEN }),
    );
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.status).toBe(403);
    expect(sent.body).toMatchObject({ code: "app_account_token_mismatch" });
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("accepts a purchase Google ties to this account", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue(
      verifiedPurchase({ obfuscatedExternalAccountId: OWNER_ACCOUNT_TOKEN }),
    );
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.body).toMatchObject({ success: true });
    expect(neonCreditIap).toHaveBeenCalled();
  });

  it("still settles a purchase from a build that sent no account id", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue(
      verifiedPurchase({ obfuscatedExternalAccountId: null }),
    );
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.body).toMatchObject({ success: true });
  });

  it("refuses to settle for a different account than the caller", async () => {
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody({ userId: "user-b" })), res);

    expect(sent.status).toBe(403);
    expect(neonCreditIap).not.toHaveBeenCalled();
  });
});

describe("Google coin purchase — one token credits exactly once", () => {
  it("answers deduplicated from the durable record without asking Google again", async () => {
    neonSettledIapPurchase.mockResolvedValue({ userId: "user-a", productId: "coins500a" });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ success: true, deduplicated: true, newBalance: 1234 });
    expect(verifyGooglePlayProductPurchase).not.toHaveBeenCalled();
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("still finishes the store token when the purchase was already settled", async () => {
    neonSettledIapPurchase.mockResolvedValue({ userId: "user-a", productId: "coins500a" });
    const { res } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(consumeGooglePlayAfterCredit).toHaveBeenCalledWith(
      expect.objectContaining({ productId: "coins500a", purchaseToken: TOKEN }),
    );
  });

  it("refuses another account replaying a settled token instead of reporting success", async () => {
    neonSettledIapPurchase.mockResolvedValue({ userId: "user-b", productId: "coins500a" });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.status).toBe(403);
    expect(sent.body).toMatchObject({ code: "transaction_owned_by_another_user" });
    expect(sent.body).not.toMatchObject({ success: true });
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("refuses the same token reused against a different product", async () => {
    neonSettledIapPurchase.mockResolvedValue({ userId: "user-a", productId: "coins500a" });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody({ packageId: "coins1000" })), res);

    expect(sent.status).toBe(409);
    expect(sent.body).toMatchObject({ code: "transaction_product_conflict" });
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("credits once when the same token races itself into the credit call", async () => {
    neonCreditIap.mockResolvedValue({ ok: false, alreadyProcessed: true, newBalance: 1734 });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ success: true, deduplicated: true });
  });

  it("credits once across a hundred retries of the same token", async () => {
    let settledCount = 0;
    neonSettledIapPurchase.mockImplementation(async () =>
      settledCount > 0 ? { userId: "user-a", productId: "coins500a" } : null,
    );
    neonCreditIap.mockImplementation(async () => {
      settledCount += 1;
      return settledCount === 1
        ? { ok: true, newBalance: 1734, ledgerId: "ledger-1" }
        : { ok: false, alreadyProcessed: true, newBalance: 1734 };
    });

    for (let i = 0; i < 100; i++) {
      const { res, sent } = fakeRes();
      await handleVerifyPurchase(req(coinBody()), res);
      expect(sent.body).toMatchObject({ success: true });
    }

    expect(settledCount).toBe(1);
  });

  it("credits once when two devices submit the same token concurrently", async () => {
    let credits = 0;
    neonCreditIap.mockImplementation(async () => {
      credits += 1;
      return credits === 1
        ? { ok: true, newBalance: 1734, ledgerId: "ledger-1" }
        : { ok: false, alreadyProcessed: true, newBalance: 1734 };
    });

    const first = fakeRes();
    const second = fakeRes();
    await Promise.all([
      handleVerifyPurchase(req(coinBody()), first.res),
      handleVerifyPurchase(req(coinBody()), second.res),
    ]);

    expect(credits).toBe(2);
    expect(first.sent.body).toMatchObject({ success: true });
    expect(second.sent.body).toMatchObject({ success: true });
    // Only one of the two answers is a fresh credit; the other is the duplicate.
    const deduped = [first.sent.body, second.sent.body].filter(
      (b) => (b as { deduplicated?: boolean }).deduplicated === true,
    );
    expect(deduped).toHaveLength(1);
  });
});

describe("Google coin purchase — a database failure is never success", () => {
  it("answers 500 when the permanent credit failed", async () => {
    neonCreditIap.mockResolvedValue({ ok: false, error: "database_unavailable" });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.status).toBe(500);
    expect(sent.body).not.toMatchObject({ success: true });
    expect(consumeGooglePlayAfterCredit).not.toHaveBeenCalled();
  });

  it("does not treat a failed duplicate check as a fresh purchase", async () => {
    neonSettledIapPurchase.mockRejectedValue(new Error("neon down"));
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(req(coinBody()), res);

    expect(sent.status).toBe(500);
    expect(verifyGooglePlayProductPurchase).not.toHaveBeenCalled();
    expect(neonCreditIap).not.toHaveBeenCalled();
  });
});

describe("Google promote purchase", () => {
  function promoteBody(overrides: Record<string, unknown> = {}) {
    return {
      provider: "google",
      transactionId: "GPA.promote",
      productId: "com.elixstarlive.promote_views",
      receipt: TOKEN,
      contentType: "video",
      contentId: "video-1",
      ...overrides,
    };
  }

  it("answers 503 with retry when Google gives no verdict", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue({
      valid: false,
      reason: "unavailable",
      detail: "google-verify-500",
    });
    const { res, sent } = fakeRes();

    await handlePromoteIAPComplete(req(promoteBody()), res);

    expect(sent.status).toBe(503);
    expect(sent.body).toMatchObject({ code: "verification_unavailable", retry: true });
    expect(neonInsertPromotePurchase).not.toHaveBeenCalled();
  });

  it("answers 400 and records nothing when Google rejects the token", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue({
      valid: false,
      reason: "invalid",
      detail: "google-purchase-state-1",
    });
    const { res, sent } = fakeRes();

    await handlePromoteIAPComplete(req(promoteBody()), res);

    expect(sent.status).toBe(400);
    expect(neonInsertPromotePurchase).not.toHaveBeenCalled();
  });

  it("refuses a promote purchase Google ties to another account", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue(
      verifiedPurchase({
        productId: "com.elixstarlive.promote_views",
        obfuscatedExternalAccountId: OTHER_ACCOUNT_TOKEN,
      }),
    );
    const { res, sent } = fakeRes();

    await handlePromoteIAPComplete(req(promoteBody()), res);

    expect(sent.status).toBe(403);
    expect(neonInsertPromotePurchase).not.toHaveBeenCalled();
  });

  it("records a promote purchase Google ties to this account", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue(
      verifiedPurchase({
        productId: "com.elixstarlive.promote_views",
        obfuscatedExternalAccountId: OWNER_ACCOUNT_TOKEN,
      }),
    );
    const { res, sent } = fakeRes();

    await handlePromoteIAPComplete(req(promoteBody()), res);

    expect(sent.body).toMatchObject({ success: true });
    expect(neonInsertPromotePurchase).toHaveBeenCalled();
  });
});

describe("Google creator membership", () => {
  function membershipBody(overrides: Record<string, unknown> = {}) {
    return {
      provider: "google",
      creatorId: "creator-1",
      receipt: TOKEN,
      ...overrides,
    };
  }

  function entitled(overrides: Record<string, unknown> = {}) {
    return {
      ok: true,
      entitled: true,
      productId: "elix.creator.creator-1",
      basePlanId: "monthly",
      subscriptionState: "ACTIVE",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      autoRenewEnabled: true,
      acknowledgementState: "ACKNOWLEDGED",
      latestOrderId: "GPA.sub",
      linkedPurchaseTokenHash: null,
      externalAccountId: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    ensureCreatorMembershipProduct.mockResolvedValue({
      productId: "elix.creator.creator-1",
      basePlanId: "monthly",
      purchaseReady: true,
      status: "active",
    });
    neonUpsertMembershipEntitlement.mockResolvedValue({ ok: true, id: "sub-1", created: true });
    acknowledgeGoogleSubscription.mockResolvedValue({ ok: true });
  });

  it("answers 503 with retry when Google gives no verdict", async () => {
    verifyGoogleSubscription.mockResolvedValue({
      ok: false,
      entitled: false,
      error: "google_http_error",
      reason: "unavailable",
    });
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(req(membershipBody()), res);

    expect(sent.status).toBe(503);
    expect(sent.body).toMatchObject({ code: "verification_unavailable", retry: true });
    expect(neonUpsertMembershipEntitlement).not.toHaveBeenCalled();
  });

  it("answers 400 when Google says the subscription is not entitled", async () => {
    verifyGoogleSubscription.mockResolvedValue({
      ok: false,
      entitled: false,
      error: "not_entitled",
      reason: "not_entitled",
      subscriptionState: "EXPIRED",
    });
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(req(membershipBody()), res);

    expect(sent.status).toBe(400);
    expect(neonUpsertMembershipEntitlement).not.toHaveBeenCalled();
  });

  it("stores the entitlement from Google's verified state", async () => {
    verifyGoogleSubscription.mockResolvedValue(entitled());
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(req(membershipBody()), res);

    expect(sent.body).toMatchObject({ success: true });
    expect(neonUpsertMembershipEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        creatorId: "creator-1",
        provider: "google",
        productId: "elix.creator.creator-1",
        subscriptionState: "ACTIVE",
      }),
    );
  });

  it("refuses a subscription Google ties to another account", async () => {
    verifyGoogleSubscription.mockResolvedValue(
      entitled({ externalAccountId: OTHER_ACCOUNT_TOKEN }),
    );
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(req(membershipBody()), res);

    expect(sent.status).toBe(403);
    expect(neonUpsertMembershipEntitlement).not.toHaveBeenCalled();
  });

  it("accepts a subscription Google ties to this account", async () => {
    verifyGoogleSubscription.mockResolvedValue(
      entitled({ externalAccountId: OWNER_ACCOUNT_TOKEN }),
    );
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(req(membershipBody()), res);

    expect(sent.body).toMatchObject({ success: true });
  });

  it("refuses a token already bound to another account", async () => {
    verifyGoogleSubscription.mockResolvedValue(entitled());
    neonUpsertMembershipEntitlement.mockResolvedValue({ ok: false, error: "ownership_conflict" });
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(req(membershipBody()), res);

    expect(sent.status).toBe(409);
    expect(sent.body).not.toMatchObject({ success: true });
  });

  it("refuses a coin purchase token replayed as a membership", async () => {
    neonIsIapProcessed.mockResolvedValue(true);
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(req(membershipBody()), res);

    expect(sent.status).toBe(400);
    expect(verifyGoogleSubscription).not.toHaveBeenCalled();
  });

  it("does not report success when the creator revenue post failed", async () => {
    verifyGoogleSubscription.mockResolvedValue(entitled());
    autoPostSubscriptionRevenue.mockResolvedValue({ ok: false });
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(req(membershipBody()), res);

    expect(sent.status).toBe(500);
    expect(sent.body).toMatchObject({ error: "MEMBERSHIP_REVENUE_POST_FAILED", retry: true });
  });

  it("acknowledges only a subscription Google has not acknowledged yet", async () => {
    verifyGoogleSubscription.mockResolvedValue(entitled({ acknowledgementState: "PENDING" }));
    const { res } = fakeRes();

    await handleMembershipIAPComplete(req(membershipBody()), res);

    expect(acknowledgeGoogleSubscription).toHaveBeenCalledWith(
      "elix.creator.creator-1",
      TOKEN,
    );
  });

  it("keeps the entitlement when acknowledgement fails", async () => {
    verifyGoogleSubscription.mockResolvedValue(entitled({ acknowledgementState: "PENDING" }));
    acknowledgeGoogleSubscription.mockResolvedValue({ ok: false, detail: "status_500" });
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(req(membershipBody()), res);

    expect(sent.body).toMatchObject({ success: true });
    expect(neonUpsertMembershipEntitlement).toHaveBeenCalled();
  });
});
