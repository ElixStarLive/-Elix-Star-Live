/**
 * Upload/Create REST owner.
 * Keeps video creation + FYP boost contracts explicit and centralized.
 */

import { request } from '../../lib/apiClient';

export async function apiCreateVideo(
  payload: Record<string, unknown>,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await request<{ id?: string }>('/api/videos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (error) return { id: null, error: error.message || 'Failed to create video record' };
  return { id: typeof data?.id === 'string' ? data.id : null, error: null };
}

export async function apiBoostVideoFyp(
  videoId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request(`/api/videos/${encodeURIComponent(videoId)}/fyp`, {
    method: 'POST',
    body: JSON.stringify({ boost: true }),
  });
  if (error) return { ok: false, error: error.message || 'FYP boost failed' };
  return { ok: true, error: null };
}
