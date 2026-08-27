import { request, type ApiResult } from '../../lib/apiClient';

export interface Product {
  id: string;
  name: string;
  description: string;
  priceGbp: number;
  imageUrl: string;
  stock: number;
}

export async function fetchProducts(): Promise<ApiResult<{ products: Product[] }>> {
  return request<{ products: Product[] }>('/api/shop/products');
}

export async function createOrder(productId: string, quantity: number): Promise<ApiResult<{ id: string }>> {
  return request<{ id: string }>('/api/shop/orders', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity }),
  });
}
