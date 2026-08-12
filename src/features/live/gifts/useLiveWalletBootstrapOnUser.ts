/**
 * Shared host↔spectator wallet bootstrap on user mount.
 */

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { GiftSource } from '../../../lib/giftSend';
import { showToast } from '../../../lib/toast';
import {
  loadLiveGiftWalletBootstrap,
  type LiveGiftWalletBootstrap,
} from './refreshLiveGiftPanelBalances';
import { applyLiveWalletBootstrapUi } from './applyLiveWalletBootstrapUi';

export type UseLiveWalletBootstrapOnUserOpts = {
  userId: string | undefined;
  userLevel: number | undefined | null;
  walletCoinBalanceRef?: MutableRefObject<number>;
  setGiftSource: Dispatch<SetStateAction<GiftSource>> | ((source: GiftSource) => void);
  setUserLevel: Dispatch<SetStateAction<number>> | ((level: number) => void);
  setUserXP: Dispatch<SetStateAction<number>> | ((xp: number) => void);
  updateUserLevel?: (level: number) => void;
  /** Called each bootstrap settle (null = wallet load failed). */
  onBeforeApply?: (boot: LiveGiftWalletBootstrap | null) => void;
  /** Extra level floor at apply time (e.g. spectator test-coin local level). */
  getExtraLevelFloor?: () => number;
};

export function useLiveWalletBootstrapOnUser(opts: UseLiveWalletBootstrapOnUserOpts): void {
  const {
    userId,
    userLevel,
    walletCoinBalanceRef,
    setGiftSource,
    setUserLevel,
    setUserXP,
    updateUserLevel,
    onBeforeApply,
    getExtraLevelFloor,
  } = opts;

  const onBeforeApplyRef = useRef(onBeforeApply);
  onBeforeApplyRef.current = onBeforeApply;
  const getExtraLevelFloorRef = useRef(getExtraLevelFloor);
  getExtraLevelFloorRef.current = getExtraLevelFloor;
  const updateUserLevelRef = useRef(updateUserLevel);
  updateUserLevelRef.current = updateUserLevel;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    setUserLevel(userLevel ?? 0);
    setUserXP(0);

    void loadLiveGiftWalletBootstrap(walletCoinBalanceRef).then((boot) => {
      if (cancelled) return;
      onBeforeApplyRef.current?.(boot);
      if (!boot) {
        showToast('Could not load wallet balance');
        return;
      }
      applyLiveWalletBootstrapUi({
        boot,
        userLevel,
        extraLevelFloor: getExtraLevelFloorRef.current?.() ?? 0,
        setGiftSource,
        setUserLevel,
        setUserXP,
        updateUserLevel: updateUserLevelRef.current,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, userLevel, walletCoinBalanceRef, setGiftSource, setUserLevel, setUserXP]);
}
