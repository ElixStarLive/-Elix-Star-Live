import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Google Play purchase verification contract.
 *
 * The dangerous answers here are the ambiguous ones. "Google said no" and
 * "Google never answered" used to look identical to the caller, so an
 * androidpublisher outage told a charged buyer their receipt was invalid — a
 * permanent refusal for a token Play would auto-refund three days later. The
 * other trap is evidence that is real but free: a licence-test, promo or
 * rewarded purchase is a genuine Play purchase that nobody paid for.
 */

const getAccessToken = vi.fn();

vi.mock("google-auth-library", () => ({
  JWT: class {
    getAccessToken = getAccessToken;
  },
  OAuth2Client: class {},
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./postgres", () => ({ getPool: () => null }));

const fetchMock = vi.fn();

function googleReplies(body: Record<string, unknown>, status = 200) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function googleFails(status: number, text = "boom") {
  fetchMock.mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text,
  });
}

/** A normal paid one-time purchase of a coin pack. */
function paidPurchase(overrides: Record<string, unknown> = {}) {
  return {
    productId: "coins500",
    purchaseState: 0,
    consumptionState: 0,
    orderId: "GPA.1111-2222-3333-44444",
    purchaseTimeMillis: "1750000000000",
    acknowledgementState: 0,
    quantity: 1,
    ...overrides,
  };
}

let verifyGooglePlayProductPurchase: typeof import("./googlePlaySubscriptions")["verifyGooglePlayProductPurchase"];
let verifyGoogleSubscription: typeof import("./googlePlaySubscriptions")["verifyGoogleSubscription"];

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  getAccessToken.mockReset();
  getAccessToken.mockResolvedValue({ token: "ya29.access" });
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "sa@elix.iam.gserviceaccount.com",
    private_key: "key",
  });
  process.env.GOOGLE_PLAY_PACKAGE_NAME = "com.elixstarlive.app";
  const mod = await import("./googlePlaySubscriptions");
  verifyGooglePlayProductPurchase = mod.verifyGooglePlayProductPurchase;
  verifyGoogleSubscription = mod.verifyGoogleSubscription;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_PLAY_PACKAGE_NAME;
});

describe("Google one-time purchase — no verdict must stay retryable", () => {
  it("reports unavailable, not invalid, when androidpublisher is down", async () => {
    googleFails(503, "backend error");

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(false);
    if (result.valid !== false) return;
    expect(result.reason).toBe("unavailable");
  });

  it("reports unavailable when Play throttles us", async () => {
    googleFails(429, "rate limited");

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(false);
    if (result.valid !== false) return;
    expect(result.reason).toBe("unavailable");
  });

  it("reports unavailable when our own service account is refused", async () => {
    googleFails(401, "invalid credentials");

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(false);
    if (result.valid !== false) return;
    expect(result.reason).toBe("unavailable");
  });

  it("reports unavailable when the network call never completes", async () => {
    fetchMock.mockRejectedValue(new Error("The operation was aborted due to timeout"));

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(false);
    if (result.valid !== false) return;
    expect(result.reason).toBe("unavailable");
  });

  it("reports unavailable when no service account is configured", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(false);
    if (result.valid !== false) return;
    expect(result.reason).toBe("unavailable");
    expect(result.detail).toContain("GOOGLE_CREDENTIALS_NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports unavailable when the access token cannot be minted", async () => {
    getAccessToken.mockResolvedValue({ token: null });

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(false);
    if (result.valid !== false) return;
    expect(result.reason).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports invalid when Google rejects the token itself", async () => {
    googleFails(404, "purchaseTokenNotFound");

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(false);
    if (result.valid !== false) return;
    expect(result.reason).toBe("invalid");
  });
});

describe("Google one-time purchase — only a completed purchase is money", () => {
  it("refuses a pending purchase", async () => {
    googleReplies(paidPurchase({ purchaseState: 2 }));

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(false);
    if (result.valid !== false) return;
    expect(result.reason).toBe("invalid");
    expect(result.detail).toContain("google-purchase-state-2");
  });

  it("refuses a cancelled purchase", async () => {
    googleReplies(paidPurchase({ purchaseState: 1 }));

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(false);
    if (result.valid !== false) return;
    expect(result.detail).toContain("google-purchase-state-1");
  });

  it("refuses a purchase Google has already refunded", async () => {
    googleReplies(paidPurchase({ quantity: 1, refundableQuantity: 0 }));

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(false);
    if (result.valid !== false) return;
    expect(result.detail).toBe("google-purchase-refunded");
  });

  it("accepts a purchase that still has refundable quantity", async () => {
    googleReplies(paidPurchase({ quantity: 1, refundableQuantity: 1 }));

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(true);
  });

  it("accepts an already-consumed token so a retry can still settle once", async () => {
    googleReplies(paidPurchase({ consumptionState: 1 }));

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(true);
  });

  it("refuses a payload that is not a purchase object", async () => {
    googleReplies([] as unknown as Record<string, unknown>);

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(false);
    if (result.valid !== false) return;
    expect(result.reason).toBe("invalid");
  });

  it("refuses a missing product or token without calling Google", async () => {
    const noProduct = await verifyGooglePlayProductPurchase({
      productId: "",
      purchaseToken: "tok",
    });
    const noToken = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "   ",
    });

    expect(noProduct.valid).toBe(false);
    expect(noToken.valid).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Google one-time purchase — quantity and purchase type come from Google", () => {
  it("reports the verified quantity, not an assumed single unit", async () => {
    googleReplies(paidPurchase({ quantity: 3 }));

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(true);
    if (result.valid !== true) return;
    expect(result.quantity).toBe(3);
  });

  it("defaults to one unit when Google omits quantity", async () => {
    const payload = paidPurchase();
    delete (payload as Record<string, unknown>).quantity;
    googleReplies(payload);

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(true);
    if (result.valid !== true) return;
    expect(result.quantity).toBe(1);
  });

  it("surfaces licence-test, promo and rewarded purchases as such", async () => {
    for (const purchaseType of [0, 1, 2]) {
      googleReplies(paidPurchase({ purchaseType }));
      const result = await verifyGooglePlayProductPurchase({
        productId: "coins500",
        purchaseToken: "tok",
      });
      expect(result.valid).toBe(true);
      if (result.valid !== true) continue;
      expect(result.purchaseType).toBe(purchaseType);
    }
  });

  it("leaves purchaseType null for a normal paid purchase", async () => {
    googleReplies(paidPurchase());

    const result = await verifyGooglePlayProductPurchase({
      productId: "coins500",
      purchaseToken: "tok",
    });

    expect(result.valid).toBe(true);
    if (result.valid !== true) return;
    expect(result.purchaseType).toBeNull();
    expect(result.orderId).toBe("GPA.1111-2222-3333-44444");
  });

  it("asks Google inside this app's package only", async () => {
    googleReplies(paidPurchase());

    await verifyGooglePlayProductPurchase({ productId: "coins500", purchaseToken: "tok" });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("/applications/com.elixstarlive.app/");
    expect(url).toContain("/purchases/products/coins500/tokens/tok");
  });
});

describe("Google subscription verification classifies its failures", () => {
  const SUB_PRODUCT = "elix.creator.abc123";

  function activeSubscription() {
    return {
      subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
      acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
      latestOrderId: "GPA.9999",
      lineItems: [
        {
          productId: SUB_PRODUCT,
          expiryTime: new Date(Date.now() + 86_400_000).toISOString(),
          autoRenewingPlan: { autoRenewEnabled: true },
          offerDetails: { basePlanId: "monthly" },
        },
      ],
    };
  }

  it("marks a 5xx as unavailable so the caller can retry", async () => {
    googleFails(500, "internal");

    const result = await verifyGoogleSubscription("tok", SUB_PRODUCT);

    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe("unavailable");
  });

  it("marks missing credentials as unavailable", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    const result = await verifyGoogleSubscription("tok", SUB_PRODUCT);

    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe("unavailable");
    expect(result.error).toBe("google_not_configured");
  });

  it("marks a 404 as invalid", async () => {
    googleFails(404, "not found");

    const result = await verifyGoogleSubscription("tok", SUB_PRODUCT);

    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe("invalid");
  });

  it("marks an expired subscription as not entitled, not unavailable", async () => {
    googleReplies({
      subscriptionState: "SUBSCRIPTION_STATE_EXPIRED",
      lineItems: [
        {
          productId: SUB_PRODUCT,
          expiryTime: new Date(Date.now() - 1000).toISOString(),
        },
      ],
    });

    const result = await verifyGoogleSubscription("tok", SUB_PRODUCT);

    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe("not_entitled");
    expect(result.subscriptionState).toBe("EXPIRED");
  });

  it("marks another creator's product as invalid", async () => {
    googleReplies(activeSubscription());

    const result = await verifyGoogleSubscription("tok", "elix.creator.someoneelse");

    expect(result.ok).toBe(false);
    if (result.ok !== false) return;
    expect(result.reason).toBe("invalid");
    expect(result.error).toBe("product_mismatch");
  });

  it("entitles a live subscription", async () => {
    googleReplies(activeSubscription());

    const result = await verifyGoogleSubscription("tok", SUB_PRODUCT);

    expect(result.ok).toBe(true);
    if (result.ok !== true) return;
    expect(result.entitled).toBe(true);
    expect(result.basePlanId).toBe("monthly");
    expect(result.subscriptionState).toBe("ACTIVE");
  });
});
