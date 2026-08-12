/**
 * Host-channel paid gift send + shared success UI effects (send + combo).
 * Never uses test coins.
 */

import { giftSendErrorToast, type GiftSource } from '../../../lib/giftSend';
import { resolvePlayableGiftVideoUrl } from './liveGiftIngest';
import { sendLivePaidGift } from './sendLiveGift';
import {
  applyLivePaidGiftSuccessEffects,
  type ApplyLivePaidGiftSuccessEffectsOutcome,
} from './applyLivePaidGiftSuccessEffects';

export type SendHostPaidGiftWithSuccessArgs = {
  streamKey: string;
  giftId: string;
  giftVideo?: string | null;
  giftSource: GiftSource;
  battleTarget?: 'host' | 'opponent' | 'player3' | 'player4';
  cohostTargetUserId?: string | null;
  isBattleMode: boolean;
  currentLevel: number;
  walletCoinBalanceRef: { current: number };
  setGiftSource: (source: GiftSource) => void;
  setUserLevel: (level: number) => void;
  setUserXP: (xp: number) => void;
  updateUserLevel: (level: number) => void;
  showToast: (message: string) => void;
  onLeveledUp: (newLevel: number) => void;
  clearSelectedCohost: () => void;
};

export async function sendHostPaidGiftWithSuccess(
  args: SendHostPaidGiftWithSuccessArgs,
): Promise<ApplyLivePaidGiftSuccessEffectsOutcome> {
  const playableVideo = resolvePlayableGiftVideoUrl(args.giftVideo);
  const paid = await sendLivePaidGift({
    streamKey: args.streamKey,
    giftId: args.giftId,
    channel: 'host',
    giftSource: args.giftSource,
    video: playableVideo,
    ...(args.battleTarget ? { battleTarget: args.battleTarget } : {}),
    ...(!args.isBattleMode && args.cohostTargetUserId
      ? { cohostTargetUserId: args.cohostTargetUserId }
      : {}),
  });
  const result = paid.result;
  if (!paid.ok || !result) {
    const msg = paid.errorToast || giftSendErrorToast('');
    if (msg.includes('co-host')) args.clearSelectedCohost();
    args.showToast(msg);
    return { ok: false };
  }
  return applyLivePaidGiftSuccessEffects({
    result,
    giftSource: args.giftSource,
    currentLevel: args.currentLevel,
    walletCoinBalanceRef: args.walletCoinBalanceRef,
    setGiftSource: args.setGiftSource,
    setUserLevel: args.setUserLevel,
    setUserXP: args.setUserXP,
    updateUserLevel: args.updateUserLevel,
    showToast: args.showToast,
    onLeveledUp: args.onLeveledUp,
  });
}
