/**
 * Shared capped active-viewer append (skip if id already present).
 */

import type { Dispatch, SetStateAction } from 'react';
import { appendCapped, LIVE_VIEWER_CAP } from '../../../lib/liveRuntimeCaps';
import type { LiveViewer } from '../types';

type SetViewers =
  | Dispatch<SetStateAction<LiveViewer[]>>
  | ((updater: (prev: LiveViewer[]) => LiveViewer[]) => void);

export function appendLiveViewerIfMissing(
  setActiveViewers: SetViewers,
  viewer: LiveViewer,
): void {
  setActiveViewers((prev) => {
    if (prev.some((v) => String(v.id) === String(viewer.id))) return prev;
    return appendCapped(prev, viewer, LIVE_VIEWER_CAP);
  });
}

export function patchLiveViewerBattleSide(
  setActiveViewers: SetViewers,
  uid: string,
  battleSide: 'host' | 'opponent' | null,
  overwrite = false,
): void {
  if (!uid || !battleSide) return;
  setActiveViewers((prev) =>
    prev.map((v) => {
      if (String(v.id) !== String(uid)) return v;
      if (!overwrite && v.battleSide) return v;
      return { ...v, battleSide };
    }),
  );
}

export function buildLiveViewerFromJoin(opts: {
  uid: string;
  joinName: string;
  displayName?: string;
  username?: string;
  avatar?: string;
  level: number;
  country?: string;
  battleSide?: 'host' | 'opponent' | null;
}): LiveViewer {
  return {
    id: opts.uid,
    username: opts.username || opts.joinName,
    displayName: opts.displayName || opts.joinName,
    level: opts.level,
    avatar: opts.avatar || '',
    country: opts.country || '',
    joinedAt: Date.now(),
    isActive: true,
    chatFrequency: 0,
    supportDays: 0,
    lastVisitDaysAgo: 0,
    battleSide: opts.battleSide ?? null,
  };
}
