/** Test coins — BATTLE GAME SCORE + gift animation only. Never real money / IAP / Stripe. */

/**
 * Test coins stay in the app on iOS, Android, and Play Store.
 * Battle score + gift animation only (£0). Never creator revenue / IAP / Stripe.
 * Password-gated mint from live More Options (login + server password). Do not disable.
 */
export function areTestCoinsEnabled(): boolean {
  return true;
}

/**
 * The test-coin BALANCE is owned by the server (Valkey, see
 * server/lib/testCoinsBalance.ts). Mint credits it, and every test-coin gift is
 * debited there before any animation or battle point is awarded.
 *
 * localStorage here is a DISPLAY MIRROR only: it lets the panel show the same
 * number instantly across screens. It is never the authority — the client does
 * not decide whether a spend is allowed, and writing to it cannot create coins.
 */
export function getPersistedTestCoinsBalance(userId: string | undefined): number {
  if (!areTestCoinsEnabled()) return 0;
  if (!userId || typeof localStorage === 'undefined') return 0;
  try {
    const v = localStorage.getItem(`elix_test_coins_balance_${userId}`);
    return v ? Math.max(0, parseInt(v, 10)) : 0;
  } catch {
    return 0;
  }
}

/** Mirror the SERVER balance for display. Only call with a server-returned value. */
export function persistTestCoinsBalance(userId: string | undefined, balance: number): void {
  if (!areTestCoinsEnabled()) return;
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`elix_test_coins_balance_${userId}`, String(Math.max(0, balance)));
  } catch {
    /* ignore */
  }
}

/**
 * Which balance the gift panel spends from: test coins when the user has a
 * server-issued test balance, otherwise the real wallet. This selects the
 * REQUEST route only — the server validates and debits whichever it is.
 */
export function shouldUseTestCoinsForGifts(userId: string | undefined): boolean {
  if (!areTestCoinsEnabled()) return false;
  return getPersistedTestCoinsBalance(userId) > 0;
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
  if (!areTestCoinsEnabled()) return { totalXp: 0, level: 0 };
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
