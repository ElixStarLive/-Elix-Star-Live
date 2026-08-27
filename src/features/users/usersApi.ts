import { request, type ApiResult } from '../../lib/apiClient';

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  isVerified: boolean;
  isAdmin: boolean;
  followers: number;
  following: number;
  videoCount: number;
}

function isProfile(value: unknown): value is PublicProfile {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.username === 'string' &&
    typeof v.displayName === 'string' &&
    typeof v.avatarUrl === 'string' &&
    typeof v.bio === 'string' &&
    typeof v.isVerified === 'boolean' &&
    typeof v.isAdmin === 'boolean' &&
    typeof v.followers === 'number' &&
    typeof v.following === 'number' &&
    typeof v.videoCount === 'number'
  );
}

export async function fetchMyProfile(): Promise<ApiResult<PublicProfile>> {
  return fetchProfile('me');
}

export async function patchProfile(body: {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}): Promise<ApiResult<{ success: boolean }>> {
  const result = await request<unknown>('/api/users/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (result.error) return { data: null, error: result.error };
  const data = result.data as { success?: boolean } | null;
  if (data === null || typeof data !== 'object' || data.success !== true) {
    return { data: null, error: { code: 'invalid_response', message: 'Unexpected response.', status: 0 } };
  }
  return { data: data as { success: boolean }, error: null };
}

export interface UserPreview {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  isVerified: boolean;
}

export async function fetchFollowers(userId: string): Promise<ApiResult<{ users: UserPreview[] }>> {
  return request<{ users: UserPreview[] }>(`/api/users/${encodeURIComponent(userId)}/followers`);
}

export async function fetchFollowing(userId: string): Promise<ApiResult<{ users: UserPreview[] }>> {
  return request<{ users: UserPreview[] }>(`/api/users/${encodeURIComponent(userId)}/following`);
}

export interface NotificationSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
  likesEnabled: boolean;
  commentsEnabled: boolean;
  followsEnabled: boolean;
  liveEnabled: boolean;
  marketingEnabled: boolean;
}

export async function fetchNotificationSettings(): Promise<ApiResult<NotificationSettings>> {
  return request<NotificationSettings>('/api/users/me/notifications');
}

export async function fetchBlocked(): Promise<ApiResult<{ users: UserPreview[] }>> {
  return request<{ users: UserPreview[] }>('/api/users/me/blocks');
}

export async function blockUser(userId: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/api/users/${encodeURIComponent(userId)}/block`, { method: 'POST' });
}

export async function unblockUser(userId: string): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>(`/api/users/${encodeURIComponent(userId)}/block`, { method: 'DELETE' });
}

export async function changePassword(body: { currentPassword: string; newPassword: string }): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>('/api/users/me/password', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function patchNotificationSettings(body: Partial<NotificationSettings>): Promise<ApiResult<{ success: boolean }>> {
  return request<{ success: boolean }>('/api/users/me/notifications', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function searchUsers(query: string): Promise<ApiResult<{ users: UserPreview[] }>> {
  return request<{ users: UserPreview[] }>(`/api/users?q=${encodeURIComponent(query)}`);
}

export async function fetchProfile(userId: string): Promise<ApiResult<PublicProfile>> {
  const result = await request<unknown>(`/api/users/${encodeURIComponent(userId)}`);
  if (result.error) return { data: null, error: result.error };
  if (!isProfile(result.data)) {
    return { data: null, error: { code: 'invalid_response', message: 'Unexpected profile response.', status: 0 } };
  }
  return { data: result.data, error: null };
}
