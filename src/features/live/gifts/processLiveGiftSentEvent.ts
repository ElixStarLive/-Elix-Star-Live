/**
 * Pure gift_sent WS parse helpers shared by host + spectator controllers.
 * Role-specific MVP / echo / battle tile / video gates stay in each controller.
 */

import { formatGiftDisplayName, type GiftUiItem } from '../../../lib/giftsCatalog';
import type { LiveMessage } from '../types';
import { extractGiftId, extractGiftTxnId } from './liveGiftIngest';

export type ParsedLiveGiftSentEvent = {
  txnId: string;
  wsGiftId: string;
  giftDef: GiftUiItem | undefined;
  gifterId: string;
  giftCoins: number;
  giftName: string;
  /** Chat-message identity fields (from payload only — no identity-cache fallback). */
  username: string;
  avatar: string;
  level: number;
  cohostTarget: string;
  /** Raw icon path/url before resolveBattleGiftIconUrl. */
  giftIconRaw: string;
  battleTarget: unknown;
  targetCreatorId: string;
  isFlowerOrRose: boolean;
};

function extractCohostTarget(data: Record<string, unknown>): string {
  return (
    (typeof data.cohostTargetUserId === 'string' && data.cohostTargetUserId.trim()) ||
    (typeof data.cohost_target_user_id === 'string' && data.cohost_target_user_id.trim()) ||
    ''
  );
}

export function parseLiveGiftSentEvent(
  data: unknown,
  catalog: GiftUiItem[],
): ParsedLiveGiftSentEvent {
  const payload =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const txnId = extractGiftTxnId(payload);
  const wsGiftId = extractGiftId(payload);
  const giftDef = wsGiftId
    ? catalog.find((g) => g.id === wsGiftId)
    : undefined;
  const gifterId = typeof payload.user_id === 'string' ? payload.user_id : '';
  const targetCreatorId =
    (typeof payload.targetCreatorId === 'string' && payload.targetCreatorId.trim()) ||
    (typeof payload.target_creator_id === 'string' && payload.target_creator_id.trim()) ||
    '';
  const giftCoins =
    giftDef?.coins ??
    (typeof payload.coins === 'number' && Number.isFinite(payload.coins)
      ? payload.coins
      : 0);
  const giftName = formatGiftDisplayName(
    giftDef?.name ||
      (typeof payload.giftName === 'string' && payload.giftName.trim()) ||
      (typeof payload.gift_name === 'string' && payload.gift_name.trim()) ||
      'Gift',
  );
  const username = typeof payload.username === 'string' ? payload.username : 'User';
  const avatar = typeof payload.avatar === 'string' ? payload.avatar : '';
  const level =
    Number.isFinite(Number(payload.level)) && Number(payload.level) >= 0
      ? Math.floor(Number(payload.level))
      : 1;
  const flowerKey = giftName.toLowerCase();

  return {
    txnId,
    wsGiftId,
    giftDef,
    gifterId,
    giftCoins,
    giftName,
    username,
    avatar,
    level,
    cohostTarget: extractCohostTarget(payload),
    giftIconRaw:
      (typeof payload.gift_icon === 'string' && payload.gift_icon) ||
      (typeof giftDef?.icon === 'string' ? giftDef.icon : ''),
    battleTarget: payload.battleTarget ?? payload.battle_target,
    targetCreatorId,
    isFlowerOrRose:
      flowerKey.includes('rose') || flowerKey.includes('flower'),
  };
}

export function buildLiveGiftChatMessage(args: {
  txnId: string;
  giftName: string;
  username: string;
  avatar: string;
  level: number;
}): LiveMessage {
  return {
    id: `gift-ws-${args.txnId || Date.now()}-${Math.random()}`,
    username: args.username,
    text: `sent ${args.giftName}`,
    level: args.level,
    avatar: args.avatar,
    isGift: true,
  };
}
