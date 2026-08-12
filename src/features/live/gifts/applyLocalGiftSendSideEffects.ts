/**
 * Shared local UI side-effects after a successful gift send (host send, host combo, spectator).
 * Pill + optional battle tile stack + optional co-host tile score/icon.
 */

import type { Dispatch, SetStateAction } from 'react';
import {
  pushLocalGiftPill,
  type ElixGiftPillDetail,
} from '../../../components/GiftAnimationOverlay';
import {
  appendBattleTileGiftForTarget,
  resolveBattleGiftIconUrl,
  type BattleTileGifts,
} from '../../../lib/liveBattleGiftTarget';

export type ApplyLocalGiftSendSideEffectsArgs = {
  pill: ElixGiftPillDetail;
  giftIcon: unknown;
  resolveGiftAssetUrl: (path: string) => string;
  /** When set, append resolved icon to the battle tile for `target` (no-op if target invalid). */
  battle?: {
    target: unknown;
    setLastGifts: Dispatch<SetStateAction<BattleTileGifts>>;
  };
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

/** Returns resolved battle/cohost icon URL (or null) for callers that need extra stacks. */
export function applyLocalGiftSendSideEffects(
  args: ApplyLocalGiftSendSideEffectsArgs,
): string | null {
  pushLocalGiftPill(args.pill);
  const iconUrl = resolveBattleGiftIconUrl(args.giftIcon, args.resolveGiftAssetUrl);

  if (args.battle && iconUrl) {
    args.battle.setLastGifts((prev) =>
      appendBattleTileGiftForTarget(prev, args.battle!.target, iconUrl),
    );
  }

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
    setCohostGiftScores((prev) => ({
      ...prev,
      [targetUserId]: (prev[targetUserId] || 0) + coins,
    }));
    if (iconUrl) {
      setCohostLastGifts((prev) => ({ ...prev, [targetUserId]: iconUrl }));
    }
  }

  return iconUrl;
}
