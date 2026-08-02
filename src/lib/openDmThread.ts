import type { NavigateFunction } from 'react-router-dom';
import { ensureDmThread } from './chatMessages';
import { showToast } from './toast';

/**
 * Opens (or reuses) a DM thread with another user and navigates to /inbox/:threadId.
 * Do not use /inbox/:userId — thread ids and user ids are different.
 */
export async function navigateToDmWithUser(
  otherUserId: string,
  navigate: NavigateFunction,
  _accessToken: string | null | undefined,
): Promise<void> {
  if (!otherUserId) {
    navigate('/inbox');
    return;
  }
  const { threadId, error } = await ensureDmThread(otherUserId);
  if (threadId) {
    navigate(`/inbox/${encodeURIComponent(threadId)}`);
    return;
  }
  showToast(error || 'Could not open chat');
  navigate('/inbox');
}
