/**
 * Shared LiveKit remote video mute/unmute → cam-off Set update.
 */

import type { Dispatch, SetStateAction } from 'react';
import { markRemoteCamOff } from '../cohost/markRemoteCamOff';

type TrackLike = { kind?: string };
type ParticipantLike = { identity?: string } | null | undefined;

export function applyRemoteVideoTrackMuteState(
  pub: TrackLike,
  participant: ParticipantLike,
  setRemoteCamOff: Dispatch<SetStateAction<Set<string>>>,
  off: boolean,
): void {
  if (pub.kind !== 'video') return;
  const id = participant?.identity;
  if (!id) return;
  markRemoteCamOff(setRemoteCamOff, id, off);
}
