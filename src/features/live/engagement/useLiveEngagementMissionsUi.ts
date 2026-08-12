/**
 * Shared host↔spectator engagement missions state + load/refresh effects.
 */

import { useCallback, useEffect, useState } from 'react';
import type { EngagementPanel } from '../../../components/engagement/EngagementDrawer';
import { loadLiveEngagementMissionsProgress } from '../engagement/loadLiveEngagementMissionsProgress';

export function useLiveEngagementMissionsUi(
  userId: string | undefined,
  engagementOpen: boolean,
  engagementPanel: EngagementPanel | null | undefined,
) {
  const [missionWatchMin, setMissionWatchMin] = useState(0);
  const [missionGiftsSent, setMissionGiftsSent] = useState(0);
  const [missionWatchGoal, setMissionWatchGoal] = useState(10);
  const [missionGiftsGoal, setMissionGiftsGoal] = useState(10);

  const loadEngagementMissions = useCallback(() => {
    loadLiveEngagementMissionsProgress(userId, {
      setMissionWatchMin,
      setMissionWatchGoal,
      setMissionGiftsSent,
      setMissionGiftsGoal,
    });
  }, [userId]);

  useEffect(() => {
    loadEngagementMissions();
  }, [loadEngagementMissions]);

  useEffect(() => {
    if (!engagementOpen || engagementPanel !== 'missions') return;
    loadEngagementMissions();
  }, [engagementOpen, engagementPanel, loadEngagementMissions]);

  return {
    missionWatchMin,
    setMissionWatchMin,
    missionGiftsSent,
    setMissionGiftsSent,
    missionWatchGoal,
    setMissionWatchGoal,
    missionGiftsGoal,
    setMissionGiftsGoal,
    loadEngagementMissions,
  };
}
