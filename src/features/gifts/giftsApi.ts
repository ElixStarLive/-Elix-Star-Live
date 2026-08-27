import { request, type ApiResult } from '../../lib/apiClient';

export interface GiftPackage {
  id: string;
  name: string;
  animation: string;
  battlePoints: number;
  financialValueGbp: number;
}

export async function fetchGifts(): Promise<ApiResult<{ gifts: GiftPackage[] }>> {
  return request<{ gifts: GiftPackage[] }>('/api/gifts');
}

export async function sendGift(streamId: string, giftId: string, source: 'test' | 'paid' = 'test'): Promise<ApiResult<{ giftId: string; points: number; source: string; financialValueGbp: number }>> {
  return request<{ giftId: string; points: number; source: string; financialValueGbp: number }>(`/api/live/${encodeURIComponent(streamId)}/gifts`, {
    method: 'POST',
    body: JSON.stringify({ giftId, source }),
  });
}
