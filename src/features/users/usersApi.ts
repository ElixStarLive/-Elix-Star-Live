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

export async function fetchProfile(userId: string): Promise<ApiResult<PublicProfile>> {
  const result = await request<unknown>(`/api/users/${encodeURIComponent(userId)}`);
  if (result.error) return { data: null, error: result.error };
  if (!isProfile(result.data)) {
    return { data: null, error: { code: 'invalid_response', message: 'Unexpected profile response.', status: 0 } };
  }
  return { data: result.data, error: null };
}
