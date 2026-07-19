/** Local test coins — isolated from real wallet / IAP / Stripe (gift UI testing only). */

export function getPersistedTestCoinsBalance(userId: string | undefined): number {
  if (!userId || typeof localStorage === 'undefined') return 0;
  try {
    const v = localStorage.getItem(`elix_test_coins_balance_${userId}`);
    return v ? Math.max(0, parseInt(v, 10)) : 0;
  } catch {
    return 0;
  }
}

export function persistTestCoinsBalance(userId: string | undefined, balance: number): void {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`elix_test_coins_balance_${userId}`, String(Math.max(0, balance)));
  } catch {
    /* ignore */
  }
}

/** When test coins exist, gifts spend from test balance only — never the real wallet. */
export function shouldUseTestCoinsForGifts(userId: string | undefined): boolean {
  return getPersistedTestCoinsBalance(userId) > 0;
}

export function resolveGiftUiBalance(walletBalance: number, userId: string | undefined): number {
  const test = getPersistedTestCoinsBalance(userId);
  if (test > 0) return test;
  return Math.max(0, walletBalance);
}

/** Balance used before sending a gift — always prefers persisted test coins over wallet state. */
export function getSpendableGiftBalance(displayBalance: number, userId: string | undefined): number {
  return resolveGiftUiBalance(displayBalance, userId);
}

export function addPersistedTestCoins(userId: string | undefined, amount: number): number {
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
  const coins = Math.max(0, Math.floor(amount));
  const current = getPersistedTestCoinsBalance(userId);
  if (current < coins) return { ok: false as const, balance: current };
  const newBalance = current - coins;
  persistTestCoinsBalance(userId, newBalance);
  return { ok: true as const, newBalance };
}

// ── Local test-only XP/level simulation ────────────────────────────────────
// Mirrors the SERVER curve exactly (1 coin = 1 XP, 10,000 XP per level, cap 300)
// but lives purely in localStorage. This lets test-coin gifting show the level
// climbing while testing, WITHOUT ever touching the real wallet, the server, or
// real progression. Resettable at any time; never converts to money or real XP.
const TEST_XP_PER_LEVEL = 10_000;
const TEST_MAX_LEVEL = 300;

export function levelForTestXp(totalXp: number): number {
  const xp = Math.max(0, Math.floor(totalXp));
  return Math.min(TEST_MAX_LEVEL, Math.floor(xp / TEST_XP_PER_LEVEL));
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
