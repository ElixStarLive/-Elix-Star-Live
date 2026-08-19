/**
 * Shared host↔spectator battle-score UI feedback after applyScores / battle end.
 * Controllers still own React state; this only runs the identical VFX/taunt side-effects.
 */

import {
  createTauntBurst,
  maybeTauntLeadChange,
  playBattleTauntSound,
  type TauntBurst,
} from '../../../lib/battleTaunts';
import type { GloveBurst } from '../../../components/BattleVfxOverlays';
import type { BattleScoreApplyResult } from './liveBattleScore';

type BattleScoreFeedbackHandlers = {
  triggerBattleVfx: (side: 'red' | 'blue', delta: number) => void;
  pushBattleTaunt: (burst: TauntBurst) => void;
};

/** Mist + gloves + lead taunt after a server score payload apply. */
export function applyBattleScoreLeadFeedback(
  result: Pick<BattleScoreApplyResult, 'vfx' | 'leadTaunt'>,
  handlers: BattleScoreFeedbackHandlers,
): void {
  if (result.vfx) handlers.triggerBattleVfx(result.vfx.side, result.vfx.delta);
  if (result.leadTaunt) {
    maybeTauntLeadChange(result.leadTaunt.side, result.leadTaunt.gain);
    handlers.pushBattleTaunt(
      createTauntBurst(
        result.leadTaunt.side === 'host' ? 'opponent' : 'host',
        'lead',
      ),
    );
  }
}

/** Win sound + taunt burst when a battle ends (host or opponent team). */
export function applyBattleWinTauntFeedback(
  winner: unknown,
  pushBattleTaunt: (burst: TauntBurst) => void,
): void {
  if (winner === 'host') {
    playBattleTauntSound('win');
    pushBattleTaunt(createTauntBurst('host', 'win'));
  } else if (winner === 'opponent') {
    playBattleTauntSound('win');
    pushBattleTaunt(createTauntBurst('opponent', 'win'));
  }
}

type BattleVfxRefs = {
  mistTimerRef: { current: number | null };
  gloveIdRef: { current: number };
};

/**
 * Shared battle-score mist/glove VFX trigger (identical host + spectator).
 * Callers bind this inside useCallback with their React setters/refs.
 */
export function runBattleScoreVfx(
  side: 'red' | 'blue',
  strength: number,
  refs: BattleVfxRefs,
  setBattleMistSide: (side: 'red' | 'blue' | null) => void,
  setBattleGloves: (updater: (prev: GloveBurst[]) => GloveBurst[]) => void,
): void {
  setBattleMistSide(side);
  if (refs.mistTimerRef.current != null) {
    window.clearTimeout(refs.mistTimerRef.current);
  }
  refs.mistTimerRef.current = window.setTimeout(() => setBattleMistSide(null), 2200);
  if (strength < 15) return;
  const bursts: GloveBurst[] = [0, 1, 2].map((i) => ({
    id: ++refs.gloveIdRef.current,
    side,
    x: 4 + i * 12 + Math.random() * 10,
    delay: i * 110,
  }));
  setBattleGloves((prev) => [...prev.slice(-5), ...bursts]);
  window.setTimeout(() => {
    setBattleGloves((prev) => prev.filter((g) => !bursts.some((b) => b.id === g.id)));
  }, 1700);
}
