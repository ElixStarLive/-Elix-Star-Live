/**
 * Shared LiveKit active-speakers + remote video mute/unmute handlers.
 */

import type { Dispatch, SetStateAction } from 'react';
import { applyRemoteVideoTrackMuteState } from './applyRemoteVideoTrackMuteState';

type TrackLike = { kind?: string };
type ParticipantLike = { identity?: string } | null | undefined;

export function createLiveKitSpeakerAndMuteHandlers(args: {
  setSpeakingIds: Dispatch<SetStateAction<Set<string>>>;
  setRemoteCamOff: Dispatch<SetStateAction<Set<string>>>;
}): {
  onActiveSpeakers: (identities: string[]) => void;
  onTrackMuted: (pub: TrackLike, participant: ParticipantLike) => void;
  onTrackUnmuted: (pub: TrackLike, participant: ParticipantLike) => void;
} {
  return {
    onActiveSpeakers: (identities) => {
      args.setSpeakingIds(new Set(identities.filter(Boolean)));
    },
    onTrackMuted: (pub, participant) => {
      applyRemoteVideoTrackMuteState(pub, participant, args.setRemoteCamOff, true);
    },
    onTrackUnmuted: (pub, participant) => {
      applyRemoteVideoTrackMuteState(pub, participant, args.setRemoteCamOff, false);
    },
  };
}
