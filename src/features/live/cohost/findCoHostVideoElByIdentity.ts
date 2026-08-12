/**
 * Shared host↔spectator co-host video element lookup by LiveKit identity.
 */

import { sameUserId } from '../utils/ids';

export function findCoHostVideoElByIdentity(
  refs: Map<string, HTMLVideoElement>,
  identity: string,
): HTMLVideoElement | null {
  const direct = refs.get(identity);
  if (direct) return direct;
  for (const [uid, el] of refs) {
    if (sameUserId(uid, identity)) return el;
  }
  return null;
}
