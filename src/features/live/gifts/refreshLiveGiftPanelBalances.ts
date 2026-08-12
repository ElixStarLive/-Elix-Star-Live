/**
 * Shared GiftPanel / live-entry wallet refresh — paid/starter/promo into useWalletStore only.
 */

import { apiFetchWallet } from '../../wallet/walletApi';
import {
  apiLiveEngagementWallet,
  apiLiveProgressionMe,
} from '../engagement/liveEngagementApi';
import { useWalletStore } from '../../../store/useWalletStore';
import { reportFailure } from '../../../lib/reportFailure';
import { showToast } from '../../../lib/toast';

export type RefreshLiveGiftPanelBalancesArgs = {
  /** Sync spend-check ref for paid coins (host/spectator controllers). */
  walletCoinBalanceRef?: { current: number };
};

export type LiveGiftWalletBootstrap = {
  paid: number;
  starter: number;
  promo: number;
  currentLevel: number;
  totalXp: number;
};

/**
 * One-shot load for live entry: wallet + starter progression + promo engagement.
 * Applies to useWalletStore and returns numbers for giftSource / level UI.
 */
export async function loadLiveGiftWalletBootstrap(
  walletCoinBalanceRef?: { current: number },
): Promise<LiveGiftWalletBootstrap | null> {
  try {
    const [wallet, progression, engagementWallet] = await Promise.all([
      apiFetchWallet(),
      apiLiveProgressionMe(),
      apiLiveEngagementWallet(),
    ]);
    const paid =
      !wallet.error && wallet.balances != null
        ? Math.max(0, wallet.balances.paid)
        : 0;
    if (walletCoinBalanceRef) walletCoinBalanceRef.current = paid;
    const p = (progression.data?.progression ?? null) as Record<
      string,
      unknown
    > | null;
    const starter = Math.max(0, Number(p?.starter_coin_balance) || 0);
    const ew = engagementWallet.data?.wallet as Record<string, number> | undefined;
    const promo = Math.max(
      0,
      Number(ew?.promotionalCoins ?? ew?.promotional_coins ?? 0) || 0,
    );
    useWalletStore.getState().applyServerBalances({
      paid,
      starter,
      promotional: promo,
    });
    return {
      paid,
      starter,
      promo,
      currentLevel: Math.max(0, Number(p?.current_level) || 0),
      totalXp: Math.max(0, Number(p?.total_xp) || 0),
    };
  } catch (err) {
    reportFailure('live_gift_wallet_bootstrap', err);
    return null;
  }
}

/**
 * Fetch wallet + starter progression + promo engagement balances and apply to store.
 * Fire-and-forget safe; surfaces toasts on failure (same UX as prior controllers).
 */
export function refreshLiveGiftPanelBalances(
  args: RefreshLiveGiftPanelBalancesArgs = {},
): void {
  const { walletCoinBalanceRef } = args;

  void apiFetchWallet()
    .then(({ balances, error: walletErr }) => {
      if (!walletErr && balances) {
        const walletBal = Math.max(0, balances.paid);
        if (walletCoinBalanceRef) walletCoinBalanceRef.current = walletBal;
        useWalletStore.getState().applyServerBalances({
          paid: walletBal,
          starter: balances.starter,
          promotional: balances.promotional,
        });
      } else if (walletErr) {
        reportFailure('live_gift_panel_wallet', walletErr);
        showToast('Could not load wallet balance');
      }
    })
    .catch((err) => {
      reportFailure('live_gift_panel_wallet', err);
      showToast('Could not load wallet balance');
    });

  void apiLiveProgressionMe()
    .then(({ data, error }) => {
      if (!error && data?.progression) {
        const progression = data.progression as Record<string, unknown>;
        const starter = Math.max(
          0,
          Number(progression.starter_coin_balance) || 0,
        );
        useWalletStore.getState().applyServerBalances({ starter });
      } else if (error) {
        showToast('Could not load starter coins');
      }
    })
    .catch(() => {
      showToast('Could not load starter coins');
    });

  void apiLiveEngagementWallet()
    .then(({ data, error }) => {
      if (!error && data?.wallet) {
        const ew = data.wallet as Record<string, number>;
        const promo = Math.max(
          0,
          Number(ew.promotionalCoins ?? ew.promotional_coins ?? 0) || 0,
        );
        useWalletStore.getState().applyServerBalances({ promotional: promo });
      } else if (error) {
        showToast('Could not load promo coins');
      }
    })
    .catch(() => {
      showToast('Could not load promo coins');
    });
}
