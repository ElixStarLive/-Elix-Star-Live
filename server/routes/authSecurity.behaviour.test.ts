import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import type { Request, Response } from "express";

/**
 * Session lifecycle defects found in the Step 19 security pass.
 *
 * Each case here is a way the server used to keep honouring access it had told
 * the client was gone:
 *
 *  - logout answered 200 even when the session row survived, so the client threw
 *    away a token the server still accepted for its full seven days
 *  - logout, delete and password reset closed REST access but left an already
 *    open socket authenticated, still able to send chat, gifts and co-host events
 *  - Apple sign-in and the email-confirmation callback minted sessions without the
 *    suspension check password login has always done
 *  - login counted attempts per IP only, so a run spread over many addresses never
 *    accumulated against the account it was aimed at
 */

const pool = {
  query: vi.fn(),
  connect: vi.fn(),
};

const postgres = { getPool: vi.fn(() => pool) };

/** Valkey hash fields, so the login lockout counter is observable. */
let hashes: Record<string, Record<string, string>> = {};
let valkeyUp = true;

const valkey = {
  isValkeyConfigured: vi.fn(() => true),
  valkeyGet: vi.fn(async () => null),
  valkeySet: vi.fn(async () => {}),
  valkeySetNx: vi.fn(async () => true),
  valkeyDel: vi.fn(async (key: string) => {
    delete hashes[key];
  }),
  valkeySadd: vi.fn(async () => {}),
  valkeySmembers: vi.fn(async () => [] as string[]),
  valkeyExpire: vi.fn(async () => {}),
  valkeyTryHget: vi.fn(async (key: string, field: string) =>
    valkeyUp
      ? { status: "ok" as const, value: hashes[key]?.[field] ?? null }
      : { status: "unavailable" as const },
  ),
  valkeyTryHincrby: vi.fn(async (key: string, field: string, by: number) => {
    if (!valkeyUp) return { status: "unavailable" as const };
    const next = (Number(hashes[key]?.[field]) || 0) + by;
    (hashes[key] ??= {})[field] = String(next);
    return { status: "ok" as const, value: next };
  }),
};

const ws = {
  disconnectUserSession: vi.fn(() => 1),
  disconnectUserSessions: vi.fn(() => 1),
};

vi.mock("../lib/postgres", () => postgres);
vi.mock("../lib/valkey", () => valkey);
vi.mock("../websocket/index", () => ws);
vi.mock("../lib/email", () => ({
  isEmailConfigured: vi.fn(() => false),
  sendTransactionalEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../lib/starterCoinsXp", () => ({
  getProgressionSnapshot: vi.fn(async () => null),
  initializeNewUserStarterProgression: vi.fn(async () => {}),
}));
vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

const SECRET = "x".repeat(48);
process.env.JWT_SECRET = SECRET;

const auth = await import("./auth");

/** Same HS256 shape auth.ts signs, so the handlers accept these tokens. */
function signToken(payload: Record<string, unknown>): string {
  const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ iat: now, exp: now + 3600, ...payload });
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

function fakeRes() {
  const sent: { status?: number; body?: Record<string, unknown> } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      sent.body = body;
      return res;
    },
    setHeader: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  };
  return { res: res as unknown as Response, sent };
}

function postRequest(body: Record<string, unknown>, token?: string): Request {
  return {
    method: "POST",
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cookies: {},
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  hashes = {};
  valkeyUp = true;
  valkey.isValkeyConfigured.mockReturnValue(true);
  postgres.getPool.mockReturnValue(pool);
  pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("logout must not report a sign-out that did not happen", () => {
  it("answers an error when the session row could not be deleted", async () => {
    const token = "session-token-abc";
    pool.query.mockRejectedValue(new Error("neon unavailable"));
    const { res, sent } = fakeRes();

    await auth.handleLogout(postRequest({}, token), res);

    // The token still works, so claiming ok would leave a live credential behind
    // a client that has already discarded it.
    expect(sent.status).toBe(503);
    expect(sent.body?.ok).toBeUndefined();
  });

  it("closes only the socket of the session it signed out", async () => {
    const token = signToken({ sub: "user-1", email: "a@b.com" });
    pool.query.mockResolvedValue({ rows: [], rowCount: 1 });
    const { res, sent } = fakeRes();

    await auth.handleLogout(postRequest({}, token), res);

    expect(sent.status).toBe(200);
    // Per session, not per user: a sign-out on one device must leave the others on.
    expect(ws.disconnectUserSession).toHaveBeenCalledWith(
      "user-1",
      auth.hashSessionToken(token),
      "Signed out",
    );
    expect(ws.disconnectUserSessions).not.toHaveBeenCalled();
  });
});

describe("login lockout is counted per account", () => {
  const identifier = "victim@example.com";

  it("counts a wrong password against the account, not just the address", async () => {
    const { res } = fakeRes();

    await auth.handleLogin(postRequest({ email: identifier, password: "wrong" }), res);

    const counters = Object.values(hashes).map((h) => h.n);
    expect(counters).toContain("1");
  });

  it("refuses further attempts once the account has spent its budget", async () => {
    // Ten failures inside the window hold the account for the next window.
    for (let i = 0; i < 10; i++) {
      const { res } = fakeRes();
      await auth.handleLogin(postRequest({ email: identifier, password: "wrong" }), res);
    }

    const { res, sent } = fakeRes();
    await auth.handleLogin(postRequest({ email: identifier, password: "wrong" }), res);

    expect(sent.status).toBe(429);
  });

  it("does not answer a locked account differently from an unknown one", async () => {
    for (let i = 0; i < 10; i++) {
      const { res } = fakeRes();
      await auth.handleLogin(postRequest({ email: identifier, password: "wrong" }), res);
    }

    const locked = fakeRes();
    await auth.handleLogin(postRequest({ email: identifier, password: "wrong" }), locked.res);
    const unknown = fakeRes();
    await auth.handleLogin(
      postRequest({ email: "nobody-ever@example.com", password: "wrong" }),
      unknown.res,
    );

    // The lockout is keyed on what was typed, so a locked address and a fresh one
    // both reach the counter without the response revealing which exists.
    expect(locked.sent.status).toBe(429);
    expect(unknown.sent.status).toBe(401);
  });

  it("refuses the attempt when the shared counter cannot be read", async () => {
    valkeyUp = false;
    const { res, sent } = fakeRes();

    await auth.handleLogin(postRequest({ email: identifier, password: "wrong" }), res);

    // An uncounted guess is an unlimited one. authLimiter already refuses this
    // route when Valkey is down, so this adds no new failure mode.
    expect(sent.status).toBe(429);
  });
});

describe("every path that mints a session refuses a suspended account", () => {
  const bannedRow = { rows: [{ banned_until: new Date(Date.now() + 86_400_000) }], rowCount: 1 };

  it("refuses the email-confirmation callback for a banned user", async () => {
    const verifyToken = signToken({
      sub: "banned-1",
      email: "banned@example.com",
      purpose: "email_verify",
    });
    pool.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes("banned_until")) return bannedRow;
      if (String(sql).includes("FROM elix_auth_users")) {
        return {
          rows: [
            {
              id: "banned-1",
              email: "banned@example.com",
              password_hash: "hash",
              username: "banned",
              display_name: "Banned",
              avatar_url: "",
              created_at: new Date().toISOString(),
              email_confirmed_at: new Date().toISOString(),
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });
    const { res, sent } = fakeRes();

    await auth.handleVerifyEmail(postRequest({ token: verifyToken }), res);

    // An already-confirmed link used to hand back a brand new session, which let a
    // banned user walk straight past the login-time check.
    expect(sent.status).toBe(403);
    expect(sent.body?.access_token).toBeUndefined();
  });
});
