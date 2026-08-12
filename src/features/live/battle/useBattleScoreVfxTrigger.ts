/**
 * Shared battle score VFX trigger (mist timer + glove bursts) for host/spectator.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  type BattleMistSide,
  type GloveBurst,
} from '../../../components/BattleVfxOverlays';
import { runBattleScoreVfx } from './applyBattleScoreFeedback';

export function useBattleScoreVfxTrigger(
  setBattleMistSide: Dispatch<SetStateAction<BattleMistSide>>,
): {
  battleGloves: GloveBurst[];
  setBattleGloves: Dispatch<SetStateAction<GloveBurst[]>>;
  battleMistTimerRef: MutableRefObject<number | null>;
  gloveIdRef: MutableRefObject<number>;
  triggerBattleVfx: (side: 'red' | 'blue', strength: number) => void;
} {
  const [battleGloves, setBattleGloves] = useState<GloveBurst[]>([]);
  const battleMistTimerRef = useRef<number | null>(null);
  const gloveIdRef = useRef(0);

  const triggerBattleVfx = useCallback(
    (side: 'red' | 'blue', strength: number) => {
      runBattleScoreVfx(
        side,
        strength,
        { mistTimerRef: battleMistTimerRef, gloveIdRef },
        setBattleMistSide,
        setBattleGloves,
      );
    },
    [setBattleMistSide],
  );

  useEffect(() => {
    return () => {
      if (battleMistTimerRef.current != null) {
        window.clearTimeout(battleMistTimerRef.current);
      }
    };
  }, []);

  return {
    battleGloves,
    setBattleGloves,
    battleMistTimerRef,
    gloveIdRef,
    triggerBattleVfx,
  };
}
