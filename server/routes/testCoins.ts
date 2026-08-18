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
import { createHash, timingSafeEqual } from "crypto";
import { Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "./auth";
import { getPool } from "../lib/postgres";
import {
  isValkeyConfigured,
  valkeyDel,
  valkeyExpire,
  valkeyTryHget,
  valkeyTryHincrby,
  valkeyTrySetNx,
} from "../lib/valkey";
import { logger } from "../lib/logger";
import {
  creditTestCoins,
  readTestCoinsBalance,
  isTestCoinsStoreAvailable,
} from "../lib/testCoinsBalance";

const MAX_MINT = 100_000_000;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_MAX = 5;
const LOCK_MS = 15 * 60 * 1000;
/**
 * How long a mint request id is remembered. The client makes a new id per
 * attempt, so this only has to outlive the retries of one attempt.
 */
const MINT_REQUEST_TTL_MS = 60 * 60 * 1000;
const MAX_MINT_REQUEST_ID = 64;

/**
 * Wrong-password attempts are counted in Valkey, not in this process.
 *
 * The lockout is the only thing standing between a guessable issue password and
 * unlimited minting, and per-process counters give an attacker one full budget
 * per instance — five tries becomes five times the fleet size, and hitting a
 * different instance each time resets nothing because nothing shared was ever
 * written. There is no local fallback: when the shared counter cannot be read or
 * written the attempt is refused, because an uncounted guess is an unlimited one.
 */
function failureKey(scope: "user" | "ip", id: string): string {
  return `test_coins:fail:${scope}:${id}`;
}

/** One mint request = one credit, whichever instance answers the retry. */
function mintRequestKey(userId: string, requestId: string): string {
  return `test_coins:mint:req:${userId}:${requestId}`;
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
  // The mint password lockout is keyed on this. Trusting the left-most
  // X-Forwarded-For entry let an attacker send a new value with every guess and
  // never accumulate attempts against any one key, so the lockout counted nothing.
  // With app.set("trust proxy", 1) req.ip is the real hop — same rule as
  // getClientIp in middleware/rateLimit.
  return req.ip || req.socket?.remoteAddress || "unknown";
}

type AttemptGate =
  | { ok: true }
  | { ok: false; kind: "locked"; retryAfterSec: number }
  | { ok: false; kind: "unavailable" };

async function checkAttemptGate(
  scope: "user" | "ip",
  id: string,
): Promise<AttemptGate> {
  if (!isValkeyConfigured()) {
    logger.error({ scope }, "test-coin lockout: Valkey required — refusing attempt");
    return { ok: false, kind: "unavailable" };
  }
  const read = await valkeyTryHget(failureKey(scope, id), "n");
  if (read.status === "unavailable") {
    logger.error({ scope }, "test-coin lockout: counter unreadable — refusing attempt");
    return { ok: false, kind: "unavailable" };
  }
  const count = Number(read.value) || 0;
  if (count >= FAIL_MAX) {
    return { ok: false, kind: "locked", retryAfterSec: Math.ceil(LOCK_MS / 1000) };
  }
  return { ok: true };
}

/** Count a wrong password. Reports whether the shared counter really moved. */
async function recordFailure(scope: "user" | "ip", id: string): Promise<boolean> {
  if (!isValkeyConfigured()) return false;
  const key = failureKey(scope, id);
  // Each failure restarts the window, so five wrong answers inside any
  // fifteen minutes lock the next fifteen.
  const next = await valkeyTryHincrby(key, "n", 1);
  if (next.status === "unavailable") {
    logger.error({ scope }, "test-coin lockout: failure not recorded");
    return false;
  }
  await valkeyExpire(key, Math.ceil(FAIL_WINDOW_MS / 1000));
  return true;
}

async function clearFailures(userId: string, ip: string): Promise<void> {
  if (!isValkeyConfigured()) return;
  await valkeyDel(failureKey("user", userId));
  await valkeyDel(failureKey("ip", ip));
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
  /** Only meaningful for outcome "ok" — a refused attempt changes no balance. */
  balanceAfter?: number;
  ip: string;
  outcome: "ok" | "denied" | "rate_limited" | "misconfigured" | "unavailable";
  reason?: string;
}): Promise<void> {
  const balanceAfter = input.balanceAfter ?? 0;
  logger.info(
    {
      event: "test_coin_issue",
      origin: "test_coins",
      adminUserId: input.adminUserId,
      amount: input.amount,
      balanceAfter,
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
        balanceAfter,
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

/**
 * The one gate every issue attempt passes: shared lockout, configured password,
 * then the password itself. A wrong password that could not be counted is
 * answered as unavailable rather than FORBIDDEN — telling an attacker "wrong"
 * while nothing is counting the guesses is an unlimited oracle.
 */
async function guardIssueAttempt(
  res: Response,
  opts: { userId: string; ip: string; password: unknown; action: "authorize" | "mint" },
): Promise<boolean> {
  const [userGate, ipGate] = await Promise.all([
    checkAttemptGate("user", opts.userId),
    checkAttemptGate("ip", opts.ip),
  ]);

  if (userGate.ok === false && userGate.kind === "unavailable") {
    await auditIssue({
      adminUserId: opts.userId,
      amount: 0,
      ip: opts.ip,
      outcome: "unavailable",
      reason: `${opts.action}_lockout_unavailable`,
    });
    res.status(503).json({ error: "Test-coin issuance is unavailable." });
    return false;
  }
  if (ipGate.ok === false && ipGate.kind === "unavailable") {
    await auditIssue({
      adminUserId: opts.userId,
      amount: 0,
      ip: opts.ip,
      outcome: "unavailable",
      reason: `${opts.action}_lockout_unavailable`,
    });
    res.status(503).json({ error: "Test-coin issuance is unavailable." });
    return false;
  }
  if (userGate.ok === false || ipGate.ok === false) {
    const retry = Math.max(
      userGate.ok === false ? userGate.retryAfterSec : 0,
      ipGate.ok === false ? ipGate.retryAfterSec : 0,
    );
    await auditIssue({
      adminUserId: opts.userId,
      amount: 0,
      ip: opts.ip,
      outcome: "rate_limited",
      reason: `${opts.action}_rate_limited`,
    });
    res.status(429).json({ error: "Too many attempts. Try again later.", retryAfterSec: retry });
    return false;
  }

  if (!issuePasswordConfigured()) {
    await auditIssue({
      adminUserId: opts.userId,
      amount: 0,
      ip: opts.ip,
      outcome: "misconfigured",
      reason: "TEST_COINS_ISSUE_PASSWORD_missing",
    });
    res.status(503).json({ error: "Test-coin issuance is not configured." });
    return false;
  }

  if (!verifyIssuePassword(opts.password)) {
    const [userCounted, ipCounted] = await Promise.all([
      recordFailure("user", opts.userId),
      recordFailure("ip", opts.ip),
    ]);
    if (!userCounted || !ipCounted) {
      await auditIssue({
        adminUserId: opts.userId,
        amount: 0,
        ip: opts.ip,
        outcome: "unavailable",
        reason: `${opts.action}_failure_uncounted`,
      });
      res.status(503).json({ error: "Test-coin issuance is unavailable." });
      return false;
    }
    await auditIssue({
      adminUserId: opts.userId,
      amount: 0,
      ip: opts.ip,
      outcome: "denied",
      reason: "bad_password",
    });
    res.status(403).json({ error: "FORBIDDEN" });
    return false;
  }

  return true;
}

/** GET balance — any authenticated user may read their own issued test balance. */
export async function handleGetTestCoinBalance(req: Request, res: Response): Promise<void> {
  const auth = await requireAuthedUser(req, res);
  if (!auth) return;
  const read = await readTestCoinsBalance(auth.userId);
  if (read.status === "unavailable") {
    // A balance that cannot be read is not a balance of zero.
    res.status(503).json({ error: "Test-coin balance is unavailable.", origin: "test_coins" });
    return;
  }
  res.json({ balance: read.balance, userId: auth.userId, origin: "test_coins" });
}

/**
 * POST authorize — verifies password without minting.
 * Does not unlock mint permanently; mint still requires password again.
 */
export async function handleAuthorizeTestCoins(req: Request, res: Response): Promise<void> {
  const auth = await requireAuthedUser(req, res);
  if (!auth) return;
  const ip = clientIp(req);

  if (!(await guardIssueAttempt(res, {
    userId: auth.userId,
    ip,
    password: req.body?.password,
    action: "authorize",
  }))) {
    return;
  }

  await clearFailures(auth.userId, ip);
  res.json({ ok: true, origin: "test_coins" });
}

/**
 * A mint carries the identity of the attempt that asked for it, so a retried or
 * replayed request credits once. The id is opaque to the server; it only has to
 * be stable across the retries of one attempt and unique to it.
 */
function parseMintRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > MAX_MINT_REQUEST_ID) return null;
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
}

async function claimMintRequest(
  userId: string,
  requestId: string,
): Promise<"claimed" | "duplicate" | "unavailable"> {
  const claim = await valkeyTrySetNx(
    mintRequestKey(userId, requestId),
    "1",
    MINT_REQUEST_TTL_MS,
  );
  if (claim === "set") return "claimed";
  if (claim === "exists") return "duplicate";
  return "unavailable";
}

/** POST mint — authenticated user + password required. Returns new test balance (origin=test_coins). */
export async function handleMintTestCoins(req: Request, res: Response): Promise<void> {
  const auth = await requireAuthedUser(req, res);
  if (!auth) return;
  const ip = clientIp(req);

  if (!(await guardIssueAttempt(res, {
    userId: auth.userId,
    ip,
    password: req.body?.password,
    action: "mint",
  }))) {
    return;
  }

  const amount = Math.max(0, Math.min(Math.floor(Number(req.body?.amount) || 0), MAX_MINT));
  if (!amount) {
    res.status(400).json({ error: "Enter a valid amount." });
    return;
  }

  const requestId = parseMintRequestId(req.body?.requestId);
  if (!requestId) {
    res.status(400).json({ error: "Mint request id is required." });
    return;
  }

  if (!isTestCoinsStoreAvailable()) {
    await auditIssue({
      adminUserId: auth.userId,
      amount,
      ip,
      outcome: "unavailable",
      reason: "test_coin_balance_store_unavailable",
    });
    res.status(503).json({ error: "Test-coin balance store is unavailable." });
    return;
  }

  const claim = await claimMintRequest(auth.userId, requestId);
  if (claim === "unavailable") {
    await auditIssue({
      adminUserId: auth.userId,
      amount,
      ip,
      outcome: "unavailable",
      reason: "mint_request_claim_unavailable",
    });
    res.status(503).json({ error: "Test-coin balance store is unavailable." });
    return;
  }
  if (claim === "duplicate") {
    // This exact request already credited. Report the balance it produced and
    // mint nothing more, on whichever instance the retry lands.
    const read = await readTestCoinsBalance(auth.userId);
    if (read.status === "unavailable") {
      res.status(503).json({ error: "Test-coin balance store is unavailable." });
      return;
    }
    res.json({
      balance: read.balance,
      minted: 0,
      duplicate: true,
      origin: "test_coins",
      financialValueGbp: 0,
    });
    return;
  }

  const credited = await creditTestCoins(auth.userId, amount);
  if (credited.status === "unavailable") {
    // Nothing was credited, so this request id must not block the retry.
    await valkeyDel(mintRequestKey(auth.userId, requestId));
    await auditIssue({
      adminUserId: auth.userId,
      amount,
      ip,
      outcome: "unavailable",
      reason: "test_coin_credit_failed",
    });
    res.status(503).json({ error: "Test-coin balance store is unavailable." });
    return;
  }

  await clearFailures(auth.userId, ip);

  await auditIssue({
    adminUserId: auth.userId,
    amount,
    balanceAfter: credited.balance,
    ip,
    outcome: "ok",
  });

  res.json({
    balance: credited.balance,
    minted: amount,
    origin: "test_coins",
    financialValueGbp: 0,
  });
}
