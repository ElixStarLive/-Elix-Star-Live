/**
 * Shared live GiftPanel wallet display bindings.
 * Paid/starter/promo balances are owned solely by useWalletStore.
 * Controllers keep only giftSource UI selection + a paid spend-check ref.
 */

import { useEffect, useRef, useState } from 'react';
import { useWalletStore } from '../../../store/useWalletStore';
import type { GiftSource } from '../../../lib/giftSend';

export function useLiveWalletDisplay(userId: string | undefined) {
  const walletCoinBalanceRef = useRef(0);
  const [giftSource, setGiftSource] = useState<GiftSource>('paid_coins');
  const storePaidBalance = useWalletStore((s) => s.paidBalance);
  const storeStarterBalance = useWalletStore((s) => s.starterBalance);
  const storePromoBalance = useWalletStore((s) => s.promotionalBalance);

  const coinBalance = storePaidBalance;
  const starterCoinBalance = storeStarterBalance;
  const promotionalCoinBalance = storePromoBalance;

  useEffect(() => {
    if (!userId) return;
    walletCoinBalanceRef.current = storePaidBalance;
  }, [storePaidBalance, userId]);

  return {
    coinBalance,
    starterCoinBalance,
    promotionalCoinBalance,
    giftSource,
    setGiftSource,
    walletCoinBalanceRef,
    storePaidBalance,
    storeStarterBalance,
    storePromoBalance,
  };
}
