import { getApiBase } from './api';

function getAuthHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
async function apiPost(path: string, body: any): Promise<any> {
  const base = getApiBase();
  const url = base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : path;
  const res = await fetchWithTimeout(url, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(body), credentials: 'include' }, 7000);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

async function apiGet(path: string): Promise<any> {
  const base = getApiBase();
  const url = base ? `${base}${path.startsWith('/') ? path : `/${path}`}` : path;
  const res = await fetchWithTimeout(url, { headers: getAuthHeaders(), credentials: 'include' }, 7000);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error');
  }
  return res.json();
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
  } catch {
    // Single connection: backend API only; no fallback
  }
}

export async function trackLike(videoId: string): Promise<void> {
  try {
    await apiPost('/api/feed/track-interaction', { videoId, type: 'like' });
  } catch {
    // fallback handled in store
  }
}

export async function trackComment(videoId: string, text: string): Promise<void> {
  try {
    await apiPost('/api/feed/track-interaction', { videoId, type: 'comment', data: { text } });
  } catch {
    // fallback
  }
}

export async function trackShare(videoId: string, platform: string = 'copy'): Promise<void> {
  try {
    await apiPost('/api/feed/track-interaction', { videoId, type: 'share', data: { platform } });
  } catch {
    // fallback
  }
}

export async function trackFollow(targetUserId: string, videoId?: string): Promise<void> {
  try {
    await apiPost('/api/feed/track-interaction', { videoId: videoId || '', type: 'follow', data: { targetUserId } });
  } catch {
    // fallback
  }
}

export async function fetchForYouFeed(page: number = 1, limit: number = 20): Promise<{
  videos: any[];
  mutualUserIds?: string[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
  source: string;
}> {
  return await apiGet(`/api/feed/foryou?page=${page}&limit=${limit}`);
}

export async function getVideoScore(videoId: string): Promise<any> {
  try {
    const result = await apiGet(`/api/feed/score/${videoId}`);
    return result.score;
  } catch {
    return null;
  }
}

export function cleanupAllViews() {
  for (const [videoId] of activeViews) {
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
