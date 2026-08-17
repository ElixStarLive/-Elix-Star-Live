import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { resetValkeyFake, valkeyFake } from "../websocket/battleValkeyFake";

const authMocks = vi.hoisted(() => ({
  getTokenFromRequest: vi.fn(),
  verifyAuthToken: vi.fn(),
}));

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  getPool: vi.fn(),
}));

const store = vi.hoisted(() => ({ available: true }));

vi.mock("./auth", () => authMocks);
vi.mock("../lib/postgres", () => ({
  getPool: () => dbMocks.getPool(),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// Minted test coins are a SERVER balance (Valkey), never a client-side number.
vi.mock("../lib/valkey", () => ({
  ...valkeyFake,
  isValkeyConfigured: () => store.available,
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

function mockAuditQuery() {
  dbMocks.query.mockResolvedValue({ rows: [] });
}

describe("test-coin ISSUE access control", () => {
  const PASSWORD = "unit-test-issue-password-only";

  beforeEach(() => {
    vi.clearAllMocks();
    resetValkeyFake();
    store.available = true;
    process.env.TEST_COINS_ISSUE_PASSWORD = PASSWORD;
    delete process.env.TEST_COINS_ISSUE_PASSWORD_HASH;
    authMocks.getTokenFromRequest.mockReturnValue("tok");
    dbMocks.getPool.mockReturnValue({ query: dbMocks.query });
    mockAuditQuery();
  });

  it("unauthenticated mint → 401", async () => {
    authMocks.getTokenFromRequest.mockReturnValue(null);
    const res = mockRes();
    await handleMintTestCoins(mockReq({ password: PASSWORD, amount: 100 }), res.value);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("logged-in user with correct password → mints with origin test_coins", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-ok-mint" });
    const res = mockRes();
    await handleMintTestCoins(
      mockReq({ password: PASSWORD, amount: 5000 }),
      res.value,
    );
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        minted: 5000,
        balance: 5000,
        origin: "test_coins",
        financialValueGbp: 0,
      }),
    );
  });

  it("non-admin with correct password still mints (£0)", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-not-admin" });
    const res = mockRes();
    await handleMintTestCoins(
      mockReq({ password: PASSWORD, amount: 5 }),
      res.value,
    );
    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ minted: 5, origin: "test_coins", financialValueGbp: 0 }),
    );
  });

  it("logged-in user authorize with correct password → ok", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-ok-authz" });
    const res = mockRes();
    await handleAuthorizeTestCoins(mockReq({ password: PASSWORD }), res.value);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, origin: "test_coins" }),
    );
  });

  it("logged-in user with wrong password → 403 FORBIDDEN", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-wrong-pwd" });
    const res = mockRes();
    await handleMintTestCoins(
      mockReq({ password: "not-the-password", amount: 1000 }),
      res.value,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "FORBIDDEN" });
  });

  it("missing TEST_COINS_ISSUE_PASSWORD → 503", async () => {
    delete process.env.TEST_COINS_ISSUE_PASSWORD;
    delete process.env.TEST_COINS_ISSUE_PASSWORD_HASH;
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-no-env-pwd" });
    const res = mockRes();
    await handleMintTestCoins(
      mockReq({ password: "anything-typed", amount: 7 }),
      res.value,
    );
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it("plain TEST_COINS_ISSUE_PASSWORD wins over a leftover hash", async () => {
    process.env.TEST_COINS_ISSUE_PASSWORD = PASSWORD;
    process.env.TEST_COINS_ISSUE_PASSWORD_HASH = sha256Hex("not-the-owner-password");
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-plain-wins" });
    const res = mockRes();
    await handleMintTestCoins(
      mockReq({ password: PASSWORD, amount: 3 }),
      res.value,
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ minted: 3, origin: "test_coins" }),
    );
  });

  it("accepts TEST_COINS_ISSUE_PASSWORD_HASH (sha256) instead of plain env", async () => {
    delete process.env.TEST_COINS_ISSUE_PASSWORD;
    process.env.TEST_COINS_ISSUE_PASSWORD_HASH = sha256Hex(PASSWORD);
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-hash-mint" });
    const res = mockRes();
    await handleMintTestCoins(
      mockReq({ password: PASSWORD, amount: 10 }),
      res.value,
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ minted: 10, origin: "test_coins" }),
    );
  });

  it("mint fails visibly when the server balance store is unavailable", async () => {
    store.available = false;
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-no-store" });
    const res = mockRes();
    await handleMintTestCoins(
      mockReq({ password: PASSWORD, amount: 100 }),
      res.value,
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ minted: 100 }),
    );
  });

  it("mint credits the server balance so it survives the device", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-server-balance" });
    await handleMintTestCoins(mockReq({ password: PASSWORD, amount: 40 }), mockRes().value);
    const res = mockRes();
    await handleMintTestCoins(mockReq({ password: PASSWORD, amount: 60 }), res.value);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ minted: 60, balance: 100 }),
    );
  });

  it("production NODE_ENV still mints for login + password (£0)", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_TEST_COINS_MINT_IN_PROD;
    try {
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-prod-mint" });
      const res = mockRes();
      await handleMintTestCoins(
        mockReq({ password: PASSWORD, amount: 25 }),
        res.value,
      );
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ minted: 25, origin: "test_coins", financialValueGbp: 0 }),
      );
    } finally {
      if (prev === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prev;
    }
  });
});
