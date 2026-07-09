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
