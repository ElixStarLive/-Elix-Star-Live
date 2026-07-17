import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CREATOR_MEMBERSHIP_BASE_PLAN_ID,
  creatorMembershipProductId,
  hashPurchaseToken,
  loadMembershipPriceConfig,
  parseGoogleSubscriptionPayload,
  parseMoneyAmount,
} from "./googlePlaySubscriptions";

const NOW = Date.parse("2026-07-17T12:00:00.000Z");
const FUTURE = "2026-08-17T12:00:00.000Z";
const PAST = "2026-06-17T12:00:00.000Z";

const PRODUCT_ID = creatorMembershipProductId("creator-123");

function payload(overrides: Record<string, unknown> = {}, lineItem: Record<string, unknown> = {}) {
  return {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    latestOrderId: "GPA.1234-5678-9012-34567",
    lineItems: [
      {
        productId: PRODUCT_ID,
        expiryTime: FUTURE,
        autoRenewingPlan: { autoRenewEnabled: true },
        offerDetails: { basePlanId: CREATOR_MEMBERSHIP_BASE_PLAN_ID },
        ...lineItem,
      },
    ],
    ...overrides,
  };
}

describe("creatorMembershipProductId", () => {
  it("is deterministic: elix.creator. + first 24 lowercase hex of sha256(creatorId)", () => {
    const expectedHex = createHash("sha256").update("creator-123").digest("hex").slice(0, 24);
    expect(creatorMembershipProductId("creator-123")).toBe(`elix.creator.${expectedHex}`);
    expect(creatorMembershipProductId("creator-123")).toBe(creatorMembershipProductId("creator-123"));
    expect(creatorMembershipProductId("creator-123")).toMatch(/^elix\.creator\.[0-9a-f]{24}$/);
  });

  it("differs per creator", () => {
    expect(creatorMembershipProductId("creator-a")).not.toBe(creatorMembershipProductId("creator-b"));
  });
});

describe("parseMoneyAmount / loadMembershipPriceConfig", () => {
  it("splits major/minor units for Play Money", () => {
    expect(parseMoneyAmount("4.99", "GBP")).toEqual({
      currencyCode: "GBP",
      units: "4",
      nanos: 990_000_000,
    });
    expect(parseMoneyAmount("9", "USD")).toEqual({
      currencyCode: "USD",
      units: "9",
      nanos: 0,
    });
  });

  it("defaults to GBP/US monthly regions with 4.99 pricing", () => {
    const cfg = loadMembershipPriceConfig();
    expect(cfg.title).toBeTruthy();
    expect(cfg.regions.some((r) => r.regionCode === "GB")).toBe(true);
    expect(cfg.otherUsd.currencyCode).toBe("USD");
    expect(cfg.otherEur.currencyCode).toBe("EUR");
    expect(CREATOR_MEMBERSHIP_BASE_PLAN_ID).toBe("monthly");
  });
});

describe("parseGoogleSubscriptionPayload", () => {
  it("accepts an ACTIVE subscription and captures all fields", () => {
    const linkedToken = "linked-token-abc";
    const r = parseGoogleSubscriptionPayload(
      payload({
        linkedPurchaseToken: linkedToken,
        externalAccountIdentifiers: { obfuscatedExternalAccountId: "user-42" },
      }),
      PRODUCT_ID,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entitled).toBe(true);
    expect(r.productId).toBe(PRODUCT_ID);
    expect(r.basePlanId).toBe("monthly");
    expect(r.subscriptionState).toBe("ACTIVE");
    expect(r.expiresAt).toBe(FUTURE);
    expect(r.autoRenewEnabled).toBe(true);
    expect(r.acknowledgementState).toBe("ACKNOWLEDGED");
    expect(r.latestOrderId).toBe("GPA.1234-5678-9012-34567");
    expect(r.linkedPurchaseTokenHash).toBe(hashPurchaseToken(linkedToken));
    expect(r.externalAccountId).toBe("user-42");
  });

  it("accepts IN_GRACE_PERIOD with future expiry", () => {
    const r = parseGoogleSubscriptionPayload(
      payload({ subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" }),
      PRODUCT_ID,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.subscriptionState).toBe("IN_GRACE_PERIOD");
  });

  it("accepts CANCELED only while expiry is in the future", () => {
    const stillPaid = parseGoogleSubscriptionPayload(
      payload({ subscriptionState: "SUBSCRIPTION_STATE_CANCELED" }),
      PRODUCT_ID,
      NOW,
    );
    expect(stillPaid.ok).toBe(true);

    const lapsed = parseGoogleSubscriptionPayload(
      payload({ subscriptionState: "SUBSCRIPTION_STATE_CANCELED" }, { expiryTime: PAST }),
      PRODUCT_ID,
      NOW,
    );
    expect(lapsed.ok).toBe(false);
    if (!lapsed.ok) expect(lapsed.error).toBe("not_entitled");
  });

  it("rejects EXPIRED, ON_HOLD, and PAUSED states", () => {
    for (const state of [
      "SUBSCRIPTION_STATE_EXPIRED",
      "SUBSCRIPTION_STATE_ON_HOLD",
      "SUBSCRIPTION_STATE_PAUSED",
      "SUBSCRIPTION_STATE_PENDING",
    ]) {
      const r = parseGoogleSubscriptionPayload(payload({ subscriptionState: state }), PRODUCT_ID, NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("not_entitled");
    }
  });

  it("rejects an ACTIVE state whose expiry is already past (fail closed)", () => {
    const r = parseGoogleSubscriptionPayload(payload({}, { expiryTime: PAST }), PRODUCT_ID, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not_entitled");
  });

  it("rejects when the expected product is not among lineItems", () => {
    const r = parseGoogleSubscriptionPayload(payload(), creatorMembershipProductId("other-creator"), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("product_mismatch");
  });

  it("rejects malformed payloads", () => {
    for (const bad of [null, undefined, "str", 42, [], { lineItems: "nope" }]) {
      const r = parseGoogleSubscriptionPayload(bad, PRODUCT_ID, NOW);
      expect(r.ok).toBe(false);
    }
  });

  it("rejects a line item with a missing or unparseable expiry", () => {
    const missing = parseGoogleSubscriptionPayload(
      payload({}, { expiryTime: undefined }),
      PRODUCT_ID,
      NOW,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBe("missing_expiry");

    const garbage = parseGoogleSubscriptionPayload(
      payload({}, { expiryTime: "not-a-date" }),
      PRODUCT_ID,
      NOW,
    );
    expect(garbage.ok).toBe(false);
    if (!garbage.ok) expect(garbage.error).toBe("missing_expiry");
  });

  it("defaults optional fields safely when absent", () => {
    const r = parseGoogleSubscriptionPayload(
      {
        subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
        lineItems: [{ productId: PRODUCT_ID, expiryTime: FUTURE }],
      },
      PRODUCT_ID,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.basePlanId).toBeNull();
    expect(r.autoRenewEnabled).toBe(false);
    expect(r.acknowledgementState).toBeNull();
    expect(r.latestOrderId).toBeNull();
    expect(r.linkedPurchaseTokenHash).toBeNull();
    expect(r.externalAccountId).toBeNull();
  });
});
