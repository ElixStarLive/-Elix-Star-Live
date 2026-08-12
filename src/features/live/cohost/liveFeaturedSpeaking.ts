/**
 * Shared host↔spectator speaking / featured helpers for live stage.
 */

import type { Dispatch, SetStateAction } from 'react';
import { sameUserId } from '../utils/ids';

export function isSpeakingUserId(
  speakingIds: Iterable<string>,
  userId?: string | null,
): boolean {
  return !!userId && [...speakingIds].some((id) => sameUserId(id, userId));
}

/** Toggle featured co-host identity; clears when the same id is tapped again. */
export function toggleFeaturedUserId(
  setFeaturedUserId: Dispatch<SetStateAction<string | null>>,
  userId: string,
): void {
  setFeaturedUserId((prev) => (sameUserId(prev, userId) ? null : userId));
}
