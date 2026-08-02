import { request } from '../../lib/apiClient';
import { authGetMe } from '../auth/authSession';

export async function apiGetCurrentUserId(): Promise<{
  userId: string | null;
  error: string | null;
}> {
  const me = await authGetMe();
  if (!me.ok || !('user' in me)) {
    return { userId: null, error: 'error' in me ? me.error : 'Not authenticated' };
  }
  const rawId = (me.user as { id?: unknown })?.id;
  const userId = typeof rawId === 'string' && rawId.trim() ? rawId : null;
  if (!userId) return { userId: null, error: 'Not authenticated' };
  return { userId, error: null };
}

export async function apiCreateReport(
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request('/api/reports', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (error) return { ok: false, error: error.message || 'Failed to submit report' };
  return { ok: true, error: null };
}

export async function apiBlockUser(
  blockedUserId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request('/api/block-user', {
    method: 'POST',
    body: JSON.stringify({ blockedUserId }),
  });
  if (error) return { ok: false, error: error.message || 'Failed to block user' };
  return { ok: true, error: null };
}

export async function apiUnblockUser(
  blockedUserId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request('/api/unblock-user', {
    method: 'POST',
    body: JSON.stringify({ blockedUserId }),
  });
  if (error) return { ok: false, error: error.message || 'Failed to unblock user' };
  return { ok: true, error: null };
}

export async function apiSetBlockUserAction(
  blockedUserId: string,
  action: 'block' | 'unblock',
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await request('/api/block-user', {
    method: 'POST',
    body: JSON.stringify({ blockedUserId, action }),
  });
  if (error) return { ok: false, error: error.message || `Failed to ${action} user` };
  return { ok: true, error: null };
}

export async function apiListBlockedUsers(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const { data, error } = await request<Record<string, unknown>>('/api/blocked/list');
  if (error) return { rows: [], error: error.message || 'Failed to load blocked users' };
  const raw = Array.isArray(data)
    ? data
    : (Array.isArray((data as { data?: unknown[] } | null)?.data)
      ? (data as { data: unknown[] }).data
      : []);
  return { rows: raw as Record<string, unknown>[], error: null };
}
