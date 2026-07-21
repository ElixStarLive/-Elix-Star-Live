/** Local test coins — isolated from real wallet / IAP / Stripe (gift UI testing only). */

import { IS_STORE_BUILD } from '../config/build';

/** Store/production client builds must never read or spend test coins. */
function testCoinsAllowed(): boolean {
  return !IS_STORE_BUILD;
}

export function getPersistedTestCoinsBalance(userId: string | undefined): number {
  if (!testCoinsAllowed()) return 0;
  if (!userId || typeof localStorage === 'undefined') return 0;
  try {
    const v = localStorage.getItem(`elix_test_coins_balance_${userId}`);
    return v ? Math.max(0, parseInt(v, 10)) : 0;
  } catch {
    return 0;
  }
}

export function persistTestCoinsBalance(userId: string | undefined, balance: number): void {
  if (!testCoinsAllowed()) return;
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`elix_test_coins_balance_${userId}`, String(Math.max(0, balance)));
  } catch {
    /* ignore */
  }
}

/** When test coins exist, gifts spend from test balance only — never the real wallet. */
export function shouldUseTestCoinsForGifts(userId: string | undefined): boolean {
  if (!testCoinsAllowed()) return false;
  return getPersistedTestCoinsBalance(userId) > 0;
}

export function resolveGiftUiBalance(walletBalance: number, userId: string | undefined): number {
  if (!testCoinsAllowed()) return Math.max(0, walletBalance);
  const test = getPersistedTestCoinsBalance(userId);
  if (test > 0) return test;
  return Math.max(0, walletBalance);
}

/** Balance used before sending a gift — always prefers persisted test coins over wallet state. */
export function getSpendableGiftBalance(displayBalance: number, userId: string | undefined): number {
  return resolveGiftUiBalance(displayBalance, userId);
}

export function addPersistedTestCoins(userId: string | undefined, amount: number): number {
  if (!testCoinsAllowed()) return 0;
  const add = Math.max(0, Math.floor(amount));
  const current = getPersistedTestCoinsBalance(userId);
  const newBalance = current + add;
  persistTestCoinsBalance(userId, newBalance);
  return newBalance;
}

export type DebitTestCoinsResult =
  | { ok: true; newBalance: number }
  | { ok: false; balance: number };

export function debitTestCoinsForGift(
  userId: string | undefined,
  amount: number,
): DebitTestCoinsResult {
  if (!testCoinsAllowed()) return { ok: false as const, balance: 0 };
  const coins = Math.max(0, Math.floor(amount));
  const current = getPersistedTestCoinsBalance(userId);
  if (current < coins) return { ok: false as const, balance: current };
  const newBalance = current - coins;
  persistTestCoinsBalance(userId, newBalance);
  return { ok: true as const, newBalance };
}

// ── Local test-only XP/level simulation ────────────────────────────────────
// Mirrors the SERVER curve exactly (1 coin = 1 XP, power curve
// total_xp = C * level^p with C=206.9, p=2.294744 → level 20 = 200k,
// level 300 = 100M) but lives purely in localStorage. This lets test-coin
// gifting show the level climbing while testing, WITHOUT ever touching the real
// wallet, the server, or real progression. Resettable; never converts to money.
const TEST_XP_C = 206.9;
const TEST_XP_P = 2.294744;
const TEST_MAX_LEVEL = 300;

export function levelForTestXp(totalXp: number): number {
  const xp = Math.max(0, Math.floor(totalXp));
  if (xp < TEST_XP_C) return 0;
  const level = Math.floor(Math.pow(xp / TEST_XP_C, 1 / TEST_XP_P));
  return Math.max(0, Math.min(TEST_MAX_LEVEL, level));
}

export function getPersistedTestXp(userId: string | undefined): number {
  if (!userId || typeof localStorage === 'undefined') return 0;
  try {
    const v = localStorage.getItem(`elix_test_xp_${userId}`);
    return v ? Math.max(0, parseInt(v, 10)) : 0;
  } catch {
    return 0;
  }
}

/** Add local test XP for a test-coin gift and return the new total + level. */
export function addTestGiftXp(
  userId: string | undefined,
  coinsSpent: number,
): { totalXp: number; level: number } {
  if (!testCoinsAllowed()) return { totalXp: 0, level: 0 };
  const gain = Math.max(0, Math.floor(coinsSpent));
  const totalXp = getPersistedTestXp(userId) + gain;
  if (userId && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`elix_test_xp_${userId}`, String(totalXp));
    } catch {
      /* ignore */
    }
  }
  return { totalXp, level: levelForTestXp(totalXp) };
}

/** Current simulated test level (0 when no test XP recorded). */
export function getTestLevel(userId: string | undefined): number {
  return levelForTestXp(getPersistedTestXp(userId));
}
