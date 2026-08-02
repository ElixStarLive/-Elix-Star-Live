/**
 * Authoritative paid/starter/promo coin balances from the server.
 * Test coins stay local (testCoins.ts) and must never merge into this store.
 */

import { create } from 'zustand';
import { apiFetchWallet } from '../features/wallet/walletApi';

interface WalletState {
  paidBalance: number;
  starterBalance: number;
  promotionalBalance: number;
  lastFetchedAt: number | null;
  isLoading: boolean;
  lastError: string | null;

  fetchWallet: () => Promise<{ ok: boolean; error: string | null }>;
  applyServerBalances: ( partial: {
    paid?: number | null;
    starter?: number | null;
    promotional?: number | null;
  }) => void;
  clear: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  paidBalance: 0,
  starterBalance: 0,
  promotionalBalance: 0,
  lastFetchedAt: null,
  isLoading: false,
  lastError: null,

  fetchWallet: async () => {
    set({ isLoading: true, lastError: null });
    const { balances, error } = await apiFetchWallet();
    if (error || !balances) {
      set({ isLoading: false, lastError: error || 'Wallet fetch failed' });
      return { ok: false, error: error || 'Wallet fetch failed' };
    }
    set({
      paidBalance: balances.paid,
      starterBalance: balances.starter,
      promotionalBalance: balances.promotional,
      lastFetchedAt: Date.now(),
      isLoading: false,
      lastError: null,
    });
    return { ok: true, error: null };
  },

  applyServerBalances: (partial) => {
    set((s) => ({
      paidBalance:
        partial.paid != null && Number.isFinite(Number(partial.paid))
          ? Math.max(0, Number(partial.paid))
          : s.paidBalance,
      starterBalance:
        partial.starter != null && Number.isFinite(Number(partial.starter))
          ? Math.max(0, Number(partial.starter))
          : s.starterBalance,
      promotionalBalance:
        partial.promotional != null && Number.isFinite(Number(partial.promotional))
          ? Math.max(0, Number(partial.promotional))
          : s.promotionalBalance,
      lastFetchedAt: Date.now(),
    }));
  },

  clear: () =>
    set({
      paidBalance: 0,
      starterBalance: 0,
      promotionalBalance: 0,
      lastFetchedAt: null,
      isLoading: false,
      lastError: null,
    }),
}));
