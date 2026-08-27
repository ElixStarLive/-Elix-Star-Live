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

export async function fetchAdminEconomy(): Promise<ApiResult<EconomyStats>> {
  return request<EconomyStats>('/api/admin/economy');
}
