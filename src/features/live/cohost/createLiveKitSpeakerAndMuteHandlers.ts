/**
 * Shared LiveKit active-speakers + remote video mute/unmute handlers.
 */

import type { Dispatch, SetStateAction } from 'react';
import { applyRemoteVideoTrackMuteState } from './applyRemoteVideoTrackMuteState';
import { markRemoteCamOff } from './markRemoteCamOff';
import { sameUserId } from '../utils/ids';

type TrackLike = { kind?: string };
type ParticipantLike = { identity?: string } | null | undefined;

export function createLiveKitSpeakerAndMuteHandlers(args: {
  setSpeakingIds: Dispatch<SetStateAction<Set<string>>>;
  setRemoteCamOff: Dispatch<SetStateAction<Set<string>>>;
}): {
  onActiveSpeakers: (identities: string[]) => void;
  onTrackMuted: (pub: TrackLike, participant: ParticipantLike) => void;
  onTrackUnmuted: (pub: TrackLike, participant: ParticipantLike) => void;
  onParticipantDisconnected: (participant: ParticipantLike) => void;
} {
  return {
    onActiveSpeakers: (identities) => {
      args.setSpeakingIds(new Set(identities.filter(Boolean)));
    },
    /**
     * Both of these Sets describe live media state, and LiveKit only corrects
     * them through events that a departed participant can no longer produce: it
     * does not re-emit active speakers when someone drops, so whoever was
     * talking as they lost connection stays marked speaking, and a camera-off
     * flag outlives its owner the same way.
     */
    onParticipantDisconnected: (participant) => {
      const identity = participant?.identity;
      if (!identity) return;
      args.setSpeakingIds((prev) => {
        let changed = false;
        const next = new Set<string>();
        for (const id of prev) {
          if (sameUserId(id, identity)) {
            changed = true;
            continue;
          }
          next.add(id);
        }
        return changed ? next : prev;
      });
      markRemoteCamOff(args.setRemoteCamOff, identity, false);
    },
    onTrackMuted: (pub, participant) => {
      applyRemoteVideoTrackMuteState(pub, participant, args.setRemoteCamOff, true);
    },
    onTrackUnmuted: (pub, participant) => {
      applyRemoteVideoTrackMuteState(pub, participant, args.setRemoteCamOff, false);
    },
  };
}
