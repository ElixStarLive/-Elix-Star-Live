import type { NavigateFunction } from 'react-router-dom';
import { request } from './apiClient';

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
  try {
    const { data: body, error } = await request('/api/chat/threads', {
      method: 'POST',
      body: JSON.stringify({ user2_id: otherUserId }),
    });
    const id = (body?.data as { id?: string } | undefined)?.id;
    if (!error && id) {
      navigate(`/inbox/${encodeURIComponent(id)}`);
      return;
    }
  } catch {
    /* fall through */
  }
  navigate('/inbox');
}
