/**
 * Typed Live REST contracts — same production endpoints as LIVE_CONNECTION_MAP.
 * UI pages must not invent alternate live HTTP paths.
 */

import { request } from '../apiClient';

export interface LiveKitCreds {
  token: string;
  url: string;
}

export async function apiLiveStart(body: {
  room: string;
  /** Server contract: displayName (not title). */
  displayName?: string;
}): Promise<{ creds: LiveKitCreds | null; error: string | null; raw: Record<string, unknown> | null }> {
  const { data, error } = await request<Record<string, unknown>>('/api/live/start', {
    method: 'POST',
    body: JSON.stringify({
      room: body.room,
      displayName: body.displayName,
    }),
  });
  if (error) return { creds: null, error: error.message, raw: null };
  const token = typeof data?.token === 'string' ? data.token : '';
  const url = typeof data?.url === 'string' ? data.url.trim() : '';
  if (!token) return { creds: null, error: 'Missing LiveKit token from /api/live/start', raw: data };
  return { creds: { token, url }, error: null, raw: data };
}

export async function apiLiveEnd(room: string): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request('/api/live/end', {
    method: 'POST',
    body: JSON.stringify({ room }),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function apiLiveToken(
  room: string,
  publish: boolean,
): Promise<{ creds: LiveKitCreds | null; error: string | null }> {
  return apiLiveTokenWithIdentity(room, publish);
}

export async function apiLiveTokenWithIdentity(
  room: string,
  publish: boolean,
  identity?: string,
): Promise<{ creds: LiveKitCreds | null; error: string | null }> {
  const identityQ = identity ? `&identity=${encodeURIComponent(identity)}` : '';
  const q = `room=${encodeURIComponent(room)}&publish=${publish ? '1' : '0'}${identityQ}`;
  const { data, error } = await request<Record<string, unknown>>(`/api/live/token?${q}`);
  if (error) return { creds: null, error: error.message };
  const token = typeof data?.token === 'string' ? data.token : '';
  const url = typeof data?.url === 'string' ? data.url.trim() : '';
  if (!token) return { creds: null, error: 'Missing LiveKit token' };
  return { creds: { token, url }, error: null };
}

export async function apiLiveStreams(): Promise<{
  streams: unknown[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/live/streams');
  if (error) return { streams: [], error: error.message };
  const raw = data?.streams ?? data?.data ?? [];
  return { streams: Array.isArray(raw) ? raw : [], error: null };
}
