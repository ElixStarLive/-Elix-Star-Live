/**
 * Shared attach of a subscribed remote LiveKit video track to an element.
 */

import type { Room } from 'livekit-client';
import { prepareLiveVideoEl } from '../../../lib/prepareLiveVideoEl';
import { sameUserId } from '../utils/ids';

/** Attach first matching subscribed remote video track to `videoEl`. */
export function attachRemoteParticipantVideo(
  room: Room,
  videoEl: HTMLVideoElement,
  matchIdentity: (identity: string) => boolean,
): boolean {
  for (const [, p] of room.remoteParticipants) {
    if (!matchIdentity(p.identity)) continue;
    for (const [, pub] of p.videoTrackPublications) {
      if (pub.track && pub.isSubscribed) {
        pub.track.attach(videoEl);
        prepareLiveVideoEl(videoEl);
        return true;
      }
    }
  }
  return false;
}

/** Convenience: match one or more candidate user/room ids. */
export function attachRemoteParticipantVideoByIds(
  room: Room,
  videoEl: HTMLVideoElement,
  ...candidateIds: Array<string | null | undefined>
): boolean {
  const ids = candidateIds.filter(Boolean) as string[];
  if (!ids.length) return false;
  return attachRemoteParticipantVideo(room, videoEl, (identity) =>
    ids.some((id) => sameUserId(identity, id)),
  );
}
