import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * App Store Server Notifications V2.
 *
 * Apple redelivers notifications, so every handler must be idempotent, and a
 * notification that cannot be applied must fail loudly enough for Apple to retry
 * rather than be swallowed as handled. Two things were wrong: nothing checked that
 * the notified transaction belonged to this app and this Apple environment before
 * reversing money, and a subscription reconcile that could not reach Apple
 * downgraded a paying subscriber to EXPIRED.
 */

const verifyAppleJwsPayload = vi.fn();
const verifyAppleSubscription = vi.fn();
const neonReverseIapPurchase = vi.fn();
const neonUpdateMembershipSubscriptionState = vi.fn();
const neonUpsertMembershipEntitlement = vi.fn();
const poolQuery = vi.fn();

vi.mock("../lib/appleIap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/appleIap")>();
  return {
    ...actual,
    verifyAppleJwsPayload: (...args: unknown[]) => verifyAppleJwsPayload(...args),
    verifyAppleSubscription: (...args: unknown[]) => verifyAppleSubscription(...args),
  };
});

vi.mock("../lib/postgres", () => ({
  getPool: () => ({ query: (...args: unknown[]) => poolQuery(...args) }),
}));

vi.mock("../lib/walletNeon", () => ({
  neonReverseIapPurchase: (...args: unknown[]) => neonReverseIapPurchase(...args),
  neonUpdateMembershipSubscriptionState: (...args: unknown[]) =>
    neonUpdateMembershipSubscriptionState(...args),
  neonUpsertMembershipEntitlement: (...args: unknown[]) =>
    neonUpsertMembershipEntitlement(...args),
}));

vi.mock("../lib/googlePlaySubscriptions", () => ({
  hashPurchaseToken: (t: string) => `hash:${t}`,
  verifyGoogleSubscription: vi.fn(),
}));

vi.mock("../lib/monetisation/storeSettlement", () => ({
  autoPostSubscriptionRevenue: vi.fn(async () => ({ ok: true })),
}));

const SECRET = "apple-notify-secret";

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "2000000111111111",
    originalTransactionId: "2000000111111111",
    productId: "coins500",
    bundleId: "com.elixstarlive.app",
    environment: "Production",
    ...overrides,
  };
}

function notification(notificationType: string, tx: Record<string, unknown> | null) {
  // The outer envelope and the transaction info are two separate JWS values; the
  // mocked verifier answers each in call order.
  verifyAppleJwsPayload.mockImplementation(async (token: string) => {
    if (token === "outer") {
      return {
        notificationType,
        data: tx ? { signedTransactionInfo: "inner" } : {},
      };
    }
    if (token === "inner") return tx;
    return null;
  });
  return JSON.stringify({ signedPayload: "outer" });
}

function fakeReq(body: string, secret: string = SECRET): Request {
  return {
    method: "POST",
    query: {},
    headers: { "x-elix-webhook-secret": secret },
    body,
  } as unknown as Request;
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

let handleAppleIapNotification: typeof import("./iapNotifications")["handleAppleIapNotification"];
const savedEnv = { ...process.env };

beforeAll(async () => {
  const mod = await import("./iapNotifications");
  handleAppleIapNotification = mod.handleAppleIapNotification;
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APPLE_IAP_NOTIFICATION_SECRET = SECRET;
  process.env.APPLE_BUNDLE_ID = "com.elixstarlive.app";
  delete process.env.APPLE_IAP_ENVIRONMENT;
  neonReverseIapPurchase.mockResolvedValue({
    ok: true,
    alreadyProcessed: false,
    reversedCoins: 500,
  });
  neonUpdateMembershipSubscriptionState.mockResolvedValue({ ok: true, updated: true });
  poolQuery.mockResolvedValue({ rowCount: 0, rows: [] });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe("Apple notification authentication", () => {
  it("refuses to run when no notification secret is configured", async () => {
    delete process.env.APPLE_IAP_NOTIFICATION_SECRET;
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(fakeReq(notification("REFUND", transaction())), res);

    expect(sent.status).toBe(503);
    expect(neonReverseIapPurchase).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(
      fakeReq(notification("REFUND", transaction()), "not-the-secret"),
      res,
    );

    expect(sent.status).toBe(401);
    expect(neonReverseIapPurchase).not.toHaveBeenCalled();
  });

  it("rejects a payload that is not signed by Apple", async () => {
    verifyAppleJwsPayload.mockResolvedValue(null);
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(fakeReq(JSON.stringify({ signedPayload: "forged" })), res);

    expect(sent.status).toBe(400);
    expect(neonReverseIapPurchase).not.toHaveBeenCalled();
  });
});

describe("Apple notification app and environment identity", () => {
  it("refuses to reverse production money on a sandbox notification", async () => {
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(
      fakeReq(notification("REFUND", transaction({ environment: "Sandbox" }))),
      res,
    );

    expect(sent.status).toBe(400);
    expect(sent.body).toMatchObject({ error: "apple-transaction-environment-mismatch" });
    expect(neonReverseIapPurchase).not.toHaveBeenCalled();
  });

  it("refuses a notification about another app's transaction", async () => {
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(
      fakeReq(notification("REFUND", transaction({ bundleId: "com.someoneelse.app" }))),
      res,
    );

    expect(sent.status).toBe(400);
    expect(neonReverseIapPurchase).not.toHaveBeenCalled();
  });

  it("accepts a sandbox notification only on a sandbox server", async () => {
    process.env.APPLE_IAP_ENVIRONMENT = "Sandbox";
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(
      fakeReq(notification("REFUND", transaction({ environment: "Sandbox" }))),
      res,
    );

    expect(sent.status).toBe(200);
    expect(neonReverseIapPurchase).toHaveBeenCalledTimes(1);
  });
});

describe("Apple refund and revoke", () => {
  it("reverses the purchase once", async () => {
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(fakeReq(notification("REFUND", transaction())), res);

    expect(sent.status).toBe(200);
    expect(neonReverseIapPurchase).toHaveBeenCalledWith({
      provider: "apple",
      providerTransactionId: "2000000111111111",
    });
  });

  it("stays successful and adds nothing when Apple redelivers the same refund", async () => {
    neonReverseIapPurchase.mockResolvedValue({
      ok: true,
      alreadyProcessed: true,
      reversedCoins: 0,
    });

    for (let i = 0; i < 3; i++) {
      const { res, sent } = fakeRes();
      await handleAppleIapNotification(fakeReq(notification("REFUND", transaction())), res);
      expect(sent.status).toBe(200);
    }

    expect(neonReverseIapPurchase).toHaveBeenCalledTimes(3);
  });

  it("answers 200 for a refund of a transaction this server never credited", async () => {
    neonReverseIapPurchase.mockResolvedValue({ ok: false, error: "purchase_not_found" });
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(fakeReq(notification("REVOKE", transaction())), res);

    expect(sent.status).toBe(200);
  });

  it("asks Apple to retry when the reversal itself failed", async () => {
    neonReverseIapPurchase.mockResolvedValue({ ok: false, error: "gbp_reverse_failed" });
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(fakeReq(notification("REFUND", transaction())), res);

    expect(sent.status).toBe(500);
    expect(sent.body).toMatchObject({ error: "reverse_failed" });
  });

  it("does not re-credit coins when a refund is reversed", async () => {
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(
      fakeReq(notification("REFUND_REVERSED", transaction())),
      res,
    );

    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ ignored: "refund_reversed" });
    expect(neonReverseIapPurchase).not.toHaveBeenCalled();
  });
});

describe("Apple subscription lifecycle notifications", () => {
  beforeEach(() => {
    poolQuery.mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          user_id: "user-a",
          creator_id: "creator-1",
          product_id: "com.elixstarlive.membership",
        },
      ],
    });
  });

  it("keeps a paying subscriber entitled when Apple cannot be reached", async () => {
    verifyAppleSubscription.mockResolvedValue({
      ok: false,
      entitled: false,
      error: "apple-api-503: down",
      reason: "unavailable",
    });
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(
      fakeReq(notification("DID_RENEW", transaction({ productId: "com.elixstarlive.membership" }))),
      res,
    );

    // 500 so Apple redelivers, and the stored entitlement is left untouched.
    expect(sent.status).toBe(500);
    expect(neonUpdateMembershipSubscriptionState).not.toHaveBeenCalled();
    expect(neonUpsertMembershipEntitlement).not.toHaveBeenCalled();
  });

  it("rebuilds the entitlement from Apple on renewal", async () => {
    verifyAppleSubscription.mockResolvedValue({
      ok: true,
      entitled: true,
      productId: "com.elixstarlive.membership",
      originalTransactionId: "2000000111111111",
      transactionId: "2000000111111112",
      subscriptionState: "ACTIVE",
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      autoRenewEnabled: true,
      rawTransaction: transaction({ productId: "com.elixstarlive.membership" }),
    });
    neonUpsertMembershipEntitlement.mockResolvedValue({ ok: true, id: "sub-1", created: false });
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(
      fakeReq(notification("DID_RENEW", transaction({ productId: "com.elixstarlive.membership" }))),
      res,
    );

    expect(sent.status).toBe(200);
    expect(neonUpsertMembershipEntitlement.mock.calls[0][0]).toMatchObject({
      userId: "user-a",
      creatorId: "creator-1",
      subscriptionState: "ACTIVE",
    });
  });

  it("persists the expired state Apple reports", async () => {
    verifyAppleSubscription.mockResolvedValue({
      ok: false,
      entitled: false,
      error: "not_entitled",
      reason: "not_entitled",
      subscriptionState: "EXPIRED",
    });
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(
      fakeReq(notification("EXPIRED", transaction({ productId: "com.elixstarlive.membership" }))),
      res,
    );

    expect(sent.status).toBe(200);
    expect(neonUpdateMembershipSubscriptionState).toHaveBeenCalledWith({
      purchaseTokenHash: expect.any(String),
      subscriptionState: "EXPIRED",
      expiresAt: null,
      autoRenewEnabled: false,
    });
  });

  it("acknowledges notification types this product does not act on", async () => {
    const { res, sent } = fakeRes();

    await handleAppleIapNotification(
      fakeReq(notification("CONSUMPTION_REQUEST", transaction())),
      res,
    );

    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ ignored: true });
    expect(neonReverseIapPurchase).not.toHaveBeenCalled();
  });
});
