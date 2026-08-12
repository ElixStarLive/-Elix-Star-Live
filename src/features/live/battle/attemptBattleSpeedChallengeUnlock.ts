/**
 * Shared host↔spectator: try speed unlock then apply multiplier + start.
 */

import type { MutableRefObject } from 'react';
import { applyBattleSpeedChallengeUnlock } from './applyBattleSpeedChallengeUnlock';
import { tryUnlockBattleSpeedChallenge } from './tryUnlockBattleSpeedChallenge';

export type AttemptBattleSpeedChallengeUnlockOpts = {
  totalScore: number;
  flowers: number;
  taps: number;
  reachedThresholds: Set<number>;
  setSpeedMultiplier: (mult: number) => void;
  speedMultiplierRef: MutableRefObject<number>;
  startSpeedChallenge: () => void;
};

/** Returns true if a tier unlocked. */
export function attemptBattleSpeedChallengeUnlock(
  opts: AttemptBattleSpeedChallengeUnlockOpts,
): boolean {
  return tryUnlockBattleSpeedChallenge({
    totalScore: opts.totalScore,
    flowers: opts.flowers,
    taps: opts.taps,
    reachedThresholds: opts.reachedThresholds,
    onUnlock: (mult) => {
      applyBattleSpeedChallengeUnlock(
        mult,
        opts.setSpeedMultiplier,
        opts.speedMultiplierRef,
        opts.startSpeedChallenge,
      );
    },
  });
}
