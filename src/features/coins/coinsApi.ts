import { request, type ApiResult } from '../../lib/apiClient';

export interface CoinPackage {
  id: string;
  platform: string;
  name: string;
  coins: number;
  priceGbp: number;
  productId: string;
}

export async function fetchCoinPackages(): Promise<ApiResult<{ packages: CoinPackage[] }>> {
  return request<{ packages: CoinPackage[] }>('/api/coin-packages');
}

export async function recordCoinPurchase(body: {
  packageId?: string;
  platformProductId: string;
  receiptToken: string;
  platform: 'ios' | 'android';
}): Promise<ApiResult<{ id: string; status: string; coins: number }>> {
  return request<{ id: string; status: string; coins: number }>('/api/coin-purchases', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
