/**
 * Load engagement mission rows (drawer + missions page).
 */

import { apiEngagementMissions } from './liveEngagementApi';
import type { EngagementMissionRow } from './engagementMissionTypes';

export async function loadEngagementMissionRows(): Promise<{
  ok: true;
  missions: EngagementMissionRow[];
} | { ok: false; error: string }> {
  const { data, error } = await apiEngagementMissions();
  if (error) return { ok: false, error };
  return {
    ok: true,
    missions: (data?.missions as EngagementMissionRow[]) || [],
  };
}
