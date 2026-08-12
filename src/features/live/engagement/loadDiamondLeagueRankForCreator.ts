/**
 * Shared host↔spectator Diamond League weekly rank lookup for a creator id.
 */

import type { Dispatch, SetStateAction } from 'react';
import { apiLiveRankingsWeekly } from './liveEngagementApi';

/**
 * Fetch weekly rankings and set 1-based rank for `creatorId`, or null if missing/not listed.
 * Returns a cancel function for effect cleanup.
 */
export function loadDiamondLeagueRankForCreator(
  creatorId: string | undefined | null,
  setDiamondLeagueRank: Dispatch<SetStateAction<number | null>>,
): () => void {
  if (!creatorId || creatorId === 'broadcast') {
    setDiamondLeagueRank(null);
    return () => {};
  }
  let cancelled = false;
  void apiLiveRankingsWeekly().then(({ data, error }) => {
    if (cancelled || error) return;
    const list = Array.isArray(data?.rankings) ? data.rankings : [];
    const idx = list.findIndex((r: { user_id?: string; id?: string; creator_id?: string }) => {
      const id = String(r?.user_id || r?.id || r?.creator_id || '');
      return id === String(creatorId);
    });
    setDiamondLeagueRank(idx >= 0 ? idx + 1 : null);
  });
  return () => {
    cancelled = true;
  };
}
