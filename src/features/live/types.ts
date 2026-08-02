/** Shared Live feature types — host + spectator. */

export type LiveMessage = {
  id: string;
  username: string;
  text: string;
  level?: number;
  isGift?: boolean;
  avatar?: string;
  isSystem?: boolean;
  membershipIcon?: string;
  isMod?: boolean;
  stickerUrl?: string;
};

export type UniverseTickerMessage = {
  id: string;
  sender: string;
  receiver: string;
};

export type LiveViewer = {
  id: string;
  username: string;
  displayName: string;
  level: number;
  avatar: string;
  country: string;
  joinedAt: number;
  isActive: boolean;
  chatFrequency: number;
  supportDays: number;
  lastVisitDaysAgo: number;
};

export type BattleState = 'LIVE_SOLO' | 'INVITING' | 'IN_BATTLE' | 'ENDED';

export type BattleSlot = {
  userId: string;
  name: string;
  status: 'empty' | 'invited' | 'accepted';
  avatar: string;
};

export type CoHost = {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  status: 'invited' | 'pending_accept' | 'accepted' | 'live' | 'empty';
  isMuted?: boolean;
};

export type GiftSource = 'starter_coins' | 'paid_coins' | 'promotional_coins';

export type LiveRoleKind = 'host' | 'battle_joiner' | 'spectator' | 'cohost';
