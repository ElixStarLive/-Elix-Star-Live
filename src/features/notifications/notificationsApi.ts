import { request } from '../../lib/apiClient';
import { apiFetchFollowingIds, apiFetchProfiles, apiToggleFollow } from '../feed/feedApi';
import { apiLiveStreams } from '../../lib/live';

export async function apiListNotifications(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/notifications');
  if (error) return { rows: [], error: error.message };
  const rows = Array.isArray(data) ? data : (Array.isArray(data?.notifications) ? data.notifications : []);
  return { rows: rows as Record<string, unknown>[], error: null };
}

export async function apiMarkNotificationsRead(ids: string[]): Promise<{ ok: boolean; error: string | null }> {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, error: null };
  const { error } = await request('/api/notifications/read', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function apiListMyFollowingIds(userId: string): Promise<{
  ids: string[];
  error: string | null;
}> {
  const r = await apiFetchFollowingIds(userId);
  return { ids: r.following, error: r.error };
}

export async function apiToggleInboxFollow(
  targetUserId: string,
  wasFollowing: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  return apiToggleFollow(targetUserId, wasFollowing);
}

export async function apiListFollowers(userId: string): Promise<{
  body: Record<string, unknown> | null;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/profiles/${encodeURIComponent(userId)}/followers`,
  );
  if (error) return { body: null, error: error.message };
  return { body: data, error: null };
}

export async function apiListSuggestedUsersInput(): Promise<{
  profiles: Record<string, unknown>[];
  streams: Record<string, unknown>[];
  error: string | null;
}> {
  const [profilesResult, streamsResult] = await Promise.all([
    apiFetchProfiles(),
    apiLiveStreams(),
  ]);
  if (profilesResult.error) {
    return { profiles: [], streams: [], error: profilesResult.error };
  }
  if (streamsResult.error) {
    return {
      profiles: profilesResult.profiles,
      streams: [],
      error: streamsResult.error,
    };
  }
  return {
    profiles: profilesResult.profiles,
    streams: streamsResult.streams as Record<string, unknown>[],
    error: null,
  };
}

export async function apiListActivityItems(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/activity');
  if (error) return { rows: [], error: error.message };
  const rows = Array.isArray(data?.activities) ? data.activities : [];
  return { rows: rows as Record<string, unknown>[], error: null };
}

export async function apiListLiveShareRequests(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/inbox/live-share-requests');
  if (error) return { rows: [], error: error.message };
  const rows = Array.isArray(data?.items) ? data.items : [];
  return { rows: rows as Record<string, unknown>[], error: null };
}
