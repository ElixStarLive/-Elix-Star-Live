/**
 * Shared host↔spectator gift spendable balance resolve (test vs paid/starter/promo).
 * Test coins stay separate — never mixed into wallet balances.
 */

import { getPersistedTestCoinsBalance } from '../../../lib/testCoins';
import type { GiftSource } from '../../../lib/giftSend';

export function resolveLiveGiftSpendableBalance(opts: {
  usedTestCoins: boolean;
  userId?: string | null;
  giftSource: GiftSource;
  paidBalance: number;
  starterBalance: number;
  promotionalBalance: number;
}): number {
  if (opts.usedTestCoins) {
    return getPersistedTestCoinsBalance(opts.userId ?? undefined);
  }
  if (opts.giftSource === 'starter_coins') return opts.starterBalance;
  if (opts.giftSource === 'promotional_coins') return opts.promotionalBalance;
  return opts.paidBalance;
}
