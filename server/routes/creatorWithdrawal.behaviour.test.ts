import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * Creator withdrawal request contract.
 *
 * The client sends an amount and an idempotency key and nothing else that
 * matters: who is being paid, what they are owed and whether they may be paid at
 * all are all answered on the server. These tests hold that line — a body that
 * names another creator must not move that creator's money, a reused key must
 * not read back somebody else's withdrawal, and a verification check that cannot
 * run must refuse rather than wave the payout through.
 */

const requestGbpWithdrawal = vi.fn();
const emailConfigured = vi.fn(() => true);
const poolQuery = vi.fn();

vi.mock("./auth", () => ({
  getTokenFromRequest: (req: Request) =>
    (req.headers?.authorization as string | undefined)?.replace("Bearer ", "") ?? null,
  verifyAuthToken: (token: string) => (token ? { sub: token } : null),
}));

vi.mock("../lib/postgres", () => ({
  getPool: () => ({ query: (...args: unknown[]) => poolQuery(...args) }),
}));

vi.mock("../lib/email", () => ({
  isEmailConfigured: () => emailConfigured(),
}));

vi.mock("../lib/monetisation/gbpWithdrawals", () => ({
  requestGbpWithdrawal: (...args: unknown[]) => requestGbpWithdrawal(...args),
  listGbpWithdrawals: vi.fn(async () => []),
}));

function req(body: Record<string, unknown>, userId = "creator-a"): Request {
  return {
    headers: { authorization: `Bearer ${userId}` },
    body,
    query: {},
    params: {},
  } as unknown as Request;
}

function fakeRes() {
  const sent: { status: number; body: unknown } = { status: 200, body: null };
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(payload: unknown) {
      sent.body = payload;
      return res;
    },
    setHeader() {
      return res;
    },
  } as unknown as Response;
  return { res, sent };
}

beforeEach(() => {
  vi.clearAllMocks();
  emailConfigured.mockReturnValue(true);
  poolQuery.mockResolvedValue({ rows: [{ email_confirmed_at: new Date() }], rowCount: 1 });
  requestGbpWithdrawal.mockResolvedValue({
    ok: true,
    id: "wdgbp_1",
    status: "pending",
    alreadyExists: false,
  });
});

async function handler() {
  return (await import("./payout")).handleCreatorWithdrawGbp;
}

describe("POST /api/creator/withdraw-gbp", () => {
  it("pays the signed-in creator and ignores any creator named in the body", async () => {
    const withdraw = await handler();
    const { res, sent } = fakeRes();

    await withdraw(
      req({
        amount_pence: 1_000,
        idempotency_key: "k1",
        // All of this is client-supplied and must not be believed.
        creator_user_id: "creator-b",
        user_id: "creator-b",
        available_pence: 999_999,
        stripe_account_id: "acct_attacker",
      }),
      res,
    );

    expect(sent.status).toBe(200);
    expect(requestGbpWithdrawal).toHaveBeenCalledWith({
      creatorUserId: "creator-a",
      amountPence: 1_000,
      idempotencyKey: "k1",
    });
  });

  it("refuses an unauthenticated request", async () => {
    const withdraw = await handler();
    const { res, sent } = fakeRes();
    await withdraw(
      { headers: {}, body: { amount_pence: 100, idempotency_key: "k" } } as unknown as Request,
      res,
    );
    expect(sent.status).toBe(401);
    expect(requestGbpWithdrawal).not.toHaveBeenCalled();
  });

  it("requires an idempotency key", async () => {
    const withdraw = await handler();
    const { res, sent } = fakeRes();
    await withdraw(req({ amount_pence: 100 }), res);
    expect(sent.status).toBe(400);
    expect(sent.body).toMatchObject({ error: "idempotency_key_required" });
    expect(requestGbpWithdrawal).not.toHaveBeenCalled();
  });

  it("refuses amounts that are not real positive money", async () => {
    const withdraw = await handler();
    const overflow = Number.POSITIVE_INFINITY;
    for (const amount of [0, -100, "abc", null, undefined, Number.NaN, overflow, 0.4]) {
      const { res, sent } = fakeRes();
      await withdraw(req({ amount_pence: amount, idempotency_key: "k" }), res);
      expect(sent.status, `amount ${String(amount)}`).toBe(400);
      expect(sent.body).toMatchObject({ error: "invalid_amount" });
    }
    expect(requestGbpWithdrawal).not.toHaveBeenCalled();
  });

  it("answers 409 when an idempotency key is reused with different terms", async () => {
    requestGbpWithdrawal.mockResolvedValue({ ok: false, error: "idempotency_key_conflict" });
    const withdraw = await handler();
    const { res, sent } = fakeRes();

    await withdraw(req({ amount_pence: 1_000, idempotency_key: "shared" }), res);

    expect(sent.status).toBe(409);
    expect(sent.body).toMatchObject({ error: "idempotency_key_conflict" });
  });

  it("reports a retry of the same request as the same withdrawal", async () => {
    requestGbpWithdrawal.mockResolvedValue({
      ok: true,
      id: "wdgbp_1",
      status: "pending",
      alreadyExists: true,
    });
    const withdraw = await handler();
    const { res, sent } = fakeRes();

    await withdraw(req({ amount_pence: 1_000, idempotency_key: "k1" }), res);

    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ ok: true, id: "wdgbp_1", already_exists: true });
  });

  it("answers 503 for a database failure so the client can retry the same key", async () => {
    requestGbpWithdrawal.mockResolvedValue({ ok: false, error: "database_error" });
    const withdraw = await handler();
    const { res, sent } = fakeRes();
    await withdraw(req({ amount_pence: 1_000, idempotency_key: "k1" }), res);
    expect(sent.status).toBe(503);
  });

  it("requires a confirmed email when mail is configured", async () => {
    poolQuery.mockResolvedValue({ rows: [{ email_confirmed_at: null }], rowCount: 1 });
    const withdraw = await handler();
    const { res, sent } = fakeRes();

    await withdraw(req({ amount_pence: 1_000, idempotency_key: "k1" }), res);

    expect(sent.status).toBe(403);
    expect(requestGbpWithdrawal).not.toHaveBeenCalled();
  });

  it("refuses the payout when the email check itself cannot run", async () => {
    poolQuery.mockRejectedValue(new Error("connection terminated"));
    const withdraw = await handler();
    const { res, sent } = fakeRes();

    await withdraw(req({ amount_pence: 1_000, idempotency_key: "k1" }), res);

    // A broken check is not a pass — that would open payouts to every
    // unverified account for as long as the query stayed broken.
    expect(sent.status).toBe(503);
    expect(requestGbpWithdrawal).not.toHaveBeenCalled();
  });

  it("skips the email gate only when mail is not configured at all", async () => {
    emailConfigured.mockReturnValue(false);
    poolQuery.mockRejectedValue(new Error("should not be asked"));
    const withdraw = await handler();
    const { res, sent } = fakeRes();

    await withdraw(req({ amount_pence: 1_000, idempotency_key: "k1" }), res);

    expect(sent.status).toBe(200);
    expect(requestGbpWithdrawal).toHaveBeenCalled();
  });
});
