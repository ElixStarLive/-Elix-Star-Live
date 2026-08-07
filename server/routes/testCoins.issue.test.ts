import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const authMocks = vi.hoisted(() => ({
  getTokenFromRequest: vi.fn(),
  verifyAuthToken: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock("./auth", () => authMocks);
vi.mock("../lib/postgres", () => ({
  getPool: () => dbMocks.getPool(),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  handleAuthorizeTestCoins,
  handleMintTestCoins,
} from "./testCoins";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function mockRes() {
  const status = vi.fn();
  const json = vi.fn();
  status.mockReturnValue({ json });
  return { value: { status, json } as unknown as Response, status, json };
}

function mockReq(body: Record<string, unknown> = {}, ip = "127.0.0.1"): Request {
  return {
    body,
    headers: {},
    socket: { remoteAddress: ip },
  } as unknown as Request;
}

describe("test-coin ISSUE access control", () => {
  const PASSWORD = "unit-test-issue-password-only";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TEST_COINS_ISSUE_PASSWORD = PASSWORD;
    delete process.env.TEST_COINS_ISSUE_PASSWORD_HASH;
    authMocks.getTokenFromRequest.mockReturnValue("tok");
    dbMocks.getPool.mockReturnValue({ query: dbMocks.query });
    dbMocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("is_admin")) {
        const userId = String(params?.[0] || "");
        return { rows: [{ is_admin: userId.startsWith("admin-") }] };
      }
      // audit CREATE/INSERT — ignore
      return { rows: [] };
    });
  });

  it("unauthenticated mint → 401", async () => {
    authMocks.getTokenFromRequest.mockReturnValue(null);
    const res = mockRes();
    await handleMintTestCoins(mockReq({ password: PASSWORD, amount: 100 }), res.value);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("normal user with correct password → 403 FORBIDDEN", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-normal-1" });
    const res = mockRes();
    await handleMintTestCoins(
      mockReq({ password: PASSWORD, amount: 5000 }),
      res.value,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "FORBIDDEN" });
  });

  it("normal user authorize → 403 FORBIDDEN", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-normal-2" });
    const res = mockRes();
    await handleAuthorizeTestCoins(mockReq({ password: PASSWORD }), res.value);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "FORBIDDEN" });
  });

  it("admin with wrong password → 403 FORBIDDEN", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "admin-wrong-pwd" });
    const res = mockRes();
    await handleMintTestCoins(
      mockReq({ password: "not-the-password", amount: 1000 }),
      res.value,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "FORBIDDEN" });
  });

  it("admin with correct password → mints with origin test_coins", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "admin-ok-mint" });
    const res = mockRes();
    await handleMintTestCoins(
      mockReq({ password: PASSWORD, amount: 25000 }),
      res.value,
    );
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        minted: 25000,
        balance: 25000,
        origin: "test_coins",
        financialValueGbp: 0,
      }),
    );
  });

  it("admin authorize with correct password → ok", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "admin-ok-authz" });
    const res = mockRes();
    await handleAuthorizeTestCoins(mockReq({ password: PASSWORD }), res.value);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, origin: "test_coins" }),
    );
  });

  it("accepts TEST_COINS_ISSUE_PASSWORD_HASH (sha256) instead of plain env", async () => {
    delete process.env.TEST_COINS_ISSUE_PASSWORD;
    process.env.TEST_COINS_ISSUE_PASSWORD_HASH = sha256Hex(PASSWORD);
    authMocks.verifyAuthToken.mockReturnValue({ sub: "admin-hash-mint" });
    const res = mockRes();
    await handleMintTestCoins(
      mockReq({ password: PASSWORD, amount: 10 }),
      res.value,
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ minted: 10, origin: "test_coins" }),
    );
  });
});
