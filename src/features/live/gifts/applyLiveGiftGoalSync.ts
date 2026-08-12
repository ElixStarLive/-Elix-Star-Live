/**
 * Shared host↔spectator gift_goal_sync WS apply (parse + completion sound).
 */

import type { Dispatch, SetStateAction } from 'react';
import {
  parseLiveGiftGoal,
  type LiveGiftGoal,
  isGiftGoalComplete,
  playGiftGoalReachedSound,
} from '../../../lib/liveGiftGoal';

/** Apply gift-goal payload; null clears. Plays reach sound on first complete. */
export function applyLiveGiftGoalSync(
  data: unknown,
  setGiftGoal: Dispatch<SetStateAction<LiveGiftGoal | null>>,
): void {
  if (data == null) {
    setGiftGoal(null);
    return;
  }
  const parsed = parseLiveGiftGoal(data);
  if (!parsed) return;
  setGiftGoal((prev) => {
    const wasDone = prev ? isGiftGoalComplete(prev) : false;
    if (!wasDone && isGiftGoalComplete(parsed)) {
      playGiftGoalReachedSound();
    }
    return parsed;
  });
}
