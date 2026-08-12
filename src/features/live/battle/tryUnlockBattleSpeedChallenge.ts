/**
 * Shared host↔spectator automatic battle speed-challenge tier unlock.
 * Controllers own score/rose/tap sources; this owns thresholds + multiplier pick.
 */

export type TryUnlockBattleSpeedChallengeOpts = {
  totalScore: number;
  flowers: number;
  taps: number;
  reachedThresholds: Set<number>;
  /** Apply multiplier + start challenge (caller owns refs/state). */
  onUnlock: (multiplier: number) => void;
};

/**
 * Try x5 / x3 / x2 unlock in order. Returns true if a tier unlocked.
 * Mutates `reachedThresholds` the same way both controllers did inline.
 */
export function tryUnlockBattleSpeedChallenge(
  opts: TryUnlockBattleSpeedChallengeOpts,
): boolean {
  const { totalScore, flowers, taps, reachedThresholds, onUnlock } = opts;

  const tryUnlock = (
    threshold: number,
    mult: number,
    flowerNeed: number,
    tapNeed: number,
    markLower: number[],
  ): boolean => {
    if (reachedThresholds.has(threshold)) return false;
    const byPoints = totalScore >= threshold;
    const byFlower = flowers >= flowerNeed;
    const byTaps = taps >= tapNeed;
    if (!byPoints && !byFlower && !byTaps) return false;
    reachedThresholds.add(threshold);
    for (const m of markLower) reachedThresholds.add(m);
    onUnlock(mult);
    return true;
  };

  if (tryUnlock(5000, 5, 5, 80, [1000, 200])) return true;
  if (tryUnlock(1000, 3, 3, 40, [200])) return true;
  return tryUnlock(200, 2, 1, 15, []);
}
