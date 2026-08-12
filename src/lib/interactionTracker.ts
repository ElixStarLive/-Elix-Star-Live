/**
 * Feed interaction tracking — uses the single API transport (apiClient.request).
 * Soft-fails tracking posts (analytics); never invents feed success on GET failure
 * beyond an explicit null score.
 */

import { request } from './apiClient';
import { reportFailure } from './reportFailure';

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const { data, error } = await request(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (error) throw new Error(error.message || 'API error');
  return data;
}

async function apiGet<T = unknown>(path: string): Promise<T> {
  const { data, error } = await request<T>(path);
  if (error) throw new Error(error.message || 'API error');
  return data as T;
}

export async function trackLike(videoId: string): Promise<void> {
  try {
    await apiPost('/api/feed/track-interaction', { videoId, type: 'like' });
  } catch (err) {
    reportFailure('feed_track_like', err, { videoId });
  }
}

export async function trackComment(videoId: string, text: string): Promise<void> {
  try {
    await apiPost('/api/feed/track-interaction', { videoId, type: 'comment', data: { text } });
  } catch (err) {
    reportFailure('feed_track_comment', err, { videoId });
  }
}

export async function trackShare(videoId: string, platform: string = 'copy'): Promise<void> {
  try {
    await apiPost('/api/feed/track-interaction', { videoId, type: 'share', data: { platform } });
  } catch (err) {
    reportFailure('feed_track_share', err, { videoId });
  }
}

export async function trackFollow(targetUserId: string, videoId?: string): Promise<void> {
  try {
    await apiPost('/api/feed/track-interaction', { videoId: videoId || '', type: 'follow', data: { targetUserId } });
  } catch (err) {
    reportFailure('feed_track_follow', err, { targetUserId });
  }
}

export async function fetchForYouFeed(page: number = 1, limit: number = 20): Promise<{
  videos: unknown[];
  mutualUserIds?: string[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
  source: string;
}> {
  return await apiGet(`/api/feed/foryou?page=${page}&limit=${limit}`);
}
