/**
 * Live gift wallet — paid / starter / promo via useWalletStore only.
 * Test coins stay in testCoins.ts and must never merge here.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveGiftUiBalance } from '../../../lib/testCoins';
import { useAuthStore } from '../../../store/useAuthStore';
import { useWalletStore } from '../../../store/useWalletStore';
import type { GiftSource } from '../types';
import {
  apiLiveEngagementWallet,
  apiLiveProgressionMe,
} from '../engagement/liveEngagementApi';

export function useLiveWallet() {
  const user = useAuthStore((s) => s.user);
  const storePaid = useWalletStore((s) => s.paidBalance);
  const storeStarter = useWalletStore((s) => s.starterBalance);
  const storePromo = useWalletStore((s) => s.promotionalBalance);

  const walletCoinBalanceRef = useRef(0);
  const [coinBalance, setCoinBalance] = useState(0);
  const [starterCoinBalance, setStarterCoinBalance] = useState(0);
  const [promotionalCoinBalance, setPromotionalCoinBalance] = useState(0);
  const [giftSource, setGiftSource] = useState<GiftSource>('paid_coins');

  useEffect(() => {
    if (!user?.id) return;
    if (giftSource === 'paid_coins') {
      walletCoinBalanceRef.current = storePaid;
      setCoinBalance(resolveGiftUiBalance(storePaid, user.id));
    } else if (giftSource === 'starter_coins') {
      setStarterCoinBalance(storeStarter);
    } else {
      setPromotionalCoinBalance(storePromo);
    }
  }, [storePaid, storeStarter, storePromo, giftSource, user?.id]);

  const refreshWallet = useCallback(async () => {
    if (!user?.id) return;
    const refreshed = await useWalletStore.getState().fetchWallet();
    if (refreshed) {
      const w = useWalletStore.getState();
      walletCoinBalanceRef.current = w.paidBalance;
      setCoinBalance(resolveGiftUiBalance(w.paidBalance, user.id));
      setStarterCoinBalance(w.starterBalance);
      setPromotionalCoinBalance(w.promotionalBalance);
    }
    try {
      const { data } = await apiLiveProgressionMe();
      const starter = Number(
        (data as { starterCoins?: number; starter_coins?: number } | null)?.starterCoins ??
          (data as { starter_coins?: number } | null)?.starter_coins,
      );
      if (Number.isFinite(starter)) setStarterCoinBalance(starter);
    } catch {
      /* non-fatal */
    }
    try {
      const { data } = await apiLiveEngagementWallet();
      const promo = Number(
        (data as { promotionalBalance?: number; promotional_balance?: number } | null)
          ?.promotionalBalance ??
          (data as { promotional_balance?: number } | null)?.promotional_balance,
      );
      if (Number.isFinite(promo)) setPromotionalCoinBalance(promo);
    } catch {
      /* non-fatal */
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshWallet();
  }, [refreshWallet]);

  return {
    walletCoinBalanceRef,
    coinBalance,
    setCoinBalance,
    starterCoinBalance,
    setStarterCoinBalance,
    promotionalCoinBalance,
    setPromotionalCoinBalance,
    giftSource,
    setGiftSource,
    refreshWallet,
  };
}
