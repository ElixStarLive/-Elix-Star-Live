/**
 * Shared room WS handlers: gift_goal_sync + server viewer_count.
 */

import type { Dispatch, SetStateAction } from 'react';
import {
  applyLiveGiftGoalSync,
} from '../gifts/applyLiveGiftGoalSync';
import type { LiveGiftGoal } from '../../../lib/liveGiftGoal';
import { applyServerViewerCount } from '../ws/applyServerViewerCount';

export function createLiveGiftGoalAndViewerCountHandlers(args: {
  isMounted: () => boolean;
  setGiftGoal: Dispatch<SetStateAction<LiveGiftGoal | null>>;
  setViewerCount: Dispatch<SetStateAction<number>>;
}): {
  handleGiftGoalSync: (data: unknown) => void;
  handleViewerCount: (data: unknown) => void;
} {
  const { isMounted, setGiftGoal, setViewerCount } = args;
  return {
    handleGiftGoalSync: (data: unknown) => {
      if (!isMounted()) return;
      applyLiveGiftGoalSync(data, setGiftGoal);
    },
    handleViewerCount: (data: unknown) => {
      if (!isMounted()) return;
      applyServerViewerCount(data, setViewerCount);
    },
  };
}
