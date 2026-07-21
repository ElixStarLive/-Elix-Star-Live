/**
 * Award XP for validated live watch minutes. Digital only — never coins/wallet.
 * Idempotent by room + user + minute index.
 */
import { getPool } from "./postgres";
import { logger } from "./logger";

export async function awardLiveWatchXp(input: {
  userId: string;
  roomId: string;
  minuteIndex: number;
  xpAmount: number;
  sourceSuffix?: string;
}): Promise<{
  xp_gained: number;
  total_xp: number;
  new_level: number;
  leveled_up: boolean;
} | null> {
  const pool = getPool();
  if (!pool) return null;
  const xpAmount = Math.max(0, Math.floor(input.xpAmount));
  if (xpAmount <= 0) return null;

  const idempotencyKey = `xp:live-watch:${input.roomId}:${input.userId}:${input.minuteIndex}:${input.sourceSuffix || "tick"}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO user_progression (user_id, total_xp, current_level)
       VALUES ($1, 0, 0) ON CONFLICT (user_id) DO NOTHING`,
      [input.userId],
    );
    const before = await client.query(
      `SELECT total_xp::bigint AS total_xp, current_level::int AS current_level
         FROM user_progression WHERE user_id = $1 FOR UPDATE`,
      [input.userId],
    );
    const oldLevel = Math.max(0, Number(before.rows[0]?.current_level) || 0);

    let enabled = true;
    try {
      const config = await client.query(
        `SELECT enabled FROM xp_activity_config WHERE source = $1`,
        ["live_watch"],
      );
      if (config.rows.length > 0) enabled = config.rows[0].enabled === true;
    } catch {
      /* config table optional */
    }
    if (!enabled) {
      await client.query("COMMIT");
      return { xp_gained: 0, total_xp: Number(before.rows[0]?.total_xp) || 0, new_level: oldLevel, leveled_up: false };
    }

    const tx = await client.query(
      `INSERT INTO xp_transactions
         (user_id, xp_amount, source, related_activity_type,
          related_activity_id, idempotency_key)
       VALUES ($1, $2, 'live_watch', 'live_watch', $3, $4)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [input.userId, xpAmount, input.roomId, idempotencyKey],
    );
    const xpGained = tx.rows[0] ? xpAmount : 0;
    if (xpGained > 0) {
      await client.query(
        `UPDATE user_progression
            SET total_xp = total_xp + $2, updated_at = NOW()
          WHERE user_id = $1`,
        [input.userId, xpGained],
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
      [input.userId],
    );
    const totalXp = Math.max(0, Number(calculated.rows[0]?.total_xp) || 0);
    const newLevel = Math.max(0, Number(calculated.rows[0]?.calculated_level) || 0);
    await client.query(
      `UPDATE user_progression SET current_level = $2, updated_at = NOW()
        WHERE user_id = $1`,
      [input.userId, newLevel],
    );
    await client.query(
      `UPDATE profiles SET level = $2, updated_at = NOW() WHERE user_id = $1`,
      [input.userId, newLevel],
    );
    if (newLevel !== oldLevel) {
      await client.query(
        `INSERT INTO level_history
           (user_id, from_level, to_level, total_xp, source_xp_transaction_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.userId, oldLevel, newLevel, totalXp, tx.rows[0]?.id || null],
      );
    }
    await client.query("COMMIT");
    return {
      xp_gained: xpGained,
      total_xp: totalXp,
      new_level: newLevel,
      leveled_up: newLevel > oldLevel,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ err, userId: input.userId }, "awardLiveWatchXp failed");
    return null;
  } finally {
    client.release();
  }
}
