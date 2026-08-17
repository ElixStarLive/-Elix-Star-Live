/**
 * TEST-COIN BALANCE — server authority.
 *
 * Test coins are BATTLE SCORE + GIFT ANIMATION only. They are never money:
 * no IAP, no Stripe, no wallet, no paid-coin lots, no creator GBP, £0 always.
 *
 * They are still a real, server-owned balance. The client may DISPLAY it and
 * REQUEST a spend, but it can never be the source of truth: minting requires
 * login + the server password, and every test-coin gift is debited here,
 * atomically, before any animation or battle point is awarded.
 *
 * Stored in Valkey (`test_coins:balances` hash, field = userId) so every worker
 * and instance sees the same balance. HINCRBY makes the debit atomic — no
 * read-modify-write race can mint coins by double-spending.
 *
 * PERSISTENCE (deliberate): this is QA currency, not a durable ledger. The hash
 * has no TTL, so a balance outlives app reloads and server restarts, but it is
 * NOT permanent authority: a Valkey wipe simply resets it, and it must never be
 * written to a Neon wallet/money table. Re-minting is free — login + the server
 * password issues more at any time.
 */

import { isValkeyConfigured, valkeyHget, valkeyHincrby } from "./valkey";
import { logger } from "./logger";

const BALANCE_KEY = "test_coins:balances";

export type TestCoinsDebitResult =
  | { ok: true; newBalance: number }
  | { ok: false; balance: number; reason: "insufficient" | "unavailable" };

function normalizeAmount(amount: unknown): number {
  const n = Math.floor(Number(amount) || 0);
  return n > 0 ? n : 0;
}

export function isTestCoinsStoreAvailable(): boolean {
  return isValkeyConfigured();
}

export async function getTestCoinsBalance(userId: string): Promise<number> {
  if (!userId || !isValkeyConfigured()) return 0;
  try {
    const raw = await valkeyHget(BALANCE_KEY, userId);
    return Math.max(0, Math.floor(Number(raw) || 0));
  } catch (err) {
    logger.error({ err, userId }, "getTestCoinsBalance failed");
    return 0;
  }
}

/**
 * Add test coins to a user's server balance.
 * Used by the password-gated mint route and to give coins back when a test
 * gift is rejected after the debit (nothing was shown or scored).
 */
export async function creditTestCoins(
  userId: string,
  amount: number,
): Promise<number> {
  const add = normalizeAmount(amount);
  if (!userId || !add || !isValkeyConfigured()) {
    return getTestCoinsBalance(userId);
  }
  const next = await valkeyHincrby(BALANCE_KEY, userId, add);
  return Math.max(0, next);
}

/**
 * Atomically debit test coins for a test gift.
 * Overdraft is impossible: the decrement is applied first and immediately
 * compensated when it would go negative, so two concurrent spends of the same
 * balance cannot both succeed.
 */
export async function debitTestCoins(
  userId: string,
  amount: number,
): Promise<TestCoinsDebitResult> {
  const spend = normalizeAmount(amount);
  if (!userId || !spend) {
    return { ok: false, balance: await getTestCoinsBalance(userId), reason: "insufficient" };
  }
  if (!isValkeyConfigured()) {
    return { ok: false, balance: 0, reason: "unavailable" };
  }
  try {
    const after = await valkeyHincrby(BALANCE_KEY, userId, -spend);
    if (after < 0) {
      const restored = await valkeyHincrby(BALANCE_KEY, userId, spend);
      return {
        ok: false,
        balance: Math.max(0, restored),
        reason: "insufficient",
      };
    }
    return { ok: true, newBalance: after };
  } catch (err) {
    logger.error({ err, userId }, "debitTestCoins failed");
    return { ok: false, balance: 0, reason: "unavailable" };
  }
}
