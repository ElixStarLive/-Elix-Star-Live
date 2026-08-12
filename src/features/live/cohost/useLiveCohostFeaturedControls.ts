/**
 * Shared cohost featured / speaking / video-el callbacks for host + spectator.
 */

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { isSpeakingUserId, toggleFeaturedUserId } from './liveFeaturedSpeaking';
import { findCoHostVideoElByIdentity } from './findCoHostVideoElByIdentity';
import { markRemoteCamOff } from './markRemoteCamOff';

export function useLiveCohostFeaturedControls(args: {
  coHostVideoRefs: MutableRefObject<Map<string, HTMLVideoElement>>;
  speakingIds: Set<string>;
  setFeaturedUserId: Dispatch<SetStateAction<string | null>>;
  setRemoteCamOff?: Dispatch<SetStateAction<Set<string>>>;
}): {
  findCoHostVideoEl: (identity: string) => HTMLVideoElement | null;
  isSpeakingUser: (userId?: string | null) => boolean;
  toggleFeaturedUser: (userId: string) => void;
  markRemoteCam: (identity: string, off: boolean) => void;
} {
  const { coHostVideoRefs, speakingIds, setFeaturedUserId, setRemoteCamOff } = args;

  const findCoHostVideoEl = useCallback((identity: string): HTMLVideoElement | null => {
    return findCoHostVideoElByIdentity(coHostVideoRefs.current, identity);
  }, [coHostVideoRefs]);

  const isSpeakingUser = useCallback(
    (userId?: string | null) => isSpeakingUserId(speakingIds, userId),
    [speakingIds],
  );

  const toggleFeaturedUser = useCallback((userId: string) => {
    toggleFeaturedUserId(setFeaturedUserId, userId);
  }, [setFeaturedUserId]);

  const markRemoteCam = useCallback((identity: string, off: boolean) => {
    if (!setRemoteCamOff) return;
    markRemoteCamOff(setRemoteCamOff, identity, off);
  }, [setRemoteCamOff]);

  return {
    findCoHostVideoEl,
    isSpeakingUser,
    toggleFeaturedUser,
    markRemoteCam,
  };
}
