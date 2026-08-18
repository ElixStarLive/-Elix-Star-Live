import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * The IAP verify limiter used to fall back to a per-process Map whenever Valkey
 * threw. With more than one server instance that silently multiplies the real
 * hourly limit by the instance count on a money path, so a Valkey outage looked
 * like a looser limit instead of a failure. Production must now fail closed.
 */

const rateCheck = vi.fn();
const velocity = vi.fn();

vi.mock("../lib/valkey", () => ({
  isValkeyConfigured: () => true,
  valkeyRateCheck: (...args: unknown[]) => rateCheck(...args),
}));

vi.mock("./auth", () => ({
  getTokenFromRequest: () => "token",
  verifyAuthToken: () => ({ sub: "u1" }),
}));

vi.mock("../lib/fraud", () => ({
  assertIapVerifyVelocityOk: (...args: unknown[]) => velocity(...args),
}));

vi.mock("../lib/postgres", () => ({
  getPool: () => null,
  dbLoadCoinMap: vi.fn(),
}));

function fakeReq(): Request {
  return { method: "POST", body: {}, headers: {} } as unknown as Request;
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

async function loadHandler(nodeEnv: string) {
  process.env.NODE_ENV = nodeEnv;
  vi.resetModules();
  const mod = await import("./misc");
  return mod.handleVerifyPurchase;
}

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  rateCheck.mockReset();
  velocity.mockReset();
  velocity.mockResolvedValue({ ok: true });
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  vi.resetModules();
});

describe("IAP verify rate limit when Valkey fails", () => {
  it("rejects in production instead of using a per-process window", async () => {
    rateCheck.mockRejectedValue(new Error("valkey down"));
    const handler = await loadHandler("production");
    const { res, sent } = fakeRes();

    await handler(fakeReq(), res);

    expect(sent.status).toBe(429);
    // Nothing past the limiter may run: an unknown limiter result must not be
    // treated as headroom on the purchase path.
    expect(velocity).not.toHaveBeenCalled();
  });

  it("keeps rejecting on every retry while Valkey is down", async () => {
    rateCheck.mockRejectedValue(new Error("valkey down"));
    const handler = await loadHandler("production");

    for (let i = 0; i < 3; i++) {
      const { res, sent } = fakeRes();
      await handler(fakeReq(), res);
      expect(sent.status).toBe(429);
    }
  });

  it("still allows the request in development via the local window", async () => {
    rateCheck.mockRejectedValue(new Error("valkey down"));
    const handler = await loadHandler("development");
    const { res, sent } = fakeRes();

    await handler(fakeReq(), res);

    // 400 for the empty body proves the limiter let it through rather than 429.
    expect(sent.status).toBe(400);
    expect(velocity).toHaveBeenCalled();
  });

  it("passes a healthy Valkey verdict straight through", async () => {
    rateCheck.mockResolvedValue(true);
    const handler = await loadHandler("production");
    const { res, sent } = fakeRes();

    await handler(fakeReq(), res);

    expect(sent.status).toBe(400);
  });

  it("honours a real Valkey rejection in production", async () => {
    rateCheck.mockResolvedValue(false);
    const handler = await loadHandler("production");
    const { res, sent } = fakeRes();

    await handler(fakeReq(), res);

    expect(sent.status).toBe(429);
    expect(velocity).not.toHaveBeenCalled();
  });
});
