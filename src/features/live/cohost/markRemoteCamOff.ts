/**
 * Shared host↔spectator remote camera off Set updates (sameUserId-aware).
 */

import type { Dispatch, SetStateAction } from 'react';
import { sameUserId } from '../utils/ids';

export function markRemoteCamOff(
  setRemoteCamOff: Dispatch<SetStateAction<Set<string>>>,
  identity: string,
  off: boolean,
): void {
  if (!identity) return;
  setRemoteCamOff((prev) => {
    let changed = false;
    const next = new Set<string>();
    for (const id of prev) {
      if (sameUserId(id, identity)) {
        changed = true;
        continue;
      }
      next.add(id);
    }
    if (off) {
      next.add(identity);
      changed = true;
    }
    return changed || off ? next : prev;
  });
}
