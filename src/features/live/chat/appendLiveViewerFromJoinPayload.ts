/**
 * Host join: append viewer row from WS join (shared by announced + first-seen paths).
 */

import type { Dispatch, SetStateAction } from 'react';
import {
  appendLiveViewerIfMissing,
  buildLiveViewerFromJoin,
} from './appendLiveViewerIfMissing';
import type { LiveViewer } from '../types';

export function appendLiveViewerFromJoinPayload(args: {
  setActiveViewers: Dispatch<SetStateAction<LiveViewer[]>>;
  uid: string;
  joinName: string;
  displayName?: string;
  username?: string;
  avatar?: string;
  level: number;
  country?: string;
  cached?: {
    displayName?: string;
    username?: string;
    avatar?: string;
  };
}): void {
  const { setActiveViewers, uid, joinName, level, cached } = args;
  appendLiveViewerIfMissing(
    setActiveViewers,
    buildLiveViewerFromJoin({
      uid,
      joinName,
      displayName: cached?.displayName || args.displayName || joinName,
      username: cached?.username || args.username || joinName,
      avatar: cached?.avatar || args.avatar || '',
      level,
      country: args.country || '',
    }),
  );
}
