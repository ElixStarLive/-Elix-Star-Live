/**
 * Shared host↔spectator engagement missions progress load (watch + gifts_sent).
 */

import type { Dispatch, SetStateAction } from 'react';
import { apiLiveEngagementMissions } from './liveEngagementApi';
import { reportFailure } from '../../../lib/reportFailure';

type LiveEngagementMissionsSetters = {
  setMissionWatchMin: Dispatch<SetStateAction<number>>;
  setMissionWatchGoal: Dispatch<SetStateAction<number>>;
  setMissionGiftsSent: Dispatch<SetStateAction<number>>;
  setMissionGiftsGoal: Dispatch<SetStateAction<number>>;
};

/** Fetch missions and write watch_minutes / gifts_sent into the shared setters. */
export function loadLiveEngagementMissionsProgress(
  userId: string | undefined,
  setters: LiveEngagementMissionsSetters,
): void {
  if (!userId) return;
  const {
    setMissionWatchMin,
    setMissionWatchGoal,
    setMissionGiftsSent,
    setMissionGiftsGoal,
  } = setters;
  void apiLiveEngagementMissions()
    .then(({ data }) => {
      const missions =
        (data?.missions as Array<{
          metric_key?: string;
          progress?: number;
          goal_count?: number;
        }>) || [];
      const watch = missions.find((m) => m.metric_key === 'watch_minutes');
      const gifts = missions.find((m) => m.metric_key === 'gifts_sent');
      if (watch) {
        setMissionWatchMin(Math.max(0, Number(watch.progress) || 0));
        if (watch.goal_count) setMissionWatchGoal(Math.max(1, Number(watch.goal_count)));
      }
      if (gifts) {
        setMissionGiftsSent(Math.max(0, Number(gifts.progress) || 0));
        if (gifts.goal_count) setMissionGiftsGoal(Math.max(1, Number(gifts.goal_count)));
      }
    })
    .catch((err) => reportFailure('live_engagement_missions', err, { userId }));
}
