/**
 * Wallet REST owner — paid/starter/promotional balances from /api/wallet/.
 * IAP coin crediting stays in lib/iap.ts; test coins stay local-only.
 */

import { request } from '../../lib/apiClient';

export interface WalletBalances {
  paid: number;
  starter: number;
  promotional: number;
}

function nonNeg(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

export function parseWalletBalances(data: Record<string, unknown> | null | undefined): WalletBalances {
  return {
    paid: nonNeg(data?.coin_balance ?? data?.balance ?? data?.paid_balance),
    starter: nonNeg(data?.starter_balance ?? data?.starter_coins),
    promotional: nonNeg(data?.promotional_balance ?? data?.promotional_coins),
  };
}

export async function apiFetchWallet(): Promise<{
  balances: WalletBalances | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/wallet/');
  if (error) {
    return { balances: null, error: error.message || 'Wallet fetch failed' };
  }
  return { balances: parseWalletBalances(data), error: null };
}
