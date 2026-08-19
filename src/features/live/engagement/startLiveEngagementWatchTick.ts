/**
 * Shared host↔spectator engagement watch_minutes minute tick.
 */

import type { Dispatch, SetStateAction } from 'react';
import { apiLiveEngagementProgress } from './liveEngagementApi';
import { earnBattleEnergyQuiet } from '../../../components/BattleEnergyBoostControls';
import { reportFailure } from '../../../lib/reportFailure';

type StartLiveEngagementWatchTickOpts = {
  roomId: string;
  missionWatchGoal: number;
  setMissionWatchMin: Dispatch<SetStateAction<number>>;
  intervalMs?: number;
};

/** Start 60s watch tick; returns clearInterval cleanup. */
export function startLiveEngagementWatchTick(
  opts: StartLiveEngagementWatchTickOpts,
): () => void {
  const {
    roomId,
    missionWatchGoal,
    setMissionWatchMin,
    intervalMs = 60_000,
  } = opts;
  const id = window.setInterval(() => {
    setMissionWatchMin((m) => Math.min(missionWatchGoal, m + 1));
    earnBattleEnergyQuiet('watch', roomId);
    void apiLiveEngagementProgress({
      metric: 'watch_minutes',
      delta: 1,
      roomId,
    }).catch((err) => reportFailure('live_engagement_watch_tick', err, { roomId }));
  }, intervalMs);
  return () => window.clearInterval(id);
}
