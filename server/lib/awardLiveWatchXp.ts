/**
 * Award XP for validated live watch minutes. Digital only — never coins/wallet.
 * Idempotent by room + user + minute index.
 */
import { getPool } from "./postgres";
import { logger } from "./logger";
import {
  applyXpGainAndSyncLevel,
  ensureAndLockUserProgression,
} from "./xpProgressionApply";

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
    const { totalXp, oldLevel } = await ensureAndLockUserProgression(
      client,
      input.userId,
    );

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
      return { xp_gained: 0, total_xp: totalXp, new_level: oldLevel, leveled_up: false };
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
    const result = await applyXpGainAndSyncLevel(client, {
      userId: input.userId,
      oldLevel,
      xpGained,
      sourceTransactionId: tx.rows[0]?.id ? String(tx.rows[0].id) : null,
    });
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ err, userId: input.userId }, "awardLiveWatchXp failed");
    return null;
  } finally {
    client.release();
  }
}
