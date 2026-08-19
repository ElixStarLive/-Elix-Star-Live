import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * Both purchase limiters are consumed before verification runs, so every attempt
 * that died on an Apple or Google outage still spent a slot. Twenty of those in
 * an hour locked a buyer out of purchasing for the rest of the window — the 503
 * told them to retry while the limiter refused to let them. A verdict we never
 * reached is our outage, not buyer velocity, so the slot goes back.
 */

const rateConsume = vi.fn();
const rateRelease = vi.fn();
const velocityRelease = vi.fn();
const fetchAppleTransaction = vi.fn();
const verifyGooglePlayProductPurchase = vi.fn();

vi.mock("../lib/valkey", () => ({
  isValkeyConfigured: () => true,
  valkeyRateConsume: (...args: unknown[]) => rateConsume(...args),
  valkeyRateRelease: (...args: unknown[]) => rateRelease(...args),
}));

vi.mock("./auth", () => ({
  getTokenFromRequest: () => "token",
  verifyAuthToken: () => ({ sub: "u1" }),
}));

vi.mock("../lib/fraud", () => ({
  assertIapVerifyVelocityOk: async () => ({ ok: true }),
  releaseIapVerifyVelocity: (...args: unknown[]) => velocityRelease(...args),
}));

vi.mock("../lib/postgres", () => ({
  getPool: () => ({ query: vi.fn() }),
  dbLoadCoinMap: async () => ({}),
}));

vi.mock("../lib/walletNeon", () => ({
  neonSettledIapPurchase: async () => null,
  neonIsIapProcessed: async () => false,
  neonCreditIap: vi.fn(),
  neonGetCoinBalance: async () => 0,
  neonGetActiveMembershipEntitlement: async () => null,
  neonInsertPromotePurchase: vi.fn(),
  neonIsPromoteProcessed: async () => false,
  neonUpsertMembershipEntitlement: vi.fn(),
}));

vi.mock("../lib/appleIap", () => ({
  APPLE_CREATOR_MEMBERSHIP_PRODUCT_ID: "com.elixstarlive.membership",
  ensureAppleCreatorMembershipProduct: vi.fn(),
  fetchAppleTransaction: (...args: unknown[]) => fetchAppleTransaction(...args),
  hashAppleOriginalTransactionId: (id: string) => `hash:${id}`,
  markAppleCreatorMembershipActive: vi.fn(),
  verifyAppleSubscription: vi.fn(),
}));

vi.mock("../lib/googlePlaySubscriptions", () => ({
  CREATOR_MEMBERSHIP_BASE_PLAN_ID: "monthly",
  acknowledgeGoogleSubscription: vi.fn(),
  creatorMembershipProductId: (creatorId: string) => `elix.creator.${creatorId}`,
  ensureCreatorMembershipProduct: vi.fn(),
  hashPurchaseToken: (token: string) => `hash:${token}`,
  verifyGooglePlayProductPurchase: (...args: unknown[]) =>
    verifyGooglePlayProductPurchase(...args),
  verifyGoogleSubscription: vi.fn(),
}));

vi.mock("../lib/notifications", () => ({ insertNotification: vi.fn() }));

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

const originalNodeEnv = process.env.NODE_ENV;

async function loadHandler() {
  process.env.NODE_ENV = "production";
  vi.resetModules();
  const mod = await import("./misc");
  return mod.handleVerifyPurchase;
}

beforeAll(async () => {
  await import("./misc");
}, 120_000);

beforeEach(() => {
  rateConsume.mockReset();
  rateConsume.mockResolvedValue({ allowed: true, member: "slot-1" });
  rateRelease.mockReset();
  velocityRelease.mockReset();
  fetchAppleTransaction.mockReset();
  verifyGooglePlayProductPurchase.mockReset();
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  vi.resetModules();
});

function appleReq(): Request {
  return {
    method: "POST",
    headers: {},
    body: {
      userId: "u1",
      packageId: "coins100",
      provider: "apple",
      transactionId: "2000000000000001",
    },
  } as unknown as Request;
}

function googleReq(): Request {
  return {
    method: "POST",
    headers: {},
    body: {
      userId: "u1",
      packageId: "coins500a",
      provider: "google",
      transactionId: "GPA.1234",
      receipt: "purchase-token",
    },
  } as unknown as Request;
}

describe("purchase limiter when store verification is unavailable", () => {
  it("returns the slot after an Apple outage so the advised retry is affordable", async () => {
    fetchAppleTransaction.mockResolvedValue({
      valid: false,
      reason: "unavailable",
      detail: "apple-api-401",
    });
    const handler = await loadHandler();
    const { res, sent } = fakeRes();

    await handler(appleReq(), res);

    expect(sent.status).toBe(503);
    expect(rateRelease).toHaveBeenCalledWith("rl:u1:iap:verify", "slot-1");
    expect(velocityRelease).toHaveBeenCalledWith("u1");
  });

  it("returns the slot after a Google outage too", async () => {
    verifyGooglePlayProductPurchase.mockResolvedValue({
      valid: false,
      reason: "unavailable",
      detail: "play-api-503",
    });
    const handler = await loadHandler();
    const { res, sent } = fakeRes();

    await handler(googleReq(), res);

    expect(sent.status).toBe(503);
    expect(rateRelease).toHaveBeenCalledWith("rl:u1:iap:verify", "slot-1");
    expect(velocityRelease).toHaveBeenCalledWith("u1");
  });

  it("keeps charging the slot when Apple gives a real verdict", async () => {
    // A rejected transaction is the buyer's attempt and must still be metered,
    // otherwise the limiter stops bounding replay attempts entirely.
    fetchAppleTransaction.mockResolvedValue({
      valid: false,
      reason: "invalid",
      detail: "apple-transaction-environment-mismatch",
    });
    const handler = await loadHandler();
    const { res } = fakeRes();

    await handler(appleReq(), res);

    expect(rateRelease).not.toHaveBeenCalled();
    expect(velocityRelease).not.toHaveBeenCalled();
  });
});
