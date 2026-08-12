/**
 * Shared engagement mission claim flow (drawer + missions page).
 */

import { showToast } from '../../../lib/toast';
import { apiEngagementMissionClaim } from './liveEngagementApi';

export async function claimEngagementMissionRow(args: {
  id: string;
  claiming: string | null;
  setClaiming: (id: string | null) => void;
  reload: () => Promise<void>;
}): Promise<void> {
  if (args.claiming) return;
  args.setClaiming(args.id);
  try {
    const { error } = await apiEngagementMissionClaim(args.id);
    if (error) {
      showToast(error || 'Claim failed');
      return;
    }
    showToast('Reward claimed');
    await args.reload();
  } finally {
    args.setClaiming(null);
  }
}
