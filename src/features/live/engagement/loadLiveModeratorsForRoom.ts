/**
 * Shared host↔spectator moderator list load for a live room key.
 */

import type { Dispatch, SetStateAction } from 'react';
import { apiLiveListModerators } from './liveEngagementApi';

/**
 * Load moderators for `roomKey`. Empty/broadcast clears the set.
 * Returns cancel fn for effect cleanup.
 */
export function loadLiveModeratorsForRoom(
  roomKey: string | undefined | null,
  setModerators: Dispatch<SetStateAction<Set<string>>>,
): () => void {
  const key = String(roomKey || '').trim();
  if (!key || key === 'broadcast') {
    setModerators(new Set());
    return () => {};
  }
  let cancelled = false;
  void apiLiveListModerators(key).then(({ moderators: ids, error }) => {
    if (cancelled) return;
    if (error) return;
    setModerators(new Set(ids));
  });
  return () => {
    cancelled = true;
  };
}
