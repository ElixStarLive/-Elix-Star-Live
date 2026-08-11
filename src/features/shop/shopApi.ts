import { request } from '../../lib/apiClient';

export async function apiShopItemsByUser(userId: string): Promise<{
  items: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/shop/items?user_id=${encodeURIComponent(userId)}`,
  );
  if (error) return { items: [], error: error.message };
  return {
    items: Array.isArray(data?.items) ? (data.items as Record<string, unknown>[]) : [],
    error: null,
  };
}

export async function apiShopCheckoutSessionStatus(sessionId: string): Promise<{
  data: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/shop/checkout-session/${encodeURIComponent(sessionId)}`,
  );
  if (error) return { data: null, error: error.message };
  return { data: data ?? null, error: null };
}

export async function apiShopCheckout(payload: {
  items: { id: string; quantity?: number }[];
  /** One UUID per checkout tap — Stripe session idempotency (no duplicate sessions). */
  idempotencyKey?: string;
}): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>('/api/shop/checkout', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (error) return { data: null, error: error.message };
  return { data: data ?? null, error: null };
}
