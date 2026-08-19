/**
 * Single Live gift send path for paid/starter/promo — giftSend owner only.
 * Test-coin branch stays caller-side (local debit + WS gift_sent).
 */

import {
  sendGift,
  giftSendErrorToast,
  type GiftChannel,
  type GiftSource,
  type SendGiftResult,
} from '../../../lib/giftSend';

type SendLiveGiftArgs = {
  giftId: string;
  streamKey: string;
  channel: GiftChannel;
  giftSource: GiftSource;
  video?: string | null;
  battleTarget?: 'host' | 'opponent' | 'player3' | 'player4';
  cohostTargetUserId?: string;
  transactionId?: string;
};

export async function sendLivePaidGift(args: SendLiveGiftArgs): Promise<{
  ok: boolean;
  errorToast?: string;
  result?: SendGiftResult | null;
}> {
  const { result, error } = await sendGift({
    giftId: args.giftId,
    streamKey: args.streamKey,
    channel: args.channel,
    giftSource: args.giftSource,
    video: args.video,
    battleTarget: args.battleTarget,
    cohostTargetUserId: args.cohostTargetUserId,
    transactionId: args.transactionId,
  });
  if (error || !result) {
    return { ok: false, errorToast: giftSendErrorToast(error || '') };
  }
  return { ok: true, result };
}
