import { request } from '../../lib/apiClient';

export async function apiCreatorBalance(): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/creator/balance');
  if (error) return { data: null, error: error.message };
  return { data: data ?? null, error: null };
}

export async function apiCreatorPayoutMethods(): Promise<{
  methods: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/creator/payout-methods');
  if (error) return { methods: [], error: error.message };
  return {
    methods: Array.isArray(data?.methods) ? (data.methods as Record<string, unknown>[]) : [],
    error: null,
  };
}

export async function apiCreatorPayoutRequests(): Promise<{
  payouts: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/creator/payouts');
  if (error) return { payouts: [], error: error.message };
  return {
    payouts: Array.isArray(data?.payouts) ? (data.payouts as Record<string, unknown>[]) : [],
    error: null,
  };
}

export async function apiCreatorSavePayoutMethod(payload: {
  type: 'bank' | 'paypal';
  details: Record<string, unknown>;
}): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request('/api/creator/payout-method', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function apiCreatorWithdrawGbp(payload: {
  amount_pence: number;
  idempotency_key: string;
}): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/creator/withdraw-gbp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (error) return { data: null, error: error.message };
  return { data: data ?? null, error: null };
}

export async function apiCreatorGbpWithdrawals(): Promise<{
  withdrawals: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/creator/withdrawals-gbp');
  if (error) return { withdrawals: [], error: error.message };
  return {
    withdrawals: Array.isArray(data?.withdrawals)
      ? (data.withdrawals as Record<string, unknown>[])
      : [],
    error: null,
  };
}

export async function apiCreatorLedger(): Promise<{
  ledger: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/creator/ledger');
  if (error) return { ledger: [], error: error.message };
  return {
    ledger: Array.isArray(data?.ledger) ? (data.ledger as Record<string, unknown>[]) : [],
    error: null,
  };
}
