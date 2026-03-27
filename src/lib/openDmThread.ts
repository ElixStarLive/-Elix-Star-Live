import type { NavigateFunction } from 'react-router-dom';
import { apiUrl } from './api';

/**
 * Opens (or reuses) a DM thread with another user and navigates to /inbox/:threadId.
 * Do not use /inbox/:userId — thread ids and user ids are different.
 */
export async function navigateToDmWithUser(
  otherUserId: string,
  navigate: NavigateFunction,
  accessToken: string | null | undefined,
): Promise<void> {
  if (!otherUserId) {
    navigate('/inbox');
    return;
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    const res = await fetch(apiUrl('/api/chat/threads'), {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ user2_id: otherUserId }),
    });
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    const id = (body?.data as { id?: string } | undefined)?.id;
    if (res.ok && id) {
      navigate(`/inbox/${encodeURIComponent(id)}`);
      return;
    }
  } catch {
    /* fall through */
  }
  navigate('/inbox');
}
