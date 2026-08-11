import { request } from '../../lib/apiClient';

export type RepostTargetType = 'live' | 'video';

export type RepostListItem = {
  target_type: RepostTargetType;
  target_id: string;
  created_at: string;
  owner_user_id: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_live: boolean;
  viewer_count: number;
  video_url: string | null;
  thumbnail_url: string | null;
  views: number;
};

/** One tap: create or remove. Server is the only owner — never fake success. */
export async function apiToggleRepost(payload: {
  targetType: RepostTargetType;
  targetId: string;
}): Promise<{ data: { ok: boolean; reposted: boolean } | null; error: string | null }> {
  const { data, error } = await request<{ ok?: boolean; reposted?: boolean }>(
    '/api/reposts/toggle',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
  if (error) return { data: null, error: error.message };
  if (!data || typeof data.reposted !== 'boolean') {
    return { data: null, error: 'Failed to save repost' };
  }
  return { data: { ok: true, reposted: data.reposted }, error: null };
}

export async function apiFetchUserReposts(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<{ items: RepostListItem[]; error: string | null; hasMore: boolean }> {
  const qs = new URLSearchParams({
    user_id: userId,
    limit: String(limit),
    offset: String(offset),
  });
  const { data, error } = await request<{
    items?: RepostListItem[];
    hasMore?: boolean;
  }>(`/api/reposts/list?${qs.toString()}`);
  if (error) return { items: [], error: error.message, hasMore: false };
  const items = Array.isArray(data?.items) ? data!.items! : [];
  return { items, error: null, hasMore: Boolean(data?.hasMore) };
}
