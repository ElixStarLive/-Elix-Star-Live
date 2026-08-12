/**
 * Shared XP progression apply — one owner for level recalc + profile sync.
 * Used by live-watch XP and paid-gift XP (identical SQL tail).
 */
import type { PoolClient } from "pg";

export type XpApplyResult = {
  xp_gained: number;
  total_xp: number;
  new_level: number;
  leveled_up: boolean;
};

/**
 * After XP has been inserted (or skipped via idempotency), bump total_xp if needed,
 * recompute level from xp_level_requirements, sync profiles, and write level_history.
 */
export async function applyXpGainAndSyncLevel(
  client: PoolClient,
  input: {
    userId: string;
    oldLevel: number;
    xpGained: number;
    sourceTransactionId: string | null;
  },
): Promise<XpApplyResult> {
  const { userId, oldLevel, xpGained, sourceTransactionId } = input;
  if (xpGained > 0) {
    await client.query(
      `UPDATE user_progression
          SET total_xp = total_xp + $2, updated_at = NOW()
        WHERE user_id = $1`,
      [userId, xpGained],
    );
  }
  const calculated = await client.query(
    `SELECT up.total_xp::bigint AS total_xp,
            COALESCE(MAX(l.level), 0)::int AS calculated_level
       FROM user_progression up
       LEFT JOIN xp_level_requirements l
         ON l.total_xp_required <= up.total_xp
      WHERE up.user_id = $1
      GROUP BY up.total_xp`,
    [userId],
  );
  const totalXp = Math.max(0, Number(calculated.rows[0]?.total_xp) || 0);
  const newLevel = Math.max(0, Number(calculated.rows[0]?.calculated_level) || 0);
  await client.query(
    `UPDATE user_progression SET current_level = $2, updated_at = NOW()
      WHERE user_id = $1`,
    [userId, newLevel],
  );
  await client.query(
    `UPDATE profiles SET level = $2, updated_at = NOW() WHERE user_id = $1`,
    [userId, newLevel],
  );
  if (newLevel !== oldLevel) {
    await client.query(
      `INSERT INTO level_history
         (user_id, from_level, to_level, total_xp, source_xp_transaction_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, oldLevel, newLevel, totalXp, sourceTransactionId],
    );
  }
  return {
    xp_gained: xpGained,
    total_xp: totalXp,
    new_level: newLevel,
    leveled_up: newLevel > oldLevel,
  };
}
