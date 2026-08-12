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

/** Server refused publish — do not retry; the grant is the owner. */
export function isLivePublishDenied(error: string | null | undefined): boolean {
  const m = String(error || '').toLowerCase();
  return m.includes('not authorized') || m.includes('http_403');
}

/** Network / 5xx — token endpoint itself failed, not an authorization decision. */
export function isLiveTokenTransient(error: string | null | undefined): boolean {
  const m = String(error || '').toLowerCase();
  return (
    m.includes('http_5') ||
    m.includes('503') ||
    m.includes('database_unavailable') ||
    m.includes('failed to fetch') ||
    m.includes('network') ||
    m.includes('timeout') ||
    m.includes('econnreset')
  );
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

/** Host user ids currently on air (for avatar live rings). Do not add room/stream keys — those false-positive other users. */
export function collectLiveUserIds(streams: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const raw of streams || []) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    for (const v of [s.hostUserId, s.userId, s.user_id]) {
      const id = v != null ? String(v).trim() : '';
      if (id) out.add(id);
    }
  }
  return out;
}

export function isUserLive(streams: unknown[], userId: string): boolean {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  return collectLiveUserIds(streams).has(uid);
}

/** Best /watch/:streamId target for a user who is currently live. */
export function findLiveWatchTarget(streams: unknown[], userId: string): string | null {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  for (const raw of streams || []) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const hosts = [s.hostUserId, s.userId, s.user_id]
      .map((v) => (v != null ? String(v).trim() : ''))
      .filter(Boolean);
    if (!hosts.includes(uid)) continue;
    const key =
      s.stream_key ?? s.streamKey ?? s.room_id ?? s.roomId ?? s.hostUserId ?? s.userId ?? s.user_id;
    if (key != null && String(key).trim()) return String(key).trim();
  }
  return null;
}
