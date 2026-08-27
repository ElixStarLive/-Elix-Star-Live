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

export async function fetchAdminUsers(): Promise<ApiResult<{ users: AdminUser[] }>> {
  return request<{ users: AdminUser[] }>('/api/admin/users');
}
