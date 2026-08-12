/**
 * Feed / video REST owner — same production endpoints as FEED_CONNECTION_MAP.
 * Analytics track-view / track-interaction stay in interactionTracker;
 * re-exported here so callers use one feed surface without duplicate HTTP owners.
 */

import { request } from '../../lib/apiClient';
import {
  fetchForYouFeed,
  trackComment,
  trackFollow,
  trackLike,
  trackShare,
} from '../../lib/interactionTracker';

export { trackComment, trackFollow, trackLike, trackShare };

export interface ForYouFeedPage {
  videos: unknown[];
  mutualUserIds?: string[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
  source: string;
}

/** For You feed list — wraps interactionTracker (same /api/feed/foryou contract). */
export async function apiFetchForYouFeed(
  page: number = 1,
  limit: number = 50,
): Promise<ForYouFeedPage> {
  return fetchForYouFeed(page, limit);
}

export async function apiFetchFollowingIds(
  userId: string,
): Promise<{ following: string[]; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/profiles/${encodeURIComponent(userId)}/following`,
  );
  if (error) return { following: [], error: error.message };
  const following = Array.isArray(data?.following) ? (data.following as string[]) : [];
  return { following, error: null };
}

export async function apiFetchProfiles(): Promise<{
  profiles: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/profiles');
  if (error) return { profiles: [], error: error.message };
  const profiles = Array.isArray(data?.profiles) ? (data.profiles as Record<string, unknown>[]) : [];
  return { profiles, error: null };
}

export async function apiFetchProfileById(
  userId: string,
): Promise<{ body: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/profiles/${encodeURIComponent(userId)}`,
  );
  if (error) return { body: null, error: error.message };
  return { body: data ?? null, error: null };
}

/**
 * Register a profile open. Backend is source of truth for unique viewers vs visits.
 * Safe to call on every open — duplicates do not inflate unique views.
 */
export async function apiRegisterProfileView(
  profileOwnerUserId: string,
): Promise<{
  uniqueViews: number;
  isNewUniqueView: boolean;
  totalVisits: number;
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/profiles/${encodeURIComponent(profileOwnerUserId)}/view`,
    { method: 'POST' },
  );
  if (error) {
    return { uniqueViews: 0, isNewUniqueView: false, totalVisits: 0, error: error.message };
  }
  return {
    uniqueViews: Number(data?.uniqueViews ?? 0) || 0,
    isNewUniqueView: Boolean(data?.isNewUniqueView),
    totalVisits: Number(data?.totalVisits ?? 0) || 0,
    error: null,
  };
}

export async function apiFetchProfileByUsername(
  username: string,
): Promise<{ body: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/profiles/by-username/${encodeURIComponent(username)}`,
  );
  if (error) return { body: null, error: error.message };
  return { body: data ?? null, error: null };
}

export async function apiFetchAllVideos(): Promise<{
  videos: unknown[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/videos');
  if (error) return { videos: [], error: error.message };
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  return { videos, error: null };
}

export async function apiFetchFriendsFeed(): Promise<{
  videos: unknown[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/feed/friends');
  if (error) return { videos: [], error: error.message };
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  return { videos, error: null };
}

export async function apiFetchFollowingFeed(): Promise<{
  videos: unknown[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/feed/following');
  if (error) return { videos: [], error: error.message };
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  return { videos, error: null };
}

export async function apiFetchVideoById(
  videoId: string,
): Promise<{ video: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/videos/${encodeURIComponent(videoId)}`,
  );
  if (error) return { video: null, error: error.message };
  return { video: data ?? null, error: null };
}

export async function apiDeleteVideo(videoId: string): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request(`/api/videos/${videoId}`, { method: 'DELETE' });
  if (error) return { ok: false, error: error.message || 'Failed to delete video' };
  return { ok: true, error: null };
}

export async function apiToggleVideoLike(
  videoId: string,
  liked: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  const path = liked ? `/api/videos/${videoId}/unlike` : `/api/videos/${videoId}/like`;
  const { error } = await request(path, { method: 'POST' });
  if (error) return { ok: false, error: error.message || 'Like failed' };
  return { ok: true, error: null };
}

export async function apiToggleVideoSave(
  videoId: string,
  saved: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  const path = saved ? `/api/videos/${videoId}/unsave` : `/api/videos/${videoId}/save`;
  const { error } = await request(path, { method: 'POST' });
  if (error) return { ok: false, error: error.message || 'Save failed' };
  return { ok: true, error: null };
}

export async function apiToggleFollow(
  userId: string,
  following: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  const path = following
    ? `/api/profiles/${userId}/unfollow`
    : `/api/profiles/${userId}/follow`;
  const { error } = await request(path, { method: 'POST' });
  if (error) return { ok: false, error: error.message || 'Follow request failed' };
  return { ok: true, error: null };
}

export async function apiPostVideoComment(
  videoId: string,
  text: string,
  parentId?: string | null,
): Promise<{ comment: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/videos/${videoId}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ text, parentId: parentId ?? null }),
    },
  );
  if (error) return { comment: null, error: error.message || 'Comment failed' };
  const comment =
    data?.comment && typeof data.comment === 'object'
      ? (data.comment as Record<string, unknown>)
      : null;
  return { comment, error: null };
}

export async function apiDeleteVideoComment(
  videoId: string,
  commentId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request(`/api/videos/${videoId}/comments/${commentId}`, {
    method: 'DELETE',
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function apiToggleCommentLike(
  videoId: string,
  commentId: string,
  action: 'like' | 'unlike',
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request(
    `/api/videos/${videoId}/comments/${commentId}/${action}`,
    { method: 'POST' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function apiTrackFeedView(
  videoId: string,
): Promise<{ ok: boolean; counted: boolean; error: string | null }> {
  const { data, error } = await request<{ accepted?: boolean; counted?: boolean }>(
    '/api/feed/track-view',
    {
      method: 'POST',
      body: JSON.stringify({ videoId }),
    },
  );
  if (error) return { ok: false, counted: false, error: error.message };
  return { ok: true, counted: data?.counted === true, error: null };
}

export async function apiFetchVideoComments(
  videoId: string,
  sort: string = 'newest',
): Promise<{ comments: unknown[]; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/videos/${encodeURIComponent(videoId)}/comments?sort=${encodeURIComponent(sort)}`,
  );
  if (error) return { comments: [], error: error.message };
  const comments = Array.isArray(data?.comments)
    ? data.comments
    : Array.isArray(data?.data)
      ? data.data
      : [];
  return { comments, error: null };
}

export async function apiFetchUserVideos(
  userId: string,
): Promise<{ videos: unknown[]; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/videos/user/${encodeURIComponent(userId)}`,
  );
  if (error) return { videos: [], error: error.message };
  const videos = Array.isArray(data?.videos) ? data.videos : Array.isArray(data) ? data : [];
  return { videos, error: null };
}

export async function apiFetchLikedVideos(
  limit: number = 50,
  offset: number = 0,
): Promise<{ videos: unknown[]; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/videos/liked/list?limit=${limit}&offset=${offset}`,
  );
  if (error) return { videos: [], error: error.message };
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  return { videos, error: null };
}

export async function apiFetchSavedVideos(
  limit: number = 50,
  offset: number = 0,
): Promise<{ videos: unknown[]; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/videos/saved/list?limit=${limit}&offset=${offset}`,
  );
  if (error) return { videos: [], error: error.message };
  const videos = Array.isArray(data?.videos) ? data.videos : [];
  return { videos, error: null };
}

export async function apiLikeVideo(videoId: string): Promise<{ ok: boolean; error: string | null }> {
  return apiToggleVideoLike(videoId, false);
}

export async function apiSaveVideo(videoId: string): Promise<{ ok: boolean; error: string | null }> {
  return apiToggleVideoSave(videoId, false);
}

export async function apiPatchVideoComment(
  videoId: string,
  commentId: string,
  text: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request(
    `/api/videos/${encodeURIComponent(videoId)}/comments/${encodeURIComponent(commentId)}`,
    { method: 'PATCH', body: JSON.stringify({ text }) },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function apiPatchProfile(
  userId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request(`/api/profiles/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function apiFetchHashtag(
  tag: string,
): Promise<{ body: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await request<Record<string, unknown>>(
    `/api/hashtags/${encodeURIComponent(tag.toLowerCase())}`,
  );
  if (error) return { body: null, error: error.message };
  return { body: data ?? null, error: null };
}

export async function apiFetchHashtagVideos(
  tag: string,
): Promise<{ videos: Record<string, unknown>[]; error: string | null }> {
  const { data, error } = await request<Record<string, unknown> | unknown[]>(
    `/api/hashtags/${encodeURIComponent(tag.toLowerCase())}/videos`,
  );
  if (error) return { videos: [], error: error.message };
  const videos = Array.isArray(data)
    ? (data as Record<string, unknown>[])
    : (Array.isArray(data?.videos) ? (data.videos as Record<string, unknown>[]) : []);
  return { videos, error: null };
}
