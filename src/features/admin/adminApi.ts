import { request, type ApiResult } from '../../lib/apiClient';

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  isVerified: boolean;
  bannedUntil: string | null;
  createdAt: string;
}

export interface AdminReport {
  id: string;
  reporterId: string;
  targetId: string;
  targetType: string;
  reason: string;
  status: string;
  createdAt: string;
}

export async function fetchAdminUsers(): Promise<ApiResult<{ users: AdminUser[] }>> {
  return request<{ users: AdminUser[] }>('/api/admin/users');
}

export interface EconomyStats {
  videos: number;
  users: number;
  follows: number;
  likes: number;
  comments: number;
  liveStreams: number;
  reports: number;
}

export async function fetchAdminReports(): Promise<ApiResult<{ reports: AdminReport[] }>> {
  return request<{ reports: AdminReport[] }>('/api/admin/reports');
}

export interface ProgressionUser {
  id: string;
  username: string;
  displayName: string;
  level: number;
  xp: number;
}

export async function fetchAdminEconomy(): Promise<ApiResult<EconomyStats>> {
  return request<EconomyStats>('/api/admin/economy');
}

export interface AdminChallenge {
  id: string;
  title: string;
  description: string;
  hashtag: string;
  startAt: string;
  endAt: string;
  isActive: boolean;
}

export async function fetchAdminChallenges(): Promise<ApiResult<{ challenges: AdminChallenge[] }>> {
  return request<{ challenges: AdminChallenge[] }>('/api/admin/rising-stars');
}

export async function createAdminChallenge(body: {
  title: string;
  description?: string;
  hashtag?: string;
  days?: number;
}): Promise<ApiResult<{ id: string }>> {
  return request<{ id: string }>('/api/admin/rising-stars', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface PayoutRequest {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  amountGbp: number;
  status: string;
  createdAt: string;
}

export async function fetchAdminPayouts(): Promise<ApiResult<{ requests: PayoutRequest[] }>> {
  return request<{ requests: PayoutRequest[] }>('/api/admin/payouts');
}

export interface AdminProduct {
  id: string;
  name: string;
  description: string;
  priceGbp: number;
  imageUrl: string;
  stock: number;
  isActive: boolean;
}

export interface AdminShopOrder {
  id: string;
  userId: string;
  username: string;
  productName: string;
  quantity: number;
  status: string;
  createdAt: string;
}

export async function fetchAdminProducts(): Promise<ApiResult<{ products: AdminProduct[] }>> {
  return request<{ products: AdminProduct[] }>('/api/admin/products');
}

export async function createAdminProduct(body: {
  name: string;
  description?: string;
  priceGbp: number;
  imageUrl?: string;
  stock: number;
}): Promise<ApiResult<{ id: string }>> {
  return request<{ id: string }>('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface MonetisationStats {
  paidGiftsGbp: number;
  paidCoinsCount: number;
  shopOrdersGbp: number;
  approvedPayoutsGbp: number;
}

export async function fetchAdminMonetisation(): Promise<ApiResult<MonetisationStats>> {
  return request<MonetisationStats>('/api/admin/monetisation');
}

export async function fetchAdminShopOrders(): Promise<ApiResult<{ orders: AdminShopOrder[] }>> {
  return request<{ orders: AdminShopOrder[] }>('/api/admin/shop-orders');
}

export async function updateAdminPayout(requestId: string, status: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/api/admin/payouts/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function fetchAdminProgression(): Promise<ApiResult<{ users: ProgressionUser[] }>> {
  return request<{ users: ProgressionUser[] }>('/api/admin/progression');
}
