/**
 * Shared speed-challenge unlock apply (set multiplier + start).
 */

import type { MutableRefObject } from 'react';

export function applyBattleSpeedChallengeUnlock(
  multiplier: number,
  setSpeedMultiplier: (mult: number) => void,
  speedMultiplierRef: MutableRefObject<number>,
  startSpeedChallenge: () => void,
): void {
  setSpeedMultiplier(multiplier);
  speedMultiplierRef.current = multiplier;
  startSpeedChallenge();
}
