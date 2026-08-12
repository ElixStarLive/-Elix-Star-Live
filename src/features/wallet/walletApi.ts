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

function nonNegOrNull(n: unknown): number | null {
  if (n == null || n === '') return null;
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/** Parse wallet JSON. Returns null when paid balance fields are missing (never invent 0). */
export function parseWalletBalances(
  data: Record<string, unknown> | null | undefined,
): WalletBalances | null {
  if (!data || typeof data !== 'object') return null;
  const paid = nonNegOrNull(data.coin_balance ?? data.balance ?? data.paid_balance);
  if (paid == null) return null;
  return {
    paid,
    starter: nonNegOrNull(data.starter_balance ?? data.starter_coins) ?? 0,
    promotional: nonNegOrNull(data.promotional_balance ?? data.promotional_coins) ?? 0,
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
  const balances = parseWalletBalances(data);
  if (!balances) {
    return { balances: null, error: 'Wallet response missing paid balance' };
  }
  return { balances, error: null };
}
