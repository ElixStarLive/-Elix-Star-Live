/**
 * Shared host↔spectator post-bootstrap UI apply (gift source + level + XP).
 * Spectator may pass extra test-level merge; host uses wallet/progression only.
 */

import type { Dispatch, SetStateAction } from 'react';
import type { GiftSource } from '../../../lib/giftSend';
import {
  resolveGiftSourceFromBalances,
  type LiveGiftWalletBootstrap,
} from './refreshLiveGiftPanelBalances';

export function applyLiveWalletBootstrapUi(opts: {
  boot: LiveGiftWalletBootstrap;
  userLevel: number | undefined | null;
  extraLevelFloor?: number;
  setGiftSource: Dispatch<SetStateAction<GiftSource>> | ((source: GiftSource) => void);
  setUserLevel: Dispatch<SetStateAction<number>> | ((level: number) => void);
  setUserXP: Dispatch<SetStateAction<number>> | ((xp: number) => void);
  updateUserLevel?: (level: number) => void;
}): void {
  const {
    boot,
    userLevel,
    extraLevelFloor = 0,
    setGiftSource,
    setUserLevel,
    setUserXP,
    updateUserLevel,
  } = opts;
  setGiftSource(resolveGiftSourceFromBalances(boot));
  const resolvedLevel = Math.max(
    boot.currentLevel,
    extraLevelFloor,
    Number(userLevel) || 0,
  );
  setUserLevel(resolvedLevel);
  if (boot.currentLevel > 0) updateUserLevel?.(boot.currentLevel);
  setUserXP(boot.totalXp);
}
