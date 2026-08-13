/**
 * Shared post–paid-gift success UI for live host/spectator (and host combo).
 * Wallet write owner remains sendGift; this only syncs refs/source/level/XP.
 * Never touches test coins.
 */

import type { GiftSource, SendGiftResult } from '../../../lib/giftSend';
import { reportFailure } from '../../../lib/reportFailure';
import { applyLiveGiftWalletResult } from './applyLiveGiftWalletResult';

export function formatInsufficientCoinsToast(have: number, need: number): string {
  return `Not enough coins (have ${have.toLocaleString()}, need ${need.toLocaleString()})`;
}

/** Shared wallet/level UI setters for paid gift success (host send + apply). */
export type LivePaidGiftWalletUiArgs = {
  giftSource: GiftSource;
  currentLevel: number;
  walletCoinBalanceRef: { current: number };
  setGiftSource: (source: GiftSource) => void;
  setUserLevel: (level: number) => void;
  setUserXP: (xp: number) => void;
  updateUserLevel: (level: number) => void;
  showToast: (message: string) => void;
};

export type ApplyLivePaidGiftSuccessEffectsArgs = LivePaidGiftWalletUiArgs & {
  result: SendGiftResult;
  /** Banner + optional liveChatSend — role-specific identity. */
  onLeveledUp?: (newLevel: number) => void;
  /** Default: "Gift failed" */
  missingTransactionToast?: string;
};

export type ApplyLivePaidGiftSuccessEffectsOutcome =
  | { ok: true; newLevel: number; transactionId: string }
  | { ok: false };

export async function applyLivePaidGiftSuccessEffects(
  args: ApplyLivePaidGiftSuccessEffectsArgs,
): Promise<ApplyLivePaidGiftSuccessEffectsOutcome> {
  const {
    result,
    giftSource,
    currentLevel,
    walletCoinBalanceRef,
    setGiftSource,
    setUserLevel,
    setUserXP,
    updateUserLevel,
    showToast,
    onLeveledUp,
    missingTransactionToast = 'Gift failed',
  } = args;

  const applied = await applyLiveGiftWalletResult({ result, giftSource });
  if (applied.paid != null) {
    walletCoinBalanceRef.current = applied.paid;
  }
  if (applied.nextGiftSource) {
    setGiftSource(applied.nextGiftSource);
  }
  if (applied.walletRefreshFailed) {
    reportFailure('live_gift_wallet_refresh', 'fetchWallet failed');
    showToast('Could not refresh wallet balance');
  }

  let newLevel = currentLevel;
  if (result.newLevel != null) {
    newLevel = Math.max(0, Number(result.newLevel) || 0);
    setUserLevel(newLevel);
    updateUserLevel(newLevel);
  }
  if (result.totalXp != null) {
    setUserXP(Math.max(0, Number(result.totalXp) || 0));
  }
  if (result.leveledUp) {
    onLeveledUp?.(newLevel);
  }

  const transactionId =
    typeof result.transactionId === 'string' && result.transactionId.trim()
      ? result.transactionId.trim()
      : '';
  if (!transactionId) {
    showToast(missingTransactionToast);
    return { ok: false };
  }
  return { ok: true, newLevel, transactionId };
}
