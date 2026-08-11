/**
 * React owner for authoritative battle score totals (h/o/p3/p4).
 * Host + spectator controllers share this instead of duplicating WS apply logic.
 */

import { useCallback, useRef, useState } from 'react';
import {
  EMPTY_BATTLE_SERVER_TOTALS,
  applyServerBattleScorePayload,
  type BattleScoreApplyResult,
  type BattleServerTotals,
} from './liveBattleScore';

export function useBattleServerTotals() {
  const battleServerTotalsRef = useRef<BattleServerTotals>({ ...EMPTY_BATTLE_SERVER_TOTALS });
  const [battleServerTotals, setBattleServerTotals] = useState<BattleServerTotals>({
    ...EMPTY_BATTLE_SERVER_TOTALS,
  });

  const applyScores = useCallback((data: unknown): BattleScoreApplyResult => {
    const result = applyServerBattleScorePayload(battleServerTotalsRef.current, data);
    battleServerTotalsRef.current = result.totals;
    setBattleServerTotals(result.totals);
    return result;
  }, []);

  const resetScores = useCallback(() => {
    battleServerTotalsRef.current = { ...EMPTY_BATTLE_SERVER_TOTALS };
    setBattleServerTotals({ ...EMPTY_BATTLE_SERVER_TOTALS });
  }, []);

  return {
    battleServerTotals,
    battleServerTotalsRef,
    setBattleServerTotals,
    applyScores,
    resetScores,
  };
}
