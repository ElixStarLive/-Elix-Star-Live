import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * Google Play Real-time Developer Notifications.
 *
 * An RTDN message is a trigger to go and read Google's authoritative state, not
 * a fact in itself. Two answers were wrong: a message with no packageName was
 * accepted as ours, and an unreachable androidpublisher made the reconcile
 * write EXPIRED and answer 200 — revoking a paying subscriber and acking the
 * message so Pub/Sub never retried it.
 */

const verifyGoogleSubscription = vi.fn();
const neonReverseIapPurchase = vi.fn();
const neonUpdateMembershipSubscriptionState = vi.fn();
const neonUpsertMembershipEntitlement = vi.fn();
const autoPostSubscriptionRevenue = vi.fn();
const poolQuery = vi.fn();

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

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
  googlePlayPackageName: () => "com.elixstarlive.app",
  hashPurchaseToken: (token: string) => `hash:${token}`,
  verifyGoogleSubscription: (...args: unknown[]) => verifyGoogleSubscription(...args),
}));

vi.mock("../lib/appleIap", () => ({
  appleTransactionIdentityError: () => null,
  expectedAppleEnvironment: () => "Production",
  hashAppleOriginalTransactionId: (id: string) => `hash:${id}`,
  verifyAppleJwsPayload: vi.fn(),
  verifyAppleSubscription: vi.fn(),
}));

vi.mock("../lib/monetisation/storeSettlement", () => ({
  autoPostSubscriptionRevenue: (...args: unknown[]) => autoPostSubscriptionRevenue(...args),
}));

vi.mock("google-auth-library", () => ({ OAuth2Client: class {} }));

const TOKEN = "gpa.sub-token";

function rtdnReq(
  message: Record<string, unknown>,
  opts: { secret?: string } = {},
): Request {
  return {
    method: "POST",
    query: { token: opts.secret ?? "rtdn-secret" },
    headers: {},
    body: {
      message: {
        data: Buffer.from(JSON.stringify(message), "utf8").toString("base64"),
        messageId: "1",
      },
    },
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
  };
  return { res: res as unknown as Response, sent };
}

function membershipRow() {
  return {
    rowCount: 1,
    rows: [{ user_id: "user-a", creator_id: "creator-1", product_id: "elix.creator.creator-1" }],
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
    latestOrderId: "GPA.sub.1",
    linkedPurchaseTokenHash: null,
    externalAccountId: null,
    ...overrides,
  };
}

let handleGooglePlayRtdn: typeof import("./iapNotifications")["handleGooglePlayRtdn"];

beforeAll(async () => {
  const mod = await import("./iapNotifications");
  handleGooglePlayRtdn = mod.handleGooglePlayRtdn;
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_RTDN_WEBHOOK_SECRET = "rtdn-secret";
  delete process.env.GOOGLE_RTDN_OIDC_AUDIENCE;
  poolQuery.mockResolvedValue(membershipRow());
  neonReverseIapPurchase.mockResolvedValue({ ok: true, alreadyProcessed: false, reversedCoins: 500 });
  neonUpdateMembershipSubscriptionState.mockResolvedValue({ ok: true, updated: true });
  neonUpsertMembershipEntitlement.mockResolvedValue({ ok: true, id: "sub-1", created: false });
  autoPostSubscriptionRevenue.mockResolvedValue({ ok: true });
});

afterEach(() => {
  delete process.env.GOOGLE_RTDN_WEBHOOK_SECRET;
  vi.clearAllMocks();
});

describe("RTDN authentication and app identity", () => {
  it("refuses a wrong webhook secret", async () => {
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(
      rtdnReq(
        { packageName: "com.elixstarlive.app", subscriptionNotification: { purchaseToken: TOKEN } },
        { secret: "wrong-secret" },
      ),
      res,
    );

    expect(sent.status).toBe(401);
    expect(verifyGoogleSubscription).not.toHaveBeenCalled();
  });

  it("refuses to run when no auth mechanism is configured", async () => {
    delete process.env.GOOGLE_RTDN_WEBHOOK_SECRET;
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(
      rtdnReq({ packageName: "com.elixstarlive.app", voidedPurchaseNotification: { purchaseToken: TOKEN } }),
      res,
    );

    expect(sent.status).toBe(503);
    expect(neonReverseIapPurchase).not.toHaveBeenCalled();
  });

  it("refuses a message for another application", async () => {
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(
      rtdnReq({
        packageName: "com.someoneelse.app",
        voidedPurchaseNotification: { purchaseToken: TOKEN },
      }),
      res,
    );

    expect(sent.status).toBe(400);
    expect(neonReverseIapPurchase).not.toHaveBeenCalled();
  });

  it("refuses a message that does not name an application at all", async () => {
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(
      rtdnReq({ voidedPurchaseNotification: { purchaseToken: TOKEN } }),
      res,
    );

    expect(sent.status).toBe(400);
    expect(sent.body).toMatchObject({ error: "Package name mismatch" });
    expect(neonReverseIapPurchase).not.toHaveBeenCalled();
  });

  it("refuses a payload that is not a Pub/Sub envelope", async () => {
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(
      { method: "POST", query: { token: "rtdn-secret" }, headers: {}, body: { nope: 1 } } as unknown as Request,
      res,
    );

    expect(sent.status).toBe(400);
  });
});

describe("RTDN voided purchase", () => {
  const voided = {
    packageName: "com.elixstarlive.app",
    voidedPurchaseNotification: { purchaseToken: TOKEN, orderId: "GPA.1111" },
  };

  it("reverses the purchase keyed on the hashed token", async () => {
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(voided), res);

    expect(sent.status).toBe(200);
    expect(neonReverseIapPurchase).toHaveBeenCalledWith({
      provider: "google",
      providerTransactionId: expect.stringContaining("token_sha256:"),
    });
  });

  it("stays successful when the purchase is unknown to us", async () => {
    neonReverseIapPurchase.mockResolvedValue({ ok: false, error: "purchase_not_found" });
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(voided), res);

    expect(sent.status).toBe(200);
  });

  it("is idempotent across a redelivered void", async () => {
    neonReverseIapPurchase.mockResolvedValue({ ok: true, alreadyProcessed: true, reversedCoins: 0 });
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(voided), res);
    await handleGooglePlayRtdn(rtdnReq(voided), res);

    expect(sent.status).toBe(200);
    expect(neonReverseIapPurchase).toHaveBeenCalledTimes(2);
  });

  it("asks Pub/Sub to retry when the reversal failed", async () => {
    neonReverseIapPurchase.mockResolvedValue({ ok: false, error: "database_unavailable" });
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(voided), res);

    expect(sent.status).toBe(500);
    expect(sent.body).not.toMatchObject({ ok: true });
  });

  it("asks Pub/Sub to retry when the membership revoke failed", async () => {
    neonUpdateMembershipSubscriptionState.mockResolvedValue({ ok: false, error: "neon down" });
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(voided), res);

    expect(sent.status).toBe(500);
  });

  it("also revokes a membership bought with that token", async () => {
    const { res } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(voided), res);

    expect(neonUpdateMembershipSubscriptionState).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionState: "EXPIRED", autoRenewEnabled: false }),
    );
  });
});

describe("RTDN subscription lifecycle", () => {
  function subMessage(notificationType: number) {
    return {
      packageName: "com.elixstarlive.app",
      subscriptionNotification: { purchaseToken: TOKEN, notificationType },
    };
  }

  it("rebuilds the entitlement from Google on renewal", async () => {
    verifyGoogleSubscription.mockResolvedValue(entitled());
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(subMessage(2)), res);

    expect(sent.status).toBe(200);
    expect(neonUpsertMembershipEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        creatorId: "creator-1",
        provider: "google",
        subscriptionState: "ACTIVE",
      }),
    );
  });

  it("keeps a grace-period subscriber entitled", async () => {
    verifyGoogleSubscription.mockResolvedValue(entitled({ subscriptionState: "IN_GRACE_PERIOD" }));
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(subMessage(6)), res);

    expect(sent.status).toBe(200);
    expect(neonUpdateMembershipSubscriptionState).not.toHaveBeenCalled();
  });

  it("persists expiry when Google says the subscription ended", async () => {
    verifyGoogleSubscription.mockResolvedValue({
      ok: false,
      entitled: false,
      error: "not_entitled",
      reason: "not_entitled",
      subscriptionState: "EXPIRED",
    });
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(subMessage(13)), res);

    expect(sent.status).toBe(200);
    expect(neonUpdateMembershipSubscriptionState).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionState: "EXPIRED", autoRenewEnabled: false }),
    );
  });

  it("persists an account-hold state from Google", async () => {
    verifyGoogleSubscription.mockResolvedValue({
      ok: false,
      entitled: false,
      error: "not_entitled",
      reason: "not_entitled",
      subscriptionState: "ON_HOLD",
    });
    const { res } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(subMessage(5)), res);

    expect(neonUpdateMembershipSubscriptionState).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionState: "ON_HOLD" }),
    );
  });

  it("never expires a subscriber because Google was unreachable", async () => {
    verifyGoogleSubscription.mockResolvedValue({
      ok: false,
      entitled: false,
      error: "google_http_error",
      reason: "unavailable",
      detail: "status_503",
    });
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(subMessage(13)), res);

    // 500 asks Pub/Sub to redeliver; the stored entitlement is left alone.
    expect(sent.status).toBe(500);
    expect(neonUpdateMembershipSubscriptionState).not.toHaveBeenCalled();
    expect(neonUpsertMembershipEntitlement).not.toHaveBeenCalled();
  });

  it("never expires a subscriber because our Google credentials are broken", async () => {
    verifyGoogleSubscription.mockResolvedValue({
      ok: false,
      entitled: false,
      error: "google_not_configured",
      reason: "unavailable",
    });
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(subMessage(13)), res);

    expect(sent.status).toBe(500);
    expect(neonUpdateMembershipSubscriptionState).not.toHaveBeenCalled();
  });

  it("acks a token that belongs to no membership we know", async () => {
    poolQuery.mockResolvedValue({ rowCount: 0, rows: [] });
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(subMessage(4)), res);

    expect(sent.status).toBe(200);
    expect(verifyGoogleSubscription).not.toHaveBeenCalled();
  });

  it("asks Pub/Sub to retry when the entitlement write failed", async () => {
    verifyGoogleSubscription.mockResolvedValue(entitled());
    neonUpsertMembershipEntitlement.mockResolvedValue({ ok: false, error: "neon down" });
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(subMessage(2)), res);

    expect(sent.status).toBe(500);
  });

  it("converges on Google's state when notifications arrive out of order", async () => {
    // An old "renewed" message delivered after the cancellation must not
    // resurrect the subscription: reconcile always re-reads Google.
    verifyGoogleSubscription.mockResolvedValue({
      ok: false,
      entitled: false,
      error: "not_entitled",
      reason: "not_entitled",
      subscriptionState: "EXPIRED",
    });
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(rtdnReq(subMessage(2)), res);

    expect(sent.status).toBe(200);
    expect(neonUpsertMembershipEntitlement).not.toHaveBeenCalled();
    expect(neonUpdateMembershipSubscriptionState).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionState: "EXPIRED" }),
    );
  });

  it("acks a notification type it does not act on", async () => {
    const { res, sent } = fakeRes();

    await handleGooglePlayRtdn(
      rtdnReq({ packageName: "com.elixstarlive.app", testNotification: { version: "1.0" } }),
      res,
    );

    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ ok: true, ignored: true });
  });
});
