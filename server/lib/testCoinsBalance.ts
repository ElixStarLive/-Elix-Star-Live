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
 * EVERY read and write here is a CONFIRMED one. The plain `valkeyHget` /
 * `valkeyHincrby` helpers answer `null` / `0` when Valkey cannot be reached,
 * which a balance cannot survive: a failed debit would come back as "balance is
 * now 0", the caller would read that as a successful spend, and a Valkey
 * incident would hand out unlimited free test gifts and unlimited battle points.
 * An unreachable store is therefore reported as `unavailable`, never as zero and
 * never as success.
 *
 * PERSISTENCE (deliberate): this is QA currency, not a durable ledger. The hash
 * has no TTL, so a balance outlives app reloads and server restarts, but it is
 * NOT permanent authority: a Valkey wipe simply resets it, and it must never be
 * written to a Neon wallet/money table. Re-minting is free — login + the server
 * password issues more at any time.
 */

import { isValkeyConfigured, valkeyTryHget, valkeyTryHincrby } from "./valkey";
import { logger } from "./logger";

const BALANCE_KEY = "test_coins:balances";

type TestCoinsBalanceRead =
  | { status: "ok"; balance: number }
  | { status: "unavailable" };

type TestCoinsCreditResult =
  | { status: "ok"; balance: number }
  | { status: "unavailable" };

type TestCoinsDebitResult =
  | { ok: true; newBalance: number }
  | { ok: false; reason: "insufficient"; balance: number }
  | { ok: false; reason: "unavailable" };

function normalizeAmount(amount: unknown): number {
  const n = Math.floor(Number(amount) || 0);
  return n > 0 ? n : 0;
}

export function isTestCoinsStoreAvailable(): boolean {
  return isValkeyConfigured();
}

/**
 * The user's issued test balance, or `unavailable` when the store cannot answer.
 * A user who has never minted really does have 0; a store that cannot be read
 * has no balance to report, and the two must not collapse into the same number.
 */
export async function readTestCoinsBalance(
  userId: string,
): Promise<TestCoinsBalanceRead> {
  if (!userId) return { status: "ok", balance: 0 };
  if (!isValkeyConfigured()) return { status: "unavailable" };
  const read = await valkeyTryHget(BALANCE_KEY, userId);
  if (read.status === "unavailable") {
    logger.error({ userId }, "test-coin balance unreadable — store unavailable");
    return { status: "unavailable" };
  }
  return { status: "ok", balance: Math.max(0, Math.floor(Number(read.value) || 0)) };
}

/**
 * Add test coins to a user's server balance.
 * Used by the password-gated mint route and to give coins back when a test
 * gift is rejected after the debit (nothing was shown or scored).
 */
export async function creditTestCoins(
  userId: string,
  amount: number,
): Promise<TestCoinsCreditResult> {
  const add = normalizeAmount(amount);
  if (!userId) return { status: "ok", balance: 0 };
  if (!isValkeyConfigured()) return { status: "unavailable" };
  if (!add) return readTestCoinsBalance(userId);
  const next = await valkeyTryHincrby(BALANCE_KEY, userId, add);
  if (next.status === "unavailable") {
    logger.error({ userId, add }, "test-coin credit failed — store unavailable");
    return { status: "unavailable" };
  }
  return { status: "ok", balance: Math.max(0, next.value) };
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
    const read = await readTestCoinsBalance(userId);
    return read.status === "ok"
      ? { ok: false, reason: "insufficient", balance: read.balance }
      : { ok: false, reason: "unavailable" };
  }
  if (!isValkeyConfigured()) return { ok: false, reason: "unavailable" };

  const after = await valkeyTryHincrby(BALANCE_KEY, userId, -spend);
  if (after.status === "unavailable") {
    logger.error({ userId, spend }, "test-coin debit failed — store unavailable");
    return { ok: false, reason: "unavailable" };
  }
  if (after.value < 0) {
    const restored = await valkeyTryHincrby(BALANCE_KEY, userId, spend);
    if (restored.status === "unavailable") {
      logger.error(
        { userId, spend },
        "test-coin overdraft not compensated — balance left short until next mint",
      );
      return { ok: false, reason: "unavailable" };
    }
    return { ok: false, reason: "insufficient", balance: Math.max(0, restored.value) };
  }
  return { ok: true, newBalance: after.value };
}
