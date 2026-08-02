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

export async function apiCreatorWithdraw(payload: {
  coins_amount: number;
  payout_method_id: string | null;
}): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/creator/withdraw', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (error) return { data: null, error: error.message };
  return { data: data ?? null, error: null };
}
