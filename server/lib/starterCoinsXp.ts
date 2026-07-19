/**
 * Starter Coins and user XP progression.
 *
 * This module never reads or writes paid wallet, IAP, Stripe, creator earnings,
 * creator payout, or test-coin state.
 */
import type pg from "pg";
import { getPool } from "./postgres";
import { logger } from "./logger";

export const NEW_USER_STARTER_COINS = 50_000;

export type GiftSource = "starter_coins" | "paid_coins";

export interface ProgressionSnapshot {
  starter_coin_balance: number;
  total_xp: number;
  current_level: number;
  current_level_xp: number;
  next_level: number | null;
  next_level_total_xp: number | null;
  xp_to_next_level: number;
  title: string | null;
  badge_code: string | null;
}

export async function initializeNewUserStarterProgression(
  client: pg.PoolClient,
  userId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO starter_coin_balances
       (user_id, balance, lifetime_granted, lifetime_spent)
     VALUES ($1, $2, $2, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, NEW_USER_STARTER_COINS],
  );
  await client.query(
    `INSERT INTO starter_coin_transactions
       (user_id, kind, amount_delta, balance_after, idempotency_key, reason)
     VALUES ($1, 'onboarding_grant', $2, $2, $3, 'New account onboarding reward')
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [userId, NEW_USER_STARTER_COINS, `starter:onboarding:${userId}`],
  );
  await client.query(
    `INSERT INTO user_progression (user_id, total_xp, current_level)
     VALUES ($1, 0, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

async function progressionFromClient(
  client: pg.PoolClient,
  userId: string,
): Promise<ProgressionSnapshot> {
  const r = await client.query(
    `WITH progress AS (
       SELECT COALESCE(up.total_xp, 0)::bigint AS total_xp,
              COALESCE(up.current_level, 0)::int AS current_level
         FROM (SELECT $1::text AS user_id) u
         LEFT JOIN user_progression up ON up.user_id = u.user_id
     )
     SELECT
       COALESCE(scb.balance, 0)::bigint AS starter_coin_balance,
       p.total_xp,
       p.current_level,
       current_req.total_xp_required::bigint AS current_level_total_xp,
       reward.title,
       reward.badge_code,
       next_req.level::int AS next_level,
       next_req.total_xp_required::bigint AS next_level_total_xp
     FROM progress p
     LEFT JOIN starter_coin_balances scb ON scb.user_id = $1
     LEFT JOIN xp_level_requirements current_req ON current_req.level = p.current_level
     LEFT JOIN LATERAL (
       SELECT title, badge_code
         FROM xp_level_requirements
        WHERE level <= p.current_level
          AND (title IS NOT NULL OR badge_code IS NOT NULL)
        ORDER BY level DESC
        LIMIT 1
     ) reward ON TRUE
     LEFT JOIN LATERAL (
       SELECT level, total_xp_required
         FROM xp_level_requirements
        WHERE level > p.current_level
        ORDER BY level ASC
        LIMIT 1
     ) next_req ON TRUE`,
    [userId],
  );
  const row = r.rows[0] || {};
  const totalXp = Math.max(0, Number(row.total_xp) || 0);
  const currentLevelTotalXp = Math.max(
    0,
    Number(row.current_level_total_xp) || 0,
  );
  const nextTotal =
    row.next_level_total_xp == null
      ? null
      : Math.max(0, Number(row.next_level_total_xp) || 0);
  return {
    starter_coin_balance: Math.max(0, Number(row.starter_coin_balance) || 0),
    total_xp: totalXp,
    current_level: Math.max(0, Number(row.current_level) || 0),
    current_level_xp: Math.max(0, totalXp - currentLevelTotalXp),
    next_level: row.next_level == null ? null : Number(row.next_level),
    next_level_total_xp: nextTotal,
    xp_to_next_level: nextTotal == null ? 0 : Math.max(0, nextTotal - totalXp),
    title: row.title == null ? null : String(row.title),
    badge_code: row.badge_code == null ? null : String(row.badge_code),
  };
}

export async function getProgressionSnapshot(
  userId: string,
): Promise<ProgressionSnapshot | null> {
  const pool = getPool();
  if (!pool) return null;
  const client = await pool.connect();
  try {
    return await progressionFromClient(client, userId);
  } finally {
    client.release();
  }
}

function xpSourceForGiftType(
  giftType: string,
  prefix: "starter_gift" | "paid_gift" = "starter_gift",
): string {
  const normalized = giftType.trim().toLowerCase();
  if (normalized === "universe" || normalized === "special") {
    return `${prefix}_universe`;
  }
  if (normalized === "big" || normalized === "large") {
    return `${prefix}_big`;
  }
  if (normalized === "medium") return `${prefix}_medium`;
  return `${prefix}_small`;
}

export type StarterGiftResult =
  | {
      ok: true;
      already_processed: boolean;
      gift_source: "starter_coins";
      transaction_id: string;
      new_starter_balance: number;
      xp_gained: number;
      total_xp: number;
      new_level: number;
      leveled_up: boolean;
    }
  | {
      ok: false;
      error:
        | "invalid_amount"
        | "insufficient_starter_coins"
        | "self_gift_not_allowed"
        | "transaction_conflict"
        | "database_error";
      starter_balance: number;
    };

/**
 * Atomically debit Starter Coins, record source-tagged gift, award configured
 * XP, update level, and append level history. No creator earning is created.
 */
export async function sendStarterCoinGift(input: {
  userId: string;
  recipientUserId: string;
  giftId: string;
  giftType: string;
  roomId: string;
  coins: number;
  clientTransactionId: string;
}): Promise<StarterGiftResult> {
  const pool = getPool();
  if (!pool) {
    return { ok: false, error: "database_error", starter_balance: 0 };
  }
  const coins = Math.max(0, Math.floor(input.coins));
  if (coins <= 0) {
    return { ok: false, error: "invalid_amount", starter_balance: 0 };
  }
  if (!input.recipientUserId || input.recipientUserId === input.userId) {
    return {
      ok: false,
      error: "self_gift_not_allowed",
      starter_balance: 0,
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `starter-gift:${input.userId}:${input.clientTransactionId}`,
    ]);

    const previous = await client.query(
      `SELECT sct.balance_after,
              COALESCE(xt.xp_amount, 0)::int AS xp_amount
         FROM starter_coin_transactions sct
         LEFT JOIN xp_transactions xt
           ON xt.idempotency_key = 'xp:starter-gift:' || sct.client_transaction_id
        WHERE sct.client_transaction_id = $1
          AND sct.user_id = $2
        LIMIT 1`,
      [input.clientTransactionId, input.userId],
    );
    if (previous.rows[0]) {
      const snapshot = await progressionFromClient(client, input.userId);
      await client.query("COMMIT");
      return {
        ok: true,
        already_processed: true,
        gift_source: "starter_coins",
        transaction_id: input.clientTransactionId,
        new_starter_balance: Math.max(
          0,
          Number(previous.rows[0].balance_after) || 0,
        ),
        xp_gained: Math.max(0, Number(previous.rows[0].xp_amount) || 0),
        total_xp: snapshot.total_xp,
        new_level: snapshot.current_level,
        leveled_up: false,
      };
    }
    const conflictingGift = await client.query(
      `SELECT user_id, room_id, gift_id, gift_source
         FROM elix_gift_transactions
        WHERE client_transaction_id = $1
        LIMIT 1`,
      [input.clientTransactionId],
    );
    if (conflictingGift.rows[0]) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        error: "transaction_conflict",
        starter_balance: 0,
      };
    }

    const balanceUpdate = await client.query(
      `UPDATE starter_coin_balances
          SET balance = balance - $2,
              lifetime_spent = lifetime_spent + $2,
              updated_at = NOW()
        WHERE user_id = $1 AND balance >= $2
        RETURNING balance::bigint AS balance`,
      [input.userId, coins],
    );
    if (!balanceUpdate.rows[0]) {
      const current = await client.query(
        `SELECT COALESCE(balance, 0)::bigint AS balance
           FROM starter_coin_balances WHERE user_id = $1`,
        [input.userId],
      );
      await client.query("ROLLBACK");
      return {
        ok: false,
        error: "insufficient_starter_coins",
        starter_balance: Math.max(0, Number(current.rows[0]?.balance) || 0),
      };
    }
    const newStarterBalance = Math.max(
      0,
      Number(balanceUpdate.rows[0].balance) || 0,
    );

    await client.query(
      `INSERT INTO starter_coin_transactions
         (user_id, kind, amount_delta, balance_after, gift_id, room_id,
          recipient_user_id, client_transaction_id, idempotency_key, reason)
       VALUES ($1, 'gift_debit', $2, $3, $4, $5, $6, $7, $8,
               'Starter Coin gift; no monetary value and no creator earnings')`,
      [
        input.userId,
        -coins,
        newStarterBalance,
        input.giftId,
        input.roomId,
        input.recipientUserId,
        input.clientTransactionId,
        `starter:gift:${input.userId}:${input.clientTransactionId}`,
      ],
    );

    await client.query(
      `INSERT INTO elix_gift_transactions
         (user_id, room_id, gift_id, coins, client_transaction_id,
          gift_source, created_at)
       VALUES ($1, $2, $3, $4, $5, 'starter_coins', NOW())
       ON CONFLICT (client_transaction_id) DO NOTHING`,
      [
        input.userId,
        input.roomId,
        input.giftId,
        coins,
        input.clientTransactionId,
      ],
    );

    const source = xpSourceForGiftType(input.giftType);
    // XP now scales with the coins spent (1 coin = 1 XP) instead of a flat
    // per-gift-type amount, so bigger gifts move the level far more. The config
    // row's `enabled` flag is still honoured so admins can switch gift XP off.
    const xpConfig = await client.query(
      `SELECT enabled
         FROM xp_activity_config
        WHERE source = $1`,
      [source],
    );
    const xpEnabled =
      xpConfig.rows.length === 0 || xpConfig.rows[0].enabled === true;
    const xpGained = xpEnabled ? Math.max(0, Math.floor(coins)) : 0;

    await client.query(
      `INSERT INTO user_progression (user_id, total_xp, current_level)
       VALUES ($1, 0, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [input.userId],
    );
    const before = await client.query(
      `SELECT total_xp::bigint AS total_xp, current_level::int AS current_level
         FROM user_progression
        WHERE user_id = $1
        FOR UPDATE`,
      [input.userId],
    );
    const oldLevel = Math.max(0, Number(before.rows[0]?.current_level) || 0);

    let xpTransactionId: string | null = null;
    if (xpGained > 0) {
      const xpInsert = await client.query(
        `INSERT INTO xp_transactions
           (user_id, xp_amount, source, related_activity_type,
            related_activity_id, idempotency_key)
         VALUES ($1, $2, $3, 'gift', $4, $5)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [
          input.userId,
          xpGained,
          source,
          input.clientTransactionId,
          `xp:starter-gift:${input.clientTransactionId}`,
        ],
      );
      xpTransactionId = xpInsert.rows[0]?.id
        ? String(xpInsert.rows[0].id)
        : null;
      if (xpTransactionId) {
        await client.query(
          `UPDATE user_progression
              SET total_xp = total_xp + $2,
                  updated_at = NOW()
            WHERE user_id = $1`,
          [input.userId, xpGained],
        );
      }
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
    const newLevel = Math.max(
      oldLevel,
      Number(calculated.rows[0]?.calculated_level) || 0,
    );
    await client.query(
      `UPDATE user_progression
          SET current_level = $2, updated_at = NOW()
        WHERE user_id = $1`,
      [input.userId, newLevel],
    );
    // Keep the existing profile level display in sync; this is status only.
    await client.query(
      `UPDATE profiles SET level = $2, updated_at = NOW() WHERE user_id = $1`,
      [input.userId, newLevel],
    );
    if (newLevel > oldLevel) {
      await client.query(
        `INSERT INTO level_history
           (user_id, from_level, to_level, total_xp, source_xp_transaction_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.userId, oldLevel, newLevel, totalXp, xpTransactionId],
      );
    }

    await client.query("COMMIT");
    return {
      ok: true,
      already_processed: false,
      gift_source: "starter_coins",
      transaction_id: input.clientTransactionId,
      new_starter_balance: newStarterBalance,
      xp_gained: xpGained,
      total_xp: totalXp,
      new_level: newLevel,
      leveled_up: newLevel > oldLevel,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback failure; original failure is logged below.
    }
    logger.error(
      { err, userId: input.userId, giftId: input.giftId },
      "sendStarterCoinGift failed",
    );
    return { ok: false, error: "database_error", starter_balance: 0 };
  } finally {
    client.release();
  }
}

/**
 * Award XP for an already-committed paid gift. This never touches the paid
 * wallet or creator earnings and is idempotent by gift transaction id.
 */
export async function awardPaidGiftXp(input: {
  userId: string;
  giftType: string;
  coins: number;
  clientTransactionId: string;
}): Promise<{
  xp_gained: number;
  total_xp: number;
  new_level: number;
  leveled_up: boolean;
} | null> {
  const pool = getPool();
  if (!pool) return null;
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
    const source = xpSourceForGiftType(input.giftType, "paid_gift");
    // XP now scales with the coins spent (1 coin = 1 XP) instead of a flat
    // per-gift-type amount. The config row's `enabled` flag is still honoured so
    // admins can switch paid-gift XP off.
    const config = await client.query(
      `SELECT enabled FROM xp_activity_config WHERE source = $1`,
      [source],
    );
    const xpEnabled = config.rows.length === 0 || config.rows[0].enabled === true;
    const configuredXp = xpEnabled ? Math.max(0, Math.floor(input.coins)) : 0;
    const tx = configuredXp > 0
      ? await client.query(
          `INSERT INTO xp_transactions
             (user_id, xp_amount, source, related_activity_type,
              related_activity_id, idempotency_key)
           VALUES ($1, $2, $3, 'gift', $4, $5)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id`,
          [
            input.userId,
            configuredXp,
            source,
            input.clientTransactionId,
            `xp:paid-gift:${input.clientTransactionId}`,
          ],
        )
      : { rows: [] as Array<{ id: string }> };
    const xpGained = tx.rows[0] ? configuredXp : 0;
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
    const newLevel = Math.max(
      0,
      Number(calculated.rows[0]?.calculated_level) || 0,
    );
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
    logger.error(
      { err, userId: input.userId },
      "awardPaidGiftXp failed",
    );
    return null;
  } finally {
    client.release();
  }
}

export async function listXpHistory(userId: string, limit = 100) {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query(
    `SELECT id, xp_amount, source, related_activity_type,
            related_activity_id, reason, created_at
       FROM xp_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, Math.max(1, Math.min(500, limit))],
  );
  return r.rows;
}

export async function listStarterCoinHistory(userId: string, limit = 100) {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query(
    `SELECT id, kind, amount_delta, balance_after, gift_id, room_id,
            recipient_user_id, reason, created_at
       FROM starter_coin_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, Math.max(1, Math.min(500, limit))],
  );
  return r.rows;
}

export async function listXpConfig() {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query(
    `SELECT source, xp_amount, enabled, description, updated_by, updated_at
       FROM xp_activity_config
      ORDER BY source ASC`,
  );
  return r.rows;
}

export async function updateXpConfig(input: {
  source: string;
  xpAmount: number;
  enabled: boolean;
  adminUserId: string;
}) {
  const pool = getPool();
  if (!pool) return null;
  const r = await pool.query(
    `UPDATE xp_activity_config
        SET xp_amount = $2, enabled = $3, updated_by = $4, updated_at = NOW()
      WHERE source = $1
      RETURNING *`,
    [input.source, input.xpAmount, input.enabled, input.adminUserId],
  );
  return r.rows[0] || null;
}

export async function listLevelRequirements() {
  const pool = getPool();
  if (!pool) return [];
  const r = await pool.query(
    `SELECT level, total_xp_required, title, badge_code,
            cosmetic_payload, updated_by, updated_at
       FROM xp_level_requirements
      ORDER BY level ASC`,
  );
  return r.rows;
}

export async function upsertLevelRequirement(input: {
  level: number;
  totalXpRequired: number;
  title?: string | null;
  badgeCode?: string | null;
  cosmeticPayload?: Record<string, unknown>;
  adminUserId: string;
}) {
  const pool = getPool();
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`LOCK TABLE xp_level_requirements IN SHARE ROW EXCLUSIVE MODE`);
    const neighbors = await client.query(
      `SELECT
         (SELECT MAX(total_xp_required) FROM xp_level_requirements WHERE level < $1)::bigint AS previous_xp,
         (SELECT MIN(total_xp_required) FROM xp_level_requirements WHERE level > $1)::bigint AS next_xp`,
      [input.level],
    );
    const previousXp =
      neighbors.rows[0]?.previous_xp == null
        ? null
        : Number(neighbors.rows[0].previous_xp);
    const nextXp =
      neighbors.rows[0]?.next_xp == null
        ? null
        : Number(neighbors.rows[0].next_xp);
    if (
      (previousXp != null && input.totalXpRequired <= previousXp) ||
      (nextXp != null && input.totalXpRequired >= nextXp)
    ) {
      throw new Error("LEVEL_XP_ORDER_INVALID");
    }
    const r = await client.query(
      `INSERT INTO xp_level_requirements
         (level, total_xp_required, title, badge_code, cosmetic_payload,
          updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
       ON CONFLICT (level) DO UPDATE SET
         total_xp_required = EXCLUDED.total_xp_required,
         title = EXCLUDED.title,
         badge_code = EXCLUDED.badge_code,
         cosmetic_payload = EXCLUDED.cosmetic_payload,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [
        input.level,
        input.totalXpRequired,
        input.title || null,
        input.badgeCode || null,
        JSON.stringify(input.cosmeticPayload || {}),
        input.adminUserId,
      ],
    );
    await client.query(
      `UPDATE user_progression up
          SET current_level = COALESCE(
                (SELECT MAX(level) FROM xp_level_requirements
                  WHERE total_xp_required <= up.total_xp),
                0
              ),
              updated_at = NOW()`,
    );
    await client.query(
      `UPDATE profiles p
          SET level = up.current_level, updated_at = NOW()
         FROM user_progression up
        WHERE up.user_id = p.user_id
          AND p.level IS DISTINCT FROM up.current_level`,
    );
    await client.query("COMMIT");
    return r.rows[0] || null;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Admin XP correction. Negative adjustments are allowed but total XP is
 * clamped at zero. Level is recalculated from configured requirements.
 */
export async function adminAdjustXp(input: {
  userId: string;
  xpDelta: number;
  reason: string;
  adminUserId: string;
  idempotencyKey: string;
}) {
  const pool = getPool();
  if (!pool) return null;
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
    const oldLevel = Number(before.rows[0]?.current_level) || 0;
    const oldXp = Number(before.rows[0]?.total_xp) || 0;
    const appliedDelta = Math.max(-oldXp, Math.trunc(input.xpDelta));
    if (appliedDelta === 0) {
      const snapshot = await progressionFromClient(client, input.userId);
      await client.query("COMMIT");
      return snapshot;
    }
    const tx = await client.query(
      `INSERT INTO xp_transactions
         (user_id, xp_amount, source, related_activity_type,
          idempotency_key, admin_user_id, reason)
       VALUES ($1, $2, 'admin_adjustment', 'admin', $3, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        input.userId,
        appliedDelta,
        input.idempotencyKey,
        input.adminUserId,
        input.reason,
      ],
    );
    if (!tx.rows[0]) {
      const snapshot = await progressionFromClient(client, input.userId);
      await client.query("COMMIT");
      return snapshot;
    }
    const newXp = oldXp + appliedDelta;
    const levelR = await client.query(
      `SELECT COALESCE(MAX(level), 0)::int AS level
         FROM xp_level_requirements
        WHERE total_xp_required <= $1`,
      [newXp],
    );
    const newLevel = Math.max(0, Number(levelR.rows[0]?.level) || 0);
    await client.query(
      `UPDATE user_progression
          SET total_xp = $2, current_level = $3, updated_at = NOW()
        WHERE user_id = $1`,
      [input.userId, newXp, newLevel],
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
        [input.userId, oldLevel, newLevel, newXp, tx.rows[0].id],
      );
    }
    const snapshot = await progressionFromClient(client, input.userId);
    await client.query("COMMIT");
    return snapshot;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ err, userId: input.userId }, "adminAdjustXp failed");
    return null;
  } finally {
    client.release();
  }
}

export async function adminAdjustStarterCoins(input: {
  userId: string;
  amountDelta: number;
  reason: string;
  adminUserId: string;
  idempotencyKey: string;
}) {
  const pool = getPool();
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO starter_coin_balances
         (user_id, balance, lifetime_granted, lifetime_spent)
       VALUES ($1, 0, 0, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [input.userId],
    );
    const current = await client.query(
      `SELECT balance::bigint AS balance
         FROM starter_coin_balances WHERE user_id = $1 FOR UPDATE`,
      [input.userId],
    );
    const oldBalance = Math.max(0, Number(current.rows[0]?.balance) || 0);
    const appliedDelta = Math.max(
      -oldBalance,
      Math.trunc(input.amountDelta),
    );
    if (appliedDelta === 0) {
      const snapshot = await progressionFromClient(client, input.userId);
      await client.query("COMMIT");
      return snapshot;
    }
    const newBalance = oldBalance + appliedDelta;
    const tx = await client.query(
      `INSERT INTO starter_coin_transactions
         (user_id, kind, amount_delta, balance_after, idempotency_key,
          admin_user_id, reason)
       VALUES ($1, 'admin_adjustment', $2, $3, $4, $5, $6)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        input.userId,
        appliedDelta,
        newBalance,
        input.idempotencyKey,
        input.adminUserId,
        input.reason,
      ],
    );
    if (tx.rows[0]) {
      await client.query(
        `UPDATE starter_coin_balances
            SET balance = $2,
                lifetime_granted = lifetime_granted + GREATEST($3, 0),
                updated_at = NOW()
          WHERE user_id = $1`,
        [input.userId, newBalance, appliedDelta],
      );
    }
    const snapshot = await progressionFromClient(client, input.userId);
    await client.query("COMMIT");
    return snapshot;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error(
      { err, userId: input.userId },
      "adminAdjustStarterCoins failed",
    );
    return null;
  } finally {
    client.release();
  }
}
