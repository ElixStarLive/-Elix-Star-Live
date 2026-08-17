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
      // Reading the ref at unmount is the point: it must clear whichever mist
      // timeout is pending then. Copying it into the effect body (what
      // exhaustive-deps suggests) would capture null at mount and clear nothing.
      if (battleMistTimerRef.current != null) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
