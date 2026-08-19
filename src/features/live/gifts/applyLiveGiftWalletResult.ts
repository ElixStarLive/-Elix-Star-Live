/**
 * Post-gift UI source switch for live host/spectator controllers.
 *
 * Wallet write owner is `sendGift` in giftSend.ts (already applies
 * useWalletStore). This helper must NOT re-apply balances — only derive
 * nextGiftSource + pass through progression fields. Never touches test coins.
 */

import {
  type GiftSource,
  type SendGiftResult,
} from '../../../lib/giftSend';
import { useWalletStore } from '../../../store/useWalletStore';

type ApplyLiveGiftWalletArgs = {
  result: SendGiftResult;
  /** Current gift source selection used for the send (fallback if result.giftSource is null). */
  giftSource: GiftSource;
};

type ApplyLiveGiftWalletOutcome = {
  paid?: number;
  starter?: number;
  promo?: number;
  nextGiftSource?: GiftSource;
  newLevel: number | null;
  totalXp: number | null;
  leveledUp: boolean;
  /** True when paid path still has no confirmed paid balance after sendGift. */
  walletRefreshFailed?: boolean;
};

function resolveSource(
  result: SendGiftResult,
  giftSourceContext: GiftSource,
): GiftSource {
  if (
    result.giftSource === 'starter_coins' ||
    result.giftSource === 'promotional_coins' ||
    result.giftSource === 'paid_coins'
  ) {
    return result.giftSource;
  }
  return giftSourceContext;
}

/**
 * Read store after sendGift (which already wrote balances) and suggest giftSource.
 */
export async function applyLiveGiftWalletResult(
  args: ApplyLiveGiftWalletArgs,
): Promise<ApplyLiveGiftWalletOutcome> {
  const { result, giftSource: giftSourceContext } = args;
  const source = resolveSource(result, giftSourceContext);
  const w = useWalletStore.getState();

  const outcome: ApplyLiveGiftWalletOutcome = {
    newLevel: result.newLevel,
    totalXp: result.totalXp,
    leveledUp: result.leveledUp,
    paid: w.paidBalance,
    starter: w.starterBalance,
    promo: w.promotionalBalance,
  };

  if (source === 'starter_coins') {
    const starter = Math.max(
      0,
      result.newStarterBalance != null
        ? Number(result.newStarterBalance)
        : w.starterBalance,
    );
    outcome.starter = starter;
    if (starter <= 0) outcome.nextGiftSource = 'paid_coins';
    return outcome;
  }

  if (source === 'promotional_coins') {
    const promo = Math.max(
      0,
      result.newPromotionalBalance != null
        ? Number(result.newPromotionalBalance)
        : w.promotionalBalance,
    );
    outcome.promo = promo;
    if (promo <= 0) {
      outcome.nextGiftSource =
        w.starterBalance > 0 ? 'starter_coins' : 'paid_coins';
    }
    return outcome;
  }

  // paid_coins — balances already written by sendGift (incl. fetchWallet fallback)
  if (result.newBalance == null && Number(w.paidBalance) < 0) {
    outcome.walletRefreshFailed = true;
  }
  return outcome;
}
