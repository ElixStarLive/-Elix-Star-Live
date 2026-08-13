/**
 * Host-channel paid gift send + shared success UI effects (send + combo).
 * Never uses test coins.
 */

import { giftSendErrorToast } from '../../../lib/giftSend';
import { resolvePlayableGiftVideoUrl } from './liveGiftIngest';
import { sendLivePaidGift } from './sendLiveGift';
import {
  applyLivePaidGiftSuccessEffects,
  type ApplyLivePaidGiftSuccessEffectsOutcome,
  type LivePaidGiftWalletUiArgs,
} from './applyLivePaidGiftSuccessEffects';

export type SendHostPaidGiftWithSuccessArgs = LivePaidGiftWalletUiArgs & {
  streamKey: string;
  giftId: string;
  giftVideo?: string | null;
  battleTarget?: 'host' | 'opponent' | 'player3' | 'player4';
  cohostTargetUserId?: string | null;
  isBattleMode: boolean;
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
