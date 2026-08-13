/**
 * Shared local UI side-effects after a successful gift send (host send, host combo, spectator).
 * Pill + optional co-host tile score/icon.
 */

import type { Dispatch, SetStateAction } from 'react';
import {
  pushLocalGiftPill,
  type ElixGiftPillDetail,
} from '../../../components/GiftAnimationOverlay';
import { resolveBattleGiftIconUrl } from '../../../lib/liveBattleGiftTarget';

export type ApplyLocalGiftSendSideEffectsArgs = {
  pill: ElixGiftPillDetail;
  giftIcon: unknown;
  resolveGiftAssetUrl: (path: string) => string;
  /** Non-battle co-host tile: score + icon; marks txn so WS echo does not double-count. */
  cohost?: {
    targetUserId: string;
    coins: number;
    giftTransactionId?: string | null;
    markGiftTxnSeen: (txnId: string) => void;
    setCohostGiftScores: Dispatch<SetStateAction<Record<string, number>>>;
    setCohostLastGifts: Dispatch<SetStateAction<Record<string, string>>>;
  };
};

/** Co-host tile score + icon from gift_sent / local send (host + spectator). */
export function applyCohostGiftTileScore(args: {
  targetUserId: string;
  coins: number;
  giftIcon: unknown;
  resolveGiftAssetUrl: (path: string) => string;
  setCohostGiftScores: Dispatch<SetStateAction<Record<string, number>>>;
  setCohostLastGifts: Dispatch<SetStateAction<Record<string, string>>>;
}): string | null {
  if (!args.targetUserId || !(args.coins > 0)) return null;
  args.setCohostGiftScores((prev) => ({
    ...prev,
    [args.targetUserId]: (prev[args.targetUserId] || 0) + args.coins,
  }));
  const iconUrl = resolveBattleGiftIconUrl(args.giftIcon, args.resolveGiftAssetUrl);
  if (iconUrl) {
    args.setCohostLastGifts((prev) => ({ ...prev, [args.targetUserId]: iconUrl }));
  }
  return iconUrl;
}

export function applyLocalGiftSendSideEffects(
  args: ApplyLocalGiftSendSideEffectsArgs,
): void {
  pushLocalGiftPill(args.pill);

  if (args.cohost && args.cohost.coins > 0) {
    const {
      targetUserId,
      coins,
      giftTransactionId,
      markGiftTxnSeen,
      setCohostGiftScores,
      setCohostLastGifts,
    } = args.cohost;
    if (giftTransactionId) {
      markGiftTxnSeen(giftTransactionId);
    }
    applyCohostGiftTileScore({
      targetUserId,
      coins,
      giftIcon: args.giftIcon,
      resolveGiftAssetUrl: args.resolveGiftAssetUrl,
      setCohostGiftScores,
      setCohostLastGifts,
    });
  }
}
