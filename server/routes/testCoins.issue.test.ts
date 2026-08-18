import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  resetValkeyFake,
  setValkeyFakeHashesReachable,
  setValkeyFakeHashesWritable,
  setValkeyFakeLocksAvailable,
  valkeyFake,
} from "../websocket/battleValkeyFake";

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
  handleGetTestCoinBalance,
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

let requestSeq = 0;

function mockReq(body: Record<string, unknown> = {}, ip = "127.0.0.1"): Request {
  return {
    body,
    headers: {},
    socket: { remoteAddress: ip },
  } as unknown as Request;
}

/** A mint carries the identity of the attempt; a new press is a new id. */
function mintReq(
  body: Record<string, unknown>,
  ip = "127.0.0.1",
): Request {
  requestSeq += 1;
  return mockReq({ requestId: `req-${requestSeq}`, ...body }, ip);
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
    await handleMintTestCoins(mintReq({ password: PASSWORD, amount: 100 }), res.value);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("logged-in user with correct password → mints with origin test_coins", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-ok-mint" });
    const res = mockRes();
    await handleMintTestCoins(
      mintReq({ password: PASSWORD, amount: 5000 }),
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
      mintReq({ password: PASSWORD, amount: 5 }),
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
      mintReq({ password: "not-the-password", amount: 1000 }),
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
      mintReq({ password: "anything-typed", amount: 7 }),
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
      mintReq({ password: PASSWORD, amount: 3 }),
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
      mintReq({ password: PASSWORD, amount: 10 }),
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
      mintReq({ password: PASSWORD, amount: 100 }),
      res.value,
    );
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ minted: 100 }),
    );
  });

  it("mint credits the server balance so it survives the device", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-server-balance" });
    await handleMintTestCoins(mintReq({ password: PASSWORD, amount: 40 }), mockRes().value);
    const res = mockRes();
    await handleMintTestCoins(mintReq({ password: PASSWORD, amount: 60 }), res.value);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ minted: 60, balance: 100 }),
    );
  });

  it("refuses a mint that does not say which attempt it is", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-no-request-id" });
    const res = mockRes();
    await handleMintTestCoins(mockReq({ password: PASSWORD, amount: 50 }), res.value);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("refuses a mint request id that is not an opaque token", async () => {
    authMocks.verifyAuthToken.mockReturnValue({ sub: "user-bad-request-id" });
    const res = mockRes();
    await handleMintTestCoins(
      mockReq({ password: PASSWORD, amount: 50, requestId: "no spaces allowed" }),
      res.value,
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  /**
   * A retry of one attempt is still one mint. The claim lives in Valkey, so the
   * instance that answers the retry does not have to be the one that credited.
   */
  describe("mint idempotency", () => {
    it("credits once when the same request is replayed", async () => {
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-replay" });
      const body = { password: PASSWORD, amount: 250, requestId: "attempt-a" };

      const first = mockRes();
      await handleMintTestCoins(mockReq(body), first.value);
      expect(first.json).toHaveBeenCalledWith(
        expect.objectContaining({ minted: 250, balance: 250 }),
      );

      const replay = mockRes();
      await handleMintTestCoins(mockReq(body), replay.value);
      expect(replay.json).toHaveBeenCalledWith(
        expect.objectContaining({ minted: 0, duplicate: true, balance: 250 }),
      );

      const read = mockRes();
      await handleGetTestCoinBalance(mockReq(), read.value);
      expect(read.json).toHaveBeenCalledWith(
        expect.objectContaining({ balance: 250 }),
      );
    });

    it("still mints again for a new attempt", async () => {
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-two-attempts" });
      await handleMintTestCoins(
        mockReq({ password: PASSWORD, amount: 100, requestId: "attempt-1" }),
        mockRes().value,
      );
      const res = mockRes();
      await handleMintTestCoins(
        mockReq({ password: PASSWORD, amount: 100, requestId: "attempt-2" }),
        res.value,
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ minted: 100, balance: 200 }),
      );
    });

    it("lets a genuinely failed mint be retried with the same id", async () => {
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-failed-then-retry" });
      const body = { password: PASSWORD, amount: 75, requestId: "attempt-retry" };

      setValkeyFakeHashesWritable(false);
      const failed = mockRes();
      await handleMintTestCoins(mockReq(body), failed.value);
      expect(failed.status).toHaveBeenCalledWith(503);

      setValkeyFakeHashesWritable(true);
      const retried = mockRes();
      await handleMintTestCoins(mockReq(body), retried.value);
      expect(retried.json).toHaveBeenCalledWith(
        expect.objectContaining({ minted: 75, balance: 75 }),
      );
    });

    it("refuses the mint when the claim itself cannot be taken", async () => {
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-no-claim" });
      setValkeyFakeLocksAvailable(false);
      const res = mockRes();
      await handleMintTestCoins(
        mockReq({ password: PASSWORD, amount: 10, requestId: "attempt-noclaim" }),
        res.value,
      );
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ minted: 10 }),
      );
    });
  });

  /**
   * The lockout is all that stands between a guessable issue password and
   * unlimited minting. Counting failures in process memory hands an attacker a
   * fresh budget per instance, so the count has to live where every instance
   * reads it.
   */
  describe("wrong-password lockout is shared, not per process", () => {
    it("records failures where another instance can see them", async () => {
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-shared-count" });
      await handleMintTestCoins(
        mintReq({ password: "wrong", amount: 1 }),
        mockRes().value,
      );

      expect(await valkeyFake.valkeyHget("test_coins:fail:user:user-shared-count", "n")).toBe(
        "1",
      );
    });

    it("locks out an attempt this process has never seen fail", async () => {
      // Five failures recorded by a different instance.
      await valkeyFake.valkeyHincrby("test_coins:fail:user:user-elsewhere", "n", 5);
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-elsewhere" });
      const res = mockRes();

      await handleMintTestCoins(mintReq({ password: PASSWORD, amount: 10 }), res.value);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ minted: 10 }),
      );
    });

    it("clears the shared count once the right password is given", async () => {
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-recovers" });
      await handleMintTestCoins(mintReq({ password: "wrong", amount: 1 }), mockRes().value);

      await handleAuthorizeTestCoins(mockReq({ password: PASSWORD }), mockRes().value);

      expect(await valkeyFake.valkeyHget("test_coins:fail:user:user-recovers", "n")).toBeNull();
    });

    /**
     * An uncounted guess is an unlimited guess. With the counter down the
     * endpoint has to close, not answer "wrong password" forever.
     */
    it("refuses every attempt while the shared counter cannot be read", async () => {
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-counter-unreadable" });
      setValkeyFakeHashesReachable(false);

      const mint = mockRes();
      await handleMintTestCoins(mintReq({ password: PASSWORD, amount: 10 }), mint.value);
      expect(mint.status).toHaveBeenCalledWith(503);
      expect(mint.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ minted: 10 }),
      );

      const authz = mockRes();
      await handleAuthorizeTestCoins(mockReq({ password: PASSWORD }), authz.value);
      expect(authz.status).toHaveBeenCalledWith(503);
      expect(authz.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ ok: true }),
      );
    });

    it("does not answer 'wrong password' when the failure could not be counted", async () => {
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-uncounted-guess" });
      setValkeyFakeHashesWritable(false);

      const res = mockRes();
      await handleMintTestCoins(mintReq({ password: "wrong", amount: 1 }), res.value);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.status).not.toHaveBeenCalledWith(403);
    });

    it("closes issuance entirely when Valkey is not configured", async () => {
      store.available = false;
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-no-valkey" });
      const res = mockRes();
      await handleAuthorizeTestCoins(mockReq({ password: PASSWORD }), res.value);
      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe("balance read", () => {
    it("returns the server balance for the signed-in user", async () => {
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-balance-read" });
      await handleMintTestCoins(mintReq({ password: PASSWORD, amount: 30 }), mockRes().value);
      const res = mockRes();
      await handleGetTestCoinBalance(mockReq(), res.value);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ balance: 30, origin: "test_coins" }),
      );
    });

    it("says unavailable instead of reporting a balance of zero", async () => {
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-balance-unreadable" });
      await handleMintTestCoins(mintReq({ password: PASSWORD, amount: 30 }), mockRes().value);
      setValkeyFakeHashesReachable(false);

      const res = mockRes();
      await handleGetTestCoinBalance(mockReq(), res.value);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({ balance: 0 }),
      );
    });
  });

  it("production NODE_ENV still mints for login + password (£0)", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      authMocks.verifyAuthToken.mockReturnValue({ sub: "user-prod-mint" });
      const res = mockRes();
      await handleMintTestCoins(
        mintReq({ password: PASSWORD, amount: 25 }),
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
