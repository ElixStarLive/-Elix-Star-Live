import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { appAccountTokenForUserId } from "../../src/lib/storeProductCatalogs";

/**
 * Apple settlement contract for coin purchases and creator memberships.
 *
 * The server is the only authority: it verifies the transaction with Apple, reads
 * the coin amount from its own catalogue, binds the transaction to the signed-in
 * account, and credits exactly once. Two answers used to be wrong on real money:
 * an unreachable Apple API was reported as "Invalid receipt" (a permanent
 * rejection for a charged customer), and nothing stopped another account from
 * replaying somebody else's membership transaction.
 */

const fetchAppleTransaction = vi.fn();
const verifyAppleSubscription = vi.fn();
const neonIsIapProcessed = vi.fn();
const neonSettledIapPurchase = vi.fn();
const neonCreditIap = vi.fn();
const neonGetCoinBalance = vi.fn();
const neonUpsertMembershipEntitlement = vi.fn();
const neonGetActiveMembershipEntitlement = vi.fn();
const autoPostSubscriptionRevenue = vi.fn();
const markAppleCreatorMembershipActive = vi.fn();

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
  neonGetActiveMembershipEntitlement: (...args: unknown[]) =>
    neonGetActiveMembershipEntitlement(...args),
  neonGetCoinBalance: (...args: unknown[]) => neonGetCoinBalance(...args),
  neonInsertPromotePurchase: vi.fn(),
  neonIsIapProcessed: (...args: unknown[]) => neonIsIapProcessed(...args),
  neonIsPromoteProcessed: vi.fn(),
  neonSettledIapPurchase: (...args: unknown[]) => neonSettledIapPurchase(...args),
  neonUpsertMembershipEntitlement: (...args: unknown[]) =>
    neonUpsertMembershipEntitlement(...args),
}));

vi.mock("../lib/appleIap", () => ({
  APPLE_CREATOR_MEMBERSHIP_PRODUCT_ID: "com.elixstarlive.membership",
  ensureAppleCreatorMembershipProduct: vi.fn(),
  fetchAppleTransaction: (...args: unknown[]) => fetchAppleTransaction(...args),
  hashAppleOriginalTransactionId: (id: string) => `hash:${id}`,
  markAppleCreatorMembershipActive: (...args: unknown[]) =>
    markAppleCreatorMembershipActive(...args),
  verifyAppleSubscription: (...args: unknown[]) => verifyAppleSubscription(...args),
}));

vi.mock("../lib/monetisation/storeSettlement", () => ({
  autoPostSubscriptionRevenue: (...args: unknown[]) => autoPostSubscriptionRevenue(...args),
  autoPostPromoteRevenue: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../lib/notifications", () => ({ insertNotification: vi.fn() }));

const OWNER_TOKEN = appAccountTokenForUserId("user-a");
const OTHER_TOKEN = appAccountTokenForUserId("user-b");

function applePayload(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "2000000111111111",
    originalTransactionId: "2000000111111111",
    productId: "coins500",
    bundleId: "com.elixstarlive.app",
    environment: "Production",
    appAccountToken: OWNER_TOKEN,
    ...overrides,
  };
}

function verifyReq(body: Record<string, unknown>): Request {
  return { method: "POST", headers: {}, body } as unknown as Request;
}

function coinPurchaseBody(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-a",
    packageId: "coins500",
    provider: "apple",
    transactionId: "2000000111111111",
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

beforeAll(async () => {
  const mod = await import("./misc");
  handleVerifyPurchase = mod.handleVerifyPurchase;
  handleMembershipIAPComplete = mod.handleMembershipIAPComplete;
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
  neonIsIapProcessed.mockResolvedValue(false);
  neonSettledIapPurchase.mockResolvedValue(null);
  neonGetCoinBalance.mockResolvedValue(1234);
  neonCreditIap.mockResolvedValue({ ok: true, newBalance: 1734, ledgerId: "ledger-1" });
  autoPostSubscriptionRevenue.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Apple coin purchase — unreachable Apple is retryable, not a rejection", () => {
  it("answers 503 with retry when Apple gives no verdict, and credits nothing", async () => {
    fetchAppleTransaction.mockResolvedValue({
      valid: false,
      reason: "unavailable",
      detail: "apple-api-500: gateway",
    });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody()), res);

    expect(sent.status).toBe(503);
    expect(sent.body).toMatchObject({ code: "verification_unavailable", retry: true });
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("answers 400 when Apple says the transaction is not acceptable", async () => {
    fetchAppleTransaction.mockResolvedValue({
      valid: false,
      reason: "invalid",
      detail: "apple-api-404: ",
    });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody()), res);

    expect(sent.status).toBe(400);
    expect(sent.body).toMatchObject({ code: "verification_failed" });
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("credits nothing for a sandbox transaction rejected by the verifier", async () => {
    fetchAppleTransaction.mockResolvedValue({
      valid: false,
      reason: "invalid",
      detail: "apple-transaction-environment-mismatch",
      payload: applePayload({ environment: "Sandbox" }),
    });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody()), res);

    expect(sent.status).toBe(400);
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("credits nothing for a revoked transaction", async () => {
    fetchAppleTransaction.mockResolvedValue({
      valid: true,
      productId: "coins500",
      detail: "{}",
      payload: applePayload({ revocationDate: Date.now() - 1000 }),
    });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody()), res);

    expect(sent.status).toBe(400);
    expect(neonCreditIap).not.toHaveBeenCalled();
  });
});

describe("Apple coin purchase — ownership and catalogue authority", () => {
  beforeEach(() => {
    fetchAppleTransaction.mockResolvedValue({
      valid: true,
      productId: "coins500",
      detail: "{}",
      payload: applePayload(),
    });
  });

  it("credits the catalogue coin amount and ignores anything the client claims", async () => {
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(
      verifyReq(coinPurchaseBody({ coins: 999999, price: 0.01, newBalance: 999999 })),
      res,
    );

    expect(sent.body).toMatchObject({ success: true, newBalance: 1734 });
    expect(neonCreditIap).toHaveBeenCalledTimes(1);
    expect(neonCreditIap.mock.calls[0][0]).toMatchObject({
      userId: "user-a",
      provider: "apple",
      productId: "coins500",
      coins: 500,
      providerTransactionId: "2000000111111111",
    });
  });

  it("refuses a transaction that Apple bound to another account", async () => {
    fetchAppleTransaction.mockResolvedValue({
      valid: true,
      productId: "coins500",
      detail: "{}",
      payload: applePayload({ appAccountToken: OTHER_TOKEN }),
    });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody()), res);

    expect(sent.status).toBe(400);
    expect(sent.body).toMatchObject({ code: "app_account_token_mismatch" });
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("refuses a transaction with no account binding at all", async () => {
    const payload = applePayload();
    delete (payload as Record<string, unknown>).appAccountToken;
    fetchAppleTransaction.mockResolvedValue({
      valid: true,
      productId: "coins500",
      detail: "{}",
      payload,
    });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody()), res);

    expect(sent.status).toBe(400);
    expect(sent.body).toMatchObject({ code: "missing_app_account_token" });
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("refuses to settle one account's purchase into another account", async () => {
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody({ userId: "user-b" })), res);

    expect(sent.status).toBe(403);
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("refuses a Google SKU presented as an Apple purchase", async () => {
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody({ packageId: "coins500a" })), res);

    expect(sent.status).toBe(400);
    expect(sent.body).toMatchObject({ code: "google_product_as_apple" });
    expect(fetchAppleTransaction).not.toHaveBeenCalled();
  });

  it("refuses an Apple product that is not in the server catalogue", async () => {
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody({ packageId: "coins999" })), res);

    expect(sent.status).toBe(400);
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("refuses when the verified product is not the product claimed", async () => {
    fetchAppleTransaction.mockResolvedValue({
      valid: true,
      productId: "coins100",
      detail: "{}",
      payload: applePayload({ productId: "coins100" }),
    });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody({ packageId: "coins500" })), res);

    expect(sent.status).toBe(400);
    expect(neonCreditIap).not.toHaveBeenCalled();
  });
});

describe("Apple coin purchase — one transaction, one credit", () => {
  beforeEach(() => {
    fetchAppleTransaction.mockResolvedValue({
      valid: true,
      productId: "coins500",
      detail: "{}",
      payload: applePayload(),
    });
  });

  it("answers deduplicated from the durable ledger without asking Apple again", async () => {
    neonSettledIapPurchase.mockResolvedValue({ userId: "user-a", productId: "coins500" });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody()), res);

    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ success: true, deduplicated: true, newBalance: 1234 });
    expect(fetchAppleTransaction).not.toHaveBeenCalled();
    expect(neonCreditIap).not.toHaveBeenCalled();
  });

  it("credits once when the same transaction races itself into the credit call", async () => {
    neonCreditIap.mockResolvedValue({ ok: false, alreadyProcessed: true, newBalance: 1734 });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody()), res);

    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ success: true, deduplicated: true, newBalance: 1734 });
  });

  it("credits once across twenty retries of the same transaction", async () => {
    let settled = 0;
    neonSettledIapPurchase.mockImplementation(async () =>
      settled > 0 ? { userId: "user-a", productId: "coins500" } : null,
    );
    neonCreditIap.mockImplementation(async () => {
      settled += 1;
      return settled === 1
        ? { ok: true, newBalance: 1734, ledgerId: "ledger-1" }
        : { ok: false, alreadyProcessed: true, newBalance: 1734 };
    });

    for (let i = 0; i < 20; i++) {
      const { res, sent } = fakeRes();
      await handleVerifyPurchase(verifyReq(coinPurchaseBody()), res);
      expect(sent.body).toMatchObject({ success: true });
    }

    expect(settled).toBe(1);
  });

  it("never reports success when the permanent credit failed", async () => {
    neonCreditIap.mockResolvedValue({ ok: false, error: "database_unavailable" });
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody()), res);

    expect(sent.status).toBe(500);
    expect(sent.body).not.toMatchObject({ success: true });
  });

  it("does not treat a duplicate-check database failure as a fresh purchase", async () => {
    neonSettledIapPurchase.mockRejectedValue(new Error("neon down"));
    const { res, sent } = fakeRes();

    await handleVerifyPurchase(verifyReq(coinPurchaseBody()), res);

    expect(sent.status).toBe(500);
    expect(neonCreditIap).not.toHaveBeenCalled();
  });
});

describe("Apple creator membership", () => {
  function membershipReq(overrides: Record<string, unknown> = {}): Request {
    return verifyReq({
      provider: "apple",
      creatorId: "creator-1",
      transactionId: "2000000222222222",
      productId: "com.elixstarlive.membership",
      ...overrides,
    });
  }

  function entitled(overrides: Record<string, unknown> = {}) {
    return {
      ok: true,
      entitled: true,
      productId: "com.elixstarlive.membership",
      originalTransactionId: "2000000222222222",
      transactionId: "2000000222222222",
      subscriptionState: "ACTIVE",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      autoRenewEnabled: true,
      environment: "Production",
      rawTransaction: applePayload({
        productId: "com.elixstarlive.membership",
        transactionId: "2000000222222222",
      }),
      ...overrides,
    };
  }

  it("answers 503 with retry when Apple verification is unavailable", async () => {
    verifyAppleSubscription.mockResolvedValue({
      ok: false,
      entitled: false,
      error: "APPLE_CREDENTIALS_NOT_CONFIGURED",
      reason: "unavailable",
    });
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(membershipReq(), res);

    expect(sent.status).toBe(503);
    expect(sent.body).toMatchObject({ code: "verification_unavailable", retry: true });
    expect(neonUpsertMembershipEntitlement).not.toHaveBeenCalled();
  });

  it("answers 400 for a subscription Apple says is not entitled", async () => {
    verifyAppleSubscription.mockResolvedValue({
      ok: false,
      entitled: false,
      error: "not_entitled",
      reason: "not_entitled",
      subscriptionState: "EXPIRED",
    });
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(membershipReq(), res);

    expect(sent.status).toBe(400);
    expect(neonUpsertMembershipEntitlement).not.toHaveBeenCalled();
  });

  it("refuses a subscription Apple bound to another account", async () => {
    verifyAppleSubscription.mockResolvedValue(
      entitled({
        rawTransaction: applePayload({
          productId: "com.elixstarlive.membership",
          appAccountToken: OTHER_TOKEN,
        }),
      }),
    );
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(membershipReq(), res);

    expect(sent.status).toBe(403);
    expect(sent.body).toMatchObject({ code: "app_account_token_mismatch" });
    expect(neonUpsertMembershipEntitlement).not.toHaveBeenCalled();
  });

  it("records the entitlement for the account that owns the subscription", async () => {
    verifyAppleSubscription.mockResolvedValue(entitled());
    neonUpsertMembershipEntitlement.mockResolvedValue({ ok: true, id: "sub-1", created: true });
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(membershipReq(), res);

    expect(sent.body).toMatchObject({ success: true, active: true });
    expect(neonUpsertMembershipEntitlement).toHaveBeenCalledTimes(1);
    expect(neonUpsertMembershipEntitlement.mock.calls[0][0]).toMatchObject({
      userId: "user-a",
      creatorId: "creator-1",
      provider: "apple",
      productId: "com.elixstarlive.membership",
    });
  });

  it("refuses a coin transaction replayed as a membership", async () => {
    neonIsIapProcessed.mockResolvedValue(true);
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(membershipReq(), res);

    expect(sent.status).toBe(400);
    expect(verifyAppleSubscription).not.toHaveBeenCalled();
    expect(neonUpsertMembershipEntitlement).not.toHaveBeenCalled();
  });

  it("does not report success when the creator revenue post failed", async () => {
    verifyAppleSubscription.mockResolvedValue(entitled());
    neonUpsertMembershipEntitlement.mockResolvedValue({ ok: true, id: "sub-1", created: true });
    autoPostSubscriptionRevenue.mockResolvedValue({ ok: false });
    const { res, sent } = fakeRes();

    await handleMembershipIAPComplete(membershipReq(), res);

    expect(sent.status).toBe(500);
    expect(sent.body).toMatchObject({ error: "MEMBERSHIP_REVENUE_POST_FAILED", retry: true });
  });
});
