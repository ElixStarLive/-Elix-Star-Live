/**
 * Single client owner for paid/starter/promo gift REST send.
 * Server owns debit + room broadcast (gift_sent). Client must not dual-send money gifts on WS.
 */

import { Capacitor } from '@capacitor/core';
import { request } from './apiClient';
import { useWalletStore } from '../store/useWalletStore';

export type GiftSource = 'starter_coins' | 'paid_coins' | 'promotional_coins';

/** Wire channel — host uses platform name; spectator uses `spectator`. */
export type GiftChannel = 'spectator' | 'ios' | 'android' | 'web' | 'host';

export interface SendGiftParams {
  streamKey: string;
  giftId: string;
  channel: GiftChannel;
  giftSource: GiftSource;
  /** Client-generated idempotency key (required by server). */
  transactionId?: string;
  video?: string | null;
  battleTarget?: 'host' | 'opponent' | 'player3' | 'player4';
  cohostTargetUserId?: string;
}

export interface SendGiftResult {
  transactionId: string;
  newBalance: number | null;
  newStarterBalance: number | null;
  newPromotionalBalance: number | null;
  giftSource: string | null;
  newLevel: number | null;
  totalXp: number | null;
  leveledUp: boolean;
}

function wireChannel(channel: GiftChannel): string {
  if (channel !== 'host') return channel;
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : 'web';
}

/**
 * POST /api/gifts/send — authoritative debit + server broadcast.
 * Returns a verified transactionId or a visible error string.
 */
export async function sendGift(
  params: SendGiftParams,
): Promise<{ result: SendGiftResult | null; error: string | null }> {
  const streamKey = params.streamKey?.trim();
  const giftId = params.giftId?.trim();
  if (!streamKey || !giftId) {
    return { result: null, error: 'Missing stream or gift.' };
  }

  const transactionId =
    (params.transactionId && params.transactionId.trim()) ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `gift-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  const { data, error } = await request<Record<string, unknown>>('/api/gifts/send', {
    method: 'POST',
    body: JSON.stringify({
      streamKey,
      giftId,
      channel: wireChannel(params.channel),
      transaction_id: transactionId,
      gift_source: params.giftSource,
      ...(params.video
        ? { video: params.video, animation_url: params.video }
        : {}),
      ...(params.battleTarget ? { battleTarget: params.battleTarget } : {}),
      ...(params.cohostTargetUserId
        ? { cohostTargetUserId: params.cohostTargetUserId }
        : {}),
    }),
  });

  if (error) {
    return { result: null, error: error.message || 'Gift failed' };
  }

  const txn =
    (typeof data?.transaction_id === 'string' && data.transaction_id) ||
    (typeof data?.transactionId === 'string' && data.transactionId) ||
    transactionId;

  if (!txn) {
    return { result: null, error: 'Gift failed — missing transaction id' };
  }

  let newBalance =
    data?.new_balance != null && Number.isFinite(Number(data.new_balance))
      ? Number(data.new_balance)
      : null;
  let newStarterBalance =
    data?.new_starter_balance != null &&
    Number.isFinite(Number(data.new_starter_balance))
      ? Number(data.new_starter_balance)
      : null;
  let newPromotionalBalance =
    data?.new_promotional_balance != null &&
    Number.isFinite(Number(data.new_promotional_balance))
      ? Number(data.new_promotional_balance)
      : null;

  useWalletStore.getState().applyServerBalances({
    paid: newBalance,
    starter: newStarterBalance,
    promotional: newPromotionalBalance,
  });

  const sourceBalance =
    params.giftSource === 'starter_coins'
      ? newStarterBalance
      : params.giftSource === 'promotional_coins'
        ? newPromotionalBalance
        : newBalance;

  if (sourceBalance == null) {
    // Gift may already be debited server-side — refresh wallet; never invent a balance.
    const refreshed = await useWalletStore.getState().fetchWallet();
    if (!refreshed.ok) {
      return {
        result: null,
        error:
          'Gift may have completed but balance could not be confirmed. Check wallet before sending again.',
      };
    }
    const w = useWalletStore.getState();
    newBalance = w.paidBalance;
    newStarterBalance = w.starterBalance;
    newPromotionalBalance = w.promotionalBalance;
  }

  return {
    result: {
      transactionId: txn,
      newBalance,
      newStarterBalance,
      newPromotionalBalance,
      giftSource: typeof data?.gift_source === 'string' ? data.gift_source : null,
      newLevel: data?.new_level != null ? Number(data.new_level) : null,
      totalXp: data?.total_xp != null ? Number(data.total_xp) : null,
      leveledUp: Boolean(data?.leveled_up),
    },
    error: null,
  };
}

/** Map REST gift errors to a short user-visible toast. */
export function giftSendErrorToast(message: string): string {
  const msg = message || '';
  if (msg.includes('frozen')) return 'Account is frozen. Contact support.';
  if (
    msg.includes('INSUFFICIENT') ||
    msg.includes('insufficient_funds') ||
    msg.includes('insufficient')
  ) {
    return 'Not enough coins';
  }
  if (msg.includes('INVALID_COHOST_TARGET')) {
    return 'That co-host is no longer available';
  }
  if (msg.includes('STREAM_NOT_LIVE')) return 'Stream is not live';
  return msg || 'Gift failed';
}
