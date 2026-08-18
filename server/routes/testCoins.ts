/**
 * Test-coin ISSUE/MINT — signed-in user + server password.
 *
 * Issuance (mint) requires BOTH:
 *   1. Authenticated user (login)
 *   2. Correct TEST_COINS_ISSUE_PASSWORD from server env (never in the client)
 *
 * Not an admin feature. Issued balances are SERVER-owned (see
 * lib/testCoinsBalance.ts) and stay TEST origin: they never enter paid-coin
 * lots, ledger, Stripe, or creator GBP revenue (giftSource=test_coins).
 */
import { createHash, timingSafeEqual, randomBytes } from "crypto";
import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { getPool } from "../lib/postgres";
import {
  isValkeyConfigured,
  valkeyDel,
  valkeyExpire,
  valkeyHget,
  valkeyHincrby,
} from "../lib/valkey";
import { logger } from "../lib/logger";
import {
  creditTestCoins,
  getTestCoinsBalance,
  isTestCoinsStoreAvailable,
} from "../lib/testCoinsBalance";

const MAX_MINT = 100_000_000;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_MAX = 5;
const LOCK_MS = 15 * 60 * 1000;

type FailState = { count: number; windowStart: number; lockedUntil: number };
// Dev/test only: the shared counter lives in Valkey (see failureKey below).
const failByUser = new Map<string, FailState>();
const failByIp = new Map<string, FailState>();
const allowLocalLockout = process.env.NODE_ENV !== "production";

/**
 * Wrong-password attempts are counted in Valkey, not in this process.
 *
 * The lockout is the only thing standing between a guessable issue password and
 * unlimited minting, and per-process counters give an attacker one full budget
 * per instance — five tries becomes five times the fleet size, and hitting a
 * different instance each time resets nothing because nothing shared was ever
 * written. Production refuses the attempt outright when the counter cannot be
 * read or written, rather than falling back to a count that does not bind.
 */
function failureKey(scope: "user" | "ip", id: string): string {
  return `test_coins:fail:${scope}:${id}`;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function clientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function checkLocalRateLimit(
  map: Map<string, FailState>,
  key: string,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const state = map.get(key);
  if (!state) return { ok: true };
  if (state.lockedUntil > now) {
    return { ok: false, retryAfterSec: Math.ceil((state.lockedUntil - now) / 1000) };
  }
  if (now - state.windowStart > FAIL_WINDOW_MS) {
    map.delete(key);
    return { ok: true };
  }
  if (state.count >= FAIL_MAX) {
    state.lockedUntil = now + LOCK_MS;
    return { ok: false, retryAfterSec: Math.ceil(LOCK_MS / 1000) };
  }
  return { ok: true };
}

async function checkRateLimit(
  scope: "user" | "ip",
  map: Map<string, FailState>,
  key: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  if (isValkeyConfigured()) {
    try {
      const raw = await valkeyHget(failureKey(scope, key), "n");
      const count = Number(raw) || 0;
      if (count >= FAIL_MAX) {
        return { ok: false, retryAfterSec: Math.ceil(LOCK_MS / 1000) };
      }
      return { ok: true };
    } catch (err) {
      if (!allowLocalLockout) {
        logger.error({ err, scope }, "test-coin lockout: Valkey unavailable — refusing attempt");
        return { ok: false, retryAfterSec: Math.ceil(LOCK_MS / 1000) };
      }
    }
  } else if (!allowLocalLockout) {
    logger.error({ scope }, "test-coin lockout: Valkey required in production");
    return { ok: false, retryAfterSec: Math.ceil(LOCK_MS / 1000) };
  }
  return checkLocalRateLimit(map, key);
}

function recordLocalFailure(map: Map<string, FailState>, key: string): void {
  const now = Date.now();
  const state = map.get(key);
  if (!state || now - state.windowStart > FAIL_WINDOW_MS) {
    map.set(key, { count: 1, windowStart: now, lockedUntil: 0 });
    return;
  }
  state.count += 1;
  if (state.count >= FAIL_MAX) state.lockedUntil = now + LOCK_MS;
}

async function recordFailure(
  scope: "user" | "ip",
  map: Map<string, FailState>,
  key: string,
): Promise<void> {
  if (isValkeyConfigured()) {
    try {
      const k = failureKey(scope, key);
      // Each failure restarts the window, so five wrong answers inside any
      // fifteen minutes lock the next fifteen.
      await valkeyHincrby(k, "n", 1);
      await valkeyExpire(k, Math.ceil(FAIL_WINDOW_MS / 1000));
      return;
    } catch (err) {
      logger.error({ err, scope }, "test-coin lockout: failure not recorded");
      if (!allowLocalLockout) return;
    }
  } else if (!allowLocalLockout) {
    return;
  }
  recordLocalFailure(map, key);
}

async function clearFailures(userId: string, ip: string): Promise<void> {
  failByUser.delete(userId);
  failByIp.delete(ip);
  if (!isValkeyConfigured()) return;
  try {
    await valkeyDel(failureKey("user", userId));
    await valkeyDel(failureKey("ip", ip));
  } catch (err) {
    logger.warn({ err }, "test-coin lockout: counters not cleared after success");
  }
}

function envPasswordHash(): string | null {
  const hash = String(process.env.TEST_COINS_ISSUE_PASSWORD_HASH || "").trim().toLowerCase();
  return hash && /^[0-9a-f]{64}$/.test(hash) ? hash : null;
}

function envPasswordPlainHash(): string | null {
  const plain = String(process.env.TEST_COINS_ISSUE_PASSWORD || "").trim();
  return plain ? sha256Hex(plain) : null;
}

function issuePasswordConfigured(): boolean {
  return Boolean(envPasswordHash() || envPasswordPlainHash());
}

/** Owner plain env wins over hash so a leftover HASH cannot block the real password. */
function expectedPasswordHash(): string | null {
  return envPasswordPlainHash() || envPasswordHash();
}

function verifyIssuePassword(password: unknown): boolean {
  const expected = expectedPasswordHash();
  if (!expected) return false;
  const pwd = typeof password === "string" ? password : "";
  if (!pwd) return false;
  return safeEqualHex(sha256Hex(pwd), expected);
}

async function auditIssue(input: {
  adminUserId: string;
  amount: number;
  balanceAfter: number;
  ip: string;
  outcome: "ok" | "forbidden" | "denied" | "rate_limited" | "misconfigured";
  reason?: string;
}): Promise<void> {
  logger.info(
    {
      event: "test_coin_issue",
      origin: "test_coins",
      adminUserId: input.adminUserId,
      amount: input.amount,
      balanceAfter: input.balanceAfter,
      ip: input.ip,
      outcome: input.outcome,
      reason: input.reason || null,
    },
    "test_coin_issue_audit",
  );
  const db = getPool();
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO elix_test_coin_issue_audit
         (admin_user_id, amount, balance_after, origin, outcome, reason, ip)
       VALUES ($1, $2, $3, 'test_coins', $4, $5, $6)`,
      [
        input.adminUserId,
        input.amount,
        input.balanceAfter,
        input.outcome,
        input.reason ?? null,
        input.ip,
      ],
    );
  } catch (err) {
    logger.warn({ err }, "test_coin_issue_audit db write failed");
  }
}

async function requireAuthedUser(
  req: Request,
  res: Response,
): Promise<{ userId: string } | null> {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: "Not authenticated." });
    return null;
  }
  const payload = verifyAuthToken(token);
  if (!payload?.sub) {
    res.status(401).json({ error: "Invalid or expired session." });
    return null;
  }
  return { userId: payload.sub };
}

/** GET balance — any authenticated user may read their own issued test balance. */
export async function handleGetTestCoinBalance(req: Request, res: Response): Promise<void> {
  const auth = await requireAuthedUser(req, res);
  if (!auth) return;
  const balance = await getTestCoinsBalance(auth.userId);
  res.json({ balance, userId: auth.userId, origin: "test_coins" });
}

/**
 * POST authorize — verifies password without minting.
 * Does not unlock mint permanently; mint still requires password again.
 */
export async function handleAuthorizeTestCoins(req: Request, res: Response): Promise<void> {
  const auth = await requireAuthedUser(req, res);
  if (!auth) return;
  const ip = clientIp(req);

  const userLimit = await checkRateLimit("user", failByUser, auth.userId);
  const ipLimit = await checkRateLimit("ip", failByIp, ip);
  if (userLimit.ok === false || ipLimit.ok === false) {
    const retry = Math.max(
      userLimit.ok === false ? userLimit.retryAfterSec : 0,
      ipLimit.ok === false ? ipLimit.retryAfterSec : 0,
    );
    await auditIssue({
      adminUserId: auth.userId,
      amount: 0,
      balanceAfter: await getTestCoinsBalance(auth.userId),
      ip,
      outcome: "rate_limited",
      reason: "authorize_rate_limited",
    });
    res.status(429).json({ error: "Too many attempts. Try again later.", retryAfterSec: retry });
    return;
  }

  if (!issuePasswordConfigured()) {
    await auditIssue({
      adminUserId: auth.userId,
      amount: 0,
      balanceAfter: await getTestCoinsBalance(auth.userId),
      ip,
      outcome: "misconfigured",
      reason: "TEST_COINS_ISSUE_PASSWORD_missing",
    });
    res.status(503).json({ error: "Test-coin issuance is not configured." });
    return;
  }

  if (!verifyIssuePassword(req.body?.password)) {
    await recordFailure("user", failByUser, auth.userId);
    await recordFailure("ip", failByIp, ip);
    await auditIssue({
      adminUserId: auth.userId,
      amount: 0,
      balanceAfter: await getTestCoinsBalance(auth.userId),
      ip,
      outcome: "denied",
      reason: issuePasswordConfigured() ? "bad_password" : "empty_password",
    });
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }

  await clearFailures(auth.userId, ip);
  // Opaque nonce — proves authorize succeeded this session; mint still needs password.
  const nonce = randomBytes(16).toString("hex");
  res.json({ ok: true, origin: "test_coins", nonce });
}

/** POST mint — authenticated user + password required. Returns new test balance (origin=test_coins). */
export async function handleMintTestCoins(req: Request, res: Response): Promise<void> {
  const auth = await requireAuthedUser(req, res);
  if (!auth) return;
  const ip = clientIp(req);

  const userLimit = await checkRateLimit("user", failByUser, auth.userId);
  const ipLimit = await checkRateLimit("ip", failByIp, ip);
  if (userLimit.ok === false || ipLimit.ok === false) {
    const retry = Math.max(
      userLimit.ok === false ? userLimit.retryAfterSec : 0,
      ipLimit.ok === false ? ipLimit.retryAfterSec : 0,
    );
    await auditIssue({
      adminUserId: auth.userId,
      amount: 0,
      balanceAfter: await getTestCoinsBalance(auth.userId),
      ip,
      outcome: "rate_limited",
      reason: "mint_rate_limited",
    });
    res.status(429).json({ error: "Too many attempts. Try again later.", retryAfterSec: retry });
    return;
  }

  if (!issuePasswordConfigured()) {
    await auditIssue({
      adminUserId: auth.userId,
      amount: 0,
      balanceAfter: await getTestCoinsBalance(auth.userId),
      ip,
      outcome: "misconfigured",
      reason: "TEST_COINS_ISSUE_PASSWORD_missing",
    });
    res.status(503).json({ error: "Test-coin issuance is not configured." });
    return;
  }

  if (!verifyIssuePassword(req.body?.password)) {
    await recordFailure("user", failByUser, auth.userId);
    await recordFailure("ip", failByIp, ip);
    await auditIssue({
      adminUserId: auth.userId,
      amount: 0,
      balanceAfter: await getTestCoinsBalance(auth.userId),
      ip,
      outcome: "denied",
      reason: issuePasswordConfigured() ? "bad_password" : "empty_password",
    });
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }

  const amount = Math.max(0, Math.min(Math.floor(Number(req.body?.amount) || 0), MAX_MINT));
  if (!amount) {
    res.status(400).json({ error: "Enter a valid amount." });
    return;
  }

  if (!isTestCoinsStoreAvailable()) {
    await auditIssue({
      adminUserId: auth.userId,
      amount,
      balanceAfter: 0,
      ip,
      outcome: "misconfigured",
      reason: "test_coin_balance_store_unavailable",
    });
    res.status(503).json({ error: "Test-coin balance store is unavailable." });
    return;
  }

  const newBalance = await creditTestCoins(auth.userId, amount);
  await clearFailures(auth.userId, ip);

  await auditIssue({
    adminUserId: auth.userId,
    amount,
    balanceAfter: newBalance,
    ip,
    outcome: "ok",
  });

  res.json({
    balance: newBalance,
    minted: amount,
    origin: "test_coins",
    financialValueGbp: 0,
  });
}