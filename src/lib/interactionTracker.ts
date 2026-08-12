/**
 * Feed interaction tracking — uses the single API transport (apiClient.request).
 * Soft-fails tracking posts (analytics); never invents feed success on GET failure
 * beyond an explicit null score.
 */

import { getApiBase } from './api';
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

const activeViews = new Map<string, {
  videoId: string;
  startTime: number;
  lastUpdate: number;
  totalWatchTime: number;
  videoDuration: number;
  completed: boolean;
  replayed: boolean;
  replayCount: number;
  updateInterval: ReturnType<typeof setInterval> | null;
}>();

export function startVideoView(videoId: string, videoDuration: number = 0) {
  stopVideoView(videoId);

  const view = {
    videoId,
    startTime: Date.now(),
    lastUpdate: Date.now(),
    totalWatchTime: 0,
    videoDuration,
    completed: false,
    replayed: false,
    replayCount: 0,
    updateInterval: null as ReturnType<typeof setInterval> | null,
  };

  view.updateInterval = setInterval(() => {
    const elapsed = (Date.now() - view.lastUpdate) / 1000;
    view.totalWatchTime += elapsed;
    view.lastUpdate = Date.now();
  }, 1000);

  activeViews.set(videoId, view);
}

export function markVideoCompleted(videoId: string) {
  const view = activeViews.get(videoId);
  if (view) {
    view.completed = true;
  }
}

export function markVideoReplayed(videoId: string) {
  const view = activeViews.get(videoId);
  if (view) {
    view.replayed = true;
    view.replayCount += 1;
  }
}

export async function stopVideoView(videoId: string) {
  const view = activeViews.get(videoId);
  if (!view) return;

  if (view.updateInterval) {
    clearInterval(view.updateInterval);
    view.updateInterval = null;
  }

  const elapsed = (Date.now() - view.lastUpdate) / 1000;
  view.totalWatchTime += elapsed;

  activeViews.delete(videoId);

  if (view.totalWatchTime < 0.5) return;

  try {
    await apiPost('/api/feed/track-view', {
      videoId: view.videoId,
      watchTime: Math.round(view.totalWatchTime * 100) / 100,
      videoDuration: view.videoDuration,
      completed: view.completed,
      replayed: view.replayed,
      replayCount: view.replayCount,
    });
  } catch (err) {
    reportFailure('feed_track_view', err, { videoId: view.videoId });
  }
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

export async function getVideoScore(videoId: string): Promise<unknown> {
  try {
    const result = await apiGet<{ score?: unknown }>(`/api/feed/score/${videoId}`);
    return result.score;
  } catch (err) {
    reportFailure('feed_video_score', err, { videoId });
    return null;
  }
}

export function cleanupAllViews() {
  const ids = [...activeViews.keys()];
  for (const videoId of ids) {
    stopVideoView(videoId);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    for (const [_videoId, view] of activeViews) {
      if (view.updateInterval) clearInterval(view.updateInterval);
      const elapsed = (Date.now() - view.lastUpdate) / 1000;
      view.totalWatchTime += elapsed;
      if (view.totalWatchTime >= 0.5) {
        const payload = JSON.stringify({
          videoId: view.videoId,
          watchTime: Math.round(view.totalWatchTime * 100) / 100,
          videoDuration: view.videoDuration,
          completed: view.completed,
          replayed: view.replayed,
          replayCount: view.replayCount,
        });
        const base = getApiBase();
        const url = base ? `${base}/api/feed/track-view` : '/api/feed/track-view';
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      }
    }
    activeViews.clear();
  });
}
