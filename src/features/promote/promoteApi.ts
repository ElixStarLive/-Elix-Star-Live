import { request } from '../../lib/apiClient';

export async function apiPromoteIapComplete(payload: {
  transactionId: string;
  receipt: string;
  productId: string;
  provider: 'apple' | 'google';
  contentType: string;
  contentId: string;
}): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>('/api/promote-iap-complete', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.success) return { ok: false, error: String(data?.error || 'Failed to complete promote') };
  return { ok: true, error: null };
}
