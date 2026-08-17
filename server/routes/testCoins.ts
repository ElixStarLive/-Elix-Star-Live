/**
 * Test-coin ISSUE/MINT — authorised admin + server password only.
 *
 * Issuance (mint) requires BOTH:
 *   1. Authenticated ADMIN user (login + profiles.is_admin=true)
 *   2. Correct TEST_COINS_ISSUE_PASSWORD (server env — never in client)
 *
 * Issued balances stay TEST/PROMO origin on the client (localStorage) for
 * Live/Battle gameplay. They never enter paid-coin lots, ledger, Stripe, or
 * creator GBP revenue (enforced in gift handlers via giftSource=test_coins).
 */
import { createHash, timingSafeEqual, randomBytes } from "crypto";
import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { getPool } from "../lib/postgres";
import { logger } from "../lib/logger";

const MAX_MINT = 100_000_000;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_MAX = 5;
const LOCK_MS = 15 * 60 * 1000;

type FailState = { count: number; windowStart: number; lockedUntil: number };
const failByUser = new Map<string, FailState>();
const failByIp = new Map<string, FailState>();

/** In-memory issued balances (server truth for mint). Client mirrors for gift UI. */
const issuedBalances = new Map<string, number>();

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

function checkRateLimit(map: Map<string, FailState>, key: string): { ok: true } | { ok: false; retryAfterSec: number } {
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

function recordFailure(map: Map<string, FailState>, key: string): void {
  const now = Date.now();
  const state = map.get(key);
  if (!state || now - state.windowStart > FAIL_WINDOW_MS) {
    map.set(key, { count: 1, windowStart: now, lockedUntil: 0 });
    return;
  }
  state.count += 1;
  if (state.count >= FAIL_MAX) state.lockedUntil = now + LOCK_MS;
}

function clearFailures(userId: string, ip: string): void {
  failByUser.delete(userId);
  failByIp.delete(ip);
}

function expectedPasswordHash(): string | null {
  const plain = String(process.env.TEST_COINS_ISSUE_PASSWORD || "").trim();
  const hash = String(process.env.TEST_COINS_ISSUE_PASSWORD_HASH || "").trim().toLowerCase();
  if (hash && /^[0-9a-f]{64}$/.test(hash)) return hash;
  if (plain) return sha256Hex(plain);
  return null;
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

async function requireAuthedAdminUser(
  req: Request,
  res: Response,
): Promise<{ userId: string } | null> {
  const auth = await requireAuthedUser(req, res);
  if (!auth) return null;
  const db = getPool();
  if (!db) {
    res.status(503).json({ error: "Database not configured" });
    return null;
  }
  try {
    const adminR = await db.query(
      `SELECT COALESCE(is_admin, false) AS is_admin FROM profiles WHERE user_id = $1 LIMIT 1`,
      [auth.userId],
    );
    const isAdmin = Boolean(adminR.rows?.[0]?.is_admin);
    if (!isAdmin) {
      res.status(403).json({ error: "Admin only" });
      return null;
    }
    return auth;
  } catch (err) {
    logger.error({ err, userId: auth.userId }, "testCoins admin check failed");
    res.status(500).json({ error: "Admin check failed." });
    return null;
  }
}

/** GET balance — any authenticated user may read their own issued test balance. */
export async function handleGetTestCoinBalance(req: Request, res: Response): Promise<void> {
  const auth = await requireAuthedUser(req, res);
  if (!auth) return;
  const balance = issuedBalances.get(auth.userId) || 0;
  res.json({ balance, userId: auth.userId, origin: "test_coins" });
}

/**
 * POST authorize — verifies password without minting.
 * Does not unlock mint permanently; mint still requires password again.
 */
export async function handleAuthorizeTestCoins(req: Request, res: Response): Promise<void> {
  const auth = await requireAuthedAdminUser(req, res);
  if (!auth) return;
  const ip = clientIp(req);

  const userLimit = checkRateLimit(failByUser, auth.userId);
  const ipLimit = checkRateLimit(failByIp, ip);
  if (userLimit.ok === false || ipLimit.ok === false) {
    const retry = Math.max(
      userLimit.ok === false ? userLimit.retryAfterSec : 0,
      ipLimit.ok === false ? ipLimit.retryAfterSec : 0,
    );
    await auditIssue({
      adminUserId: auth.userId,
      amount: 0,
      balanceAfter: issuedBalances.get(auth.userId) || 0,
      ip,
      outcome: "rate_limited",
      reason: "authorize_rate_limited",
    });
    res.status(429).json({ error: "Too many attempts. Try again later.", retryAfterSec: retry });
    return;
  }

  if (!expectedPasswordHash()) {
    await auditIssue({
      adminUserId: auth.userId,
      amount: 0,
      balanceAfter: issuedBalances.get(auth.userId) || 0,
      ip,
      outcome: "misconfigured",
      reason: "TEST_COINS_ISSUE_PASSWORD_missing",
    });
    res.status(503).json({ error: "Test-coin issuance is not configured." });
    return;
  }

  if (!verifyIssuePassword(req.body?.password)) {
    recordFailure(failByUser, auth.userId);
    recordFailure(failByIp, ip);
    await auditIssue({
      adminUserId: auth.userId,
      amount: 0,
      balanceAfter: issuedBalances.get(auth.userId) || 0,
      ip,
      outcome: "denied",
      reason: "bad_password",
    });
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }

  clearFailures(auth.userId, ip);
  // Opaque nonce — proves authorize succeeded this session; mint still needs password.
  const nonce = randomBytes(16).toString("hex");
  res.json({ ok: true, origin: "test_coins", nonce });
}

/** POST mint — authenticated user + password required. Returns new test balance (origin=test_coins). */
export async function handleMintTestCoins(req: Request, res: Response): Promise<void> {
  const auth = await requireAuthedAdminUser(req, res);
  if (!auth) return;
  const ip = clientIp(req);

  const userLimit = checkRateLimit(failByUser, auth.userId);
  const ipLimit = checkRateLimit(failByIp, ip);
  if (userLimit.ok === false || ipLimit.ok === false) {
    const retry = Math.max(
      userLimit.ok === false ? userLimit.retryAfterSec : 0,
      ipLimit.ok === false ? ipLimit.retryAfterSec : 0,
    );
    await auditIssue({
      adminUserId: auth.userId,
      amount: 0,
      balanceAfter: issuedBalances.get(auth.userId) || 0,
      ip,
      outcome: "rate_limited",
      reason: "mint_rate_limited",
    });
    res.status(429).json({ error: "Too many attempts. Try again later.", retryAfterSec: retry });
    return;
  }

  if (!expectedPasswordHash()) {
    await auditIssue({
      adminUserId: auth.userId,
      amount: 0,
      balanceAfter: issuedBalances.get(auth.userId) || 0,
      ip,
      outcome: "misconfigured",
      reason: "TEST_COINS_ISSUE_PASSWORD_missing",
    });
    res.status(503).json({ error: "Test-coin issuance is not configured." });
    return;
  }

  if (!verifyIssuePassword(req.body?.password)) {
    recordFailure(failByUser, auth.userId);
    recordFailure(failByIp, ip);
    await auditIssue({
      adminUserId: auth.userId,
      amount: 0,
      balanceAfter: issuedBalances.get(auth.userId) || 0,
      ip,
      outcome: "denied",
      reason: "bad_password",
    });
    res.status(403).json({ error: "FORBIDDEN" });
    return;
  }

  const amount = Math.max(0, Math.min(Math.floor(Number(req.body?.amount) || 0), MAX_MINT));
  if (!amount) {
    res.status(400).json({ error: "Enter a valid amount." });
    return;
  }

  const current = issuedBalances.get(auth.userId) || 0;
  const newBalance = current + amount;
  issuedBalances.set(auth.userId, newBalance);
  clearFailures(auth.userId, ip);

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

/** Spend helper kept for legacy score path — still auth-gated, never money. */
export async function handleSpendTestCoinsForScore(req: Request, res: Response): Promise<void> {
  const auth = await requireAuthedUser(req, res);
  if (!auth) return;
  const amount = Math.max(0, Math.floor(Number(req.body?.amount) || 0));
  const current = issuedBalances.get(auth.userId) || 0;
  if (amount > current) {
    res.status(400).json({ error: "Insufficient test coins.", balance: current, origin: "test_coins" });
    return;
  }
  const newBalance = current - amount;
  issuedBalances.set(auth.userId, newBalance);
  res.json({ balance: newBalance, spent: amount, origin: "test_coins", financialValueGbp: 0 });
}
