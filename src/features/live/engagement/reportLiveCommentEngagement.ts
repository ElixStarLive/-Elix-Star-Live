/**
 * Shared host↔spectator comment engagement tick (energy + comments metric).
 */

import { earnBattleEnergyQuiet } from '../../../components/BattleEnergyBoostControls';
import { apiLiveEngagementProgress } from './liveEngagementApi';
import { reportFailure } from '../../../lib/reportFailure';

export function reportLiveCommentEngagement(roomId: string): void {
  earnBattleEnergyQuiet('comment', roomId);
  void apiLiveEngagementProgress({
    metric: 'comments',
    delta: 1,
    roomId,
  }).catch((err) => reportFailure('live_engagement_progress', err));
}
