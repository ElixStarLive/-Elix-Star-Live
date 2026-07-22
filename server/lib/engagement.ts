/**
 * Engagement Phase 1 — Promotional Coins, Battle Energy, missions,
 * achievements, daily login, MVP scores, fan tier labels.
 * Never touches purchased wallet / IAP / Stripe / test coins.
 *
 * CRITICAL ECONOMY RULES:
 * - Battle Energy / Fan Energy multipliers affect battle score ONLY.
 *   They must never change Diamonds or creator earnings.
 * - Promotional Coin gifts (when enabled) create ZERO Diamonds.
 * - Wallet writes require ENGAGEMENT_NEON_APPROVED + per-feature flags.
 */
import { getPool } from "./postgres";
import { logger } from "./logger";
import { getProgressionSnapshot } from "./starterCoinsXp";
import {
  canWriteEngagementWallets,
  getEngagementFlags,
} from "./engagementFlags";

export type FanTier =
  | "Bronze Fan"
  | "Silver Fan"
  | "Gold Fan"
  | "Diamond Fan"
  | "Elite Fan"
  | "Legend Fan";

export function fanTierForLevel(level: number): FanTier {
  const lv = Math.max(0, Math.floor(level) || 0);
  if (lv >= 50) return "Legend Fan";
  if (lv >= 40) return "Elite Fan";
  if (lv >= 30) return "Diamond Fan";
  if (lv >= 20) return "Gold Fan";
  if (lv >= 10) return "Silver Fan";
  return "Bronze Fan";
}

export function periodKey(scope: string, d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  if (scope === "weekly") {
    const tmp = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil(
      ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
    return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return `${y}-${m}-${day}`;
}

export async function getPromoBalance(userId: string): Promise<number> {
  const db = getPool();
  if (!db || !userId) return 0;
  try {
    if (getEngagementFlags().promotionalCoinsEnabled) {
      await db.query(
        `INSERT INTO promotional_coin_balances (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      );
    }
    const r = await db.query(
      `SELECT balance::bigint AS b FROM promotional_coin_balances WHERE user_id = $1`,
      [userId],
    );
    return Math.max(0, Number(r.rows[0]?.b ?? 0));
  } catch {
    return 0;
  }
}

export async function getEnergyBalance(userId: string): Promise<number> {
  const db = getPool();
  if (!db || !userId) return 0;
  try {
    if (getEngagementFlags().battleEnergyEnabled) {
      await db.query(
        `INSERT INTO battle_energy_balances (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      );
    }
    const r = await db.query(
      `SELECT balance::bigint AS b FROM battle_energy_balances WHERE user_id = $1`,
      [userId],
    );
    return Math.max(0, Number(r.rows[0]?.b ?? 0));
  } catch {
    return 0;
  }
}

export async function creditPromoCoins(
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string,
): Promise<number> {
  if (!getEngagementFlags().promotionalCoinsEnabled) {
    return getPromoBalance(userId);
  }
  const db = getPool();
  const add = Math.max(0, Math.floor(amount));
  if (!db || !userId || add <= 0) return getPromoBalance(userId);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO promotional_coin_balances (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const cur = await client.query(
      `SELECT balance::bigint AS b FROM promotional_coin_balances WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const before = Math.max(0, Number(cur.rows[0]?.b ?? 0));
    const after = before + add;
    await client.query(
      `UPDATE promotional_coin_balances
          SET balance = $2, lifetime_granted = lifetime_granted + $3, updated_at = NOW()
        WHERE user_id = $1`,
      [userId, after, add],
    );
    await client.query(
      `INSERT INTO promotional_coin_ledger
         (user_id, amount_delta, balance_before, balance_after, direction, reason, reference_id)
       VALUES ($1, $2, $3, $4, 'credit', $5, $6)`,
      [userId, add, before, after, reason, referenceId || null],
    );
    await client.query("COMMIT");
    return after;
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err, userId }, "creditPromoCoins failed");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Debit Promotional Coins with ledger. Never touches purchased wallet or Diamonds.
 */
export async function spendPromoCoins(
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string,
): Promise<{ ok: boolean; balance: number; error?: string }> {
  if (
    !getEngagementFlags().promotionalCoinsEnabled ||
    !getEngagementFlags().promoGiftSpendEnabled
  ) {
    return {
      ok: false,
      balance: await getPromoBalance(userId),
      error: "PROMO_SPEND_DISABLED",
    };
  }
  const db = getPool();
  const spend = Math.max(0, Math.floor(amount));
  if (!db || !userId || spend <= 0) {
    return { ok: false, balance: await getPromoBalance(userId), error: "INVALID" };
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    if (referenceId) {
      const prior = await client.query(
        `SELECT balance_after::bigint AS b
           FROM promotional_coin_ledger
          WHERE user_id = $1
            AND reference_id = $2
            AND direction = 'debit'
          LIMIT 1`,
        [userId, referenceId],
      );
      if (prior.rows[0]) {
        await client.query("COMMIT");
        return {
          ok: true,
          balance: Math.max(0, Number(prior.rows[0].b) || 0),
        };
      }
    }
    await client.query(
      `INSERT INTO promotional_coin_balances (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const cur = await client.query(
      `SELECT balance::bigint AS b FROM promotional_coin_balances WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const before = Math.max(0, Number(cur.rows[0]?.b ?? 0));
    if (before < spend) {
      await client.query("ROLLBACK");
      return { ok: false, balance: before, error: "INSUFFICIENT_PROMO" };
    }
    const after = before - spend;
    await client.query(
      `UPDATE promotional_coin_balances
          SET balance = $2, lifetime_spent = lifetime_spent + $3, updated_at = NOW()
        WHERE user_id = $1`,
      [userId, after, spend],
    );
    await client.query(
      `INSERT INTO promotional_coin_ledger
         (user_id, amount_delta, balance_before, balance_after, direction, reason, reference_id)
       VALUES ($1, $2, $3, $4, 'debit', $5, $6)`,
      [userId, -spend, before, after, reason, referenceId || null],
    );
    await client.query("COMMIT");
    return { ok: true, balance: after };
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err, userId }, "spendPromoCoins failed");
    return {
      ok: false,
      balance: await getPromoBalance(userId),
      error: "DEBIT_FAILED",
    };
  } finally {
    client.release();
  }
}

export async function creditBattleEnergy(
  userId: string,
  amount: number,
  reason: string,
  referenceId?: string,
  roomId?: string,
): Promise<number> {
  if (!getEngagementFlags().battleEnergyEnabled) {
    return getEnergyBalance(userId);
  }
  const db = getPool();
  const add = Math.max(0, Math.floor(amount));
  if (!db || !userId || add <= 0) return getEnergyBalance(userId);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO battle_energy_balances (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const cur = await client.query(
      `SELECT balance::bigint AS b FROM battle_energy_balances WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const before = Math.max(0, Number(cur.rows[0]?.b ?? 0));
    const after = before + add;
    await client.query(
      `UPDATE battle_energy_balances
          SET balance = $2, lifetime_earned = lifetime_earned + $3, updated_at = NOW()
        WHERE user_id = $1`,
      [userId, after, add],
    );
    await client.query(
      `INSERT INTO battle_energy_ledger
         (user_id, amount_delta, balance_before, balance_after, direction, reason, reference_id, room_id)
       VALUES ($1, $2, $3, $4, 'credit', $5, $6, $7)`,
      [userId, add, before, after, reason, referenceId || null, roomId || null],
    );
    await client.query("COMMIT");
    return after;
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err, userId }, "creditBattleEnergy failed");
    throw err;
  } finally {
    client.release();
  }
}

export async function spendBattleEnergy(
  userId: string,
  amount: number,
  reason: string,
  roomId: string,
  side: "host" | "opponent",
): Promise<{
  ok: boolean;
  balance: number;
  fanEnergy?: number;
  energySpent?: number;
  boostActivated?: boolean;
  boostMultiplier?: number;
  boostEndsAt?: string | null;
  error?: string;
}> {
  if (!getEngagementFlags().battleEnergyEnabled) {
    return {
      ok: false,
      balance: await getEnergyBalance(userId),
      error: "BATTLE_ENERGY_DISABLED",
    };
  }
  const db = getPool();
  // Phase 1: minimum boost spend is 100 Energy.
  const spend = Math.max(100, Math.floor(amount));
  if (!db || !userId || !roomId) {
    return { ok: false, balance: await getEnergyBalance(userId), error: "INVALID" };
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO battle_energy_balances (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const cur = await client.query(
      `SELECT balance::bigint AS b FROM battle_energy_balances WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const before = Math.max(0, Number(cur.rows[0]?.b ?? 0));
    if (before < spend) {
      await client.query("ROLLBACK");
      return { ok: false, balance: before, error: "INSUFFICIENT_ENERGY" };
    }
    const after = before - spend;
    await client.query(
      `UPDATE battle_energy_balances
          SET balance = $2, lifetime_spent = lifetime_spent + $3, updated_at = NOW()
        WHERE user_id = $1`,
      [userId, after, spend],
    );
    await client.query(
      `INSERT INTO battle_energy_ledger
         (user_id, amount_delta, balance_before, balance_after, direction, reason, reference_id, room_id)
       VALUES ($1, $2, $3, $4, 'debit', $5, $6, $7)`,
      [userId, -spend, before, after, reason, `${roomId}:${side}`, roomId],
    );
    await client.query(
      `INSERT INTO battle_fan_energy (room_id, side, energy)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, side) DO UPDATE
         SET energy = battle_fan_energy.energy + EXCLUDED.energy, updated_at = NOW()`,
      [roomId, side, spend],
    );
    const fan = await client.query(
      `SELECT energy::bigint AS e FROM battle_fan_energy WHERE room_id = $1 AND side = $2`,
      [roomId, side],
    );
    await client.query("COMMIT");
    await bumpMission(userId, "energy_boosts", 1);
    await bumpAchievement(userId, "energy_spent", spend);
    const fanEnergy = Math.max(0, Number(fan.rows[0]?.e ?? 0));
    // Fan Energy threshold activates a temporary BATTLE SCORE multiplier only.
    // Never used for Diamonds / creator earnings.
    let threshold = 10000;
    let multiplier = 1.2;
    let durationSec = 5;
    try {
      const settings = await db.query(
        `SELECT value_json FROM engagement_settings WHERE key = 'fan_energy_boost'`,
      );
      const cfg = (settings.rows[0]?.value_json || {}) as {
        threshold?: number;
        multiplier?: number;
        duration_sec?: number;
      };
      threshold = Math.max(1, Number(cfg.threshold) || 10000);
      multiplier = Math.max(1, Number(cfg.multiplier) || 1.2);
      durationSec = Math.max(1, Number(cfg.duration_sec) || 5);
    } catch {
      /* defaults */
    }
    const boostActivated = fanEnergy >= threshold;
    return {
      ok: true,
      balance: after,
      fanEnergy,
      energySpent: spend,
      boostActivated,
      boostMultiplier: boostActivated ? multiplier : 1,
      boostEndsAt: boostActivated
        ? new Date(Date.now() + durationSec * 1000).toISOString()
        : null,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err, userId }, "spendBattleEnergy failed");
    return { ok: false, balance: await getEnergyBalance(userId), error: "BOOST_FAILED" };
  } finally {
    client.release();
  }
}

export async function earnBattleEnergy(
  userId: string,
  source: "watch" | "comment" | "share",
  roomId?: string,
): Promise<{ granted: number; balance: number }> {
  if (!getEngagementFlags().battleEnergyEnabled) {
    return { granted: 0, balance: 0 };
  }
  const db = getPool();
  if (!db || !userId) return { granted: 0, balance: 0 };
  // Phase 1 caps — loaded from engagement_settings with code defaults.
  const { getBattleEnergyCaps } = await import("./engagementAdmin");
  const capCfg = await getBattleEnergyCaps();
  if (!capCfg.enabled) {
    return { granted: 0, balance: 0 };
  }
  const amounts = {
    watch: capCfg.watch_amount,
    comment: capCfg.comment_amount,
    share: capCfg.share_amount,
  } as const;
  const caps = {
    watch: capCfg.watch_cap,
    comment: capCfg.comment_cap,
    share: capCfg.share_cap,
  } as const;
  const col =
    source === "watch"
      ? "watch_energy"
      : source === "comment"
        ? "comment_energy"
        : "share_energy";
  const dayKey = periodKey("daily");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO battle_energy_daily_caps (user_id, day_key) VALUES ($1, $2::date)
       ON CONFLICT (user_id, day_key) DO NOTHING`,
      [userId, dayKey],
    );
    const capRow = await client.query(
      `SELECT ${col}::bigint AS used FROM battle_energy_daily_caps
        WHERE user_id = $1 AND day_key = $2::date FOR UPDATE`,
      [userId, dayKey],
    );
    const used = Math.max(0, Number(capRow.rows[0]?.used ?? 0));
    const grant = Math.min(amounts[source], Math.max(0, caps[source] - used));
    if (grant <= 0) {
      await client.query("COMMIT");
      return { granted: 0, balance: await getEnergyBalance(userId) };
    }
    await client.query(
      `UPDATE battle_energy_daily_caps SET ${col} = ${col} + $3
        WHERE user_id = $1 AND day_key = $2::date`,
      [userId, dayKey, grant],
    );
    await client.query(
      `INSERT INTO battle_energy_balances (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    const cur = await client.query(
      `SELECT balance::bigint AS b FROM battle_energy_balances WHERE user_id = $1 FOR UPDATE`,
      [userId],
    );
    const before = Math.max(0, Number(cur.rows[0]?.b ?? 0));
    const after = before + grant;
    await client.query(
      `UPDATE battle_energy_balances
          SET balance = $2, lifetime_earned = lifetime_earned + $3, updated_at = NOW()
        WHERE user_id = $1`,
      [userId, after, grant],
    );
    await client.query(
      `INSERT INTO battle_energy_ledger
         (user_id, amount_delta, balance_before, balance_after, direction, reason, room_id)
       VALUES ($1, $2, $3, $4, 'credit', $5, $6)`,
      [userId, grant, before, after, `earn_${source}`, roomId || null],
    );
    await client.query("COMMIT");
    if (source === "watch") await bumpMission(userId, "watch_minutes", 1);
    if (source === "comment") await bumpMission(userId, "comments", 1);
    if (source === "share") await bumpMission(userId, "shares", 1);
    return { granted: grant, balance: after };
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err, userId, source }, "earnBattleEnergy failed");
    return { granted: 0, balance: await getEnergyBalance(userId) };
  } finally {
    client.release();
  }
}

export async function bumpMission(
  userId: string,
  metricKey: string,
  delta: number,
): Promise<void> {
  const db = getPool();
  if (!db || !userId || delta <= 0) return;
  try {
    const missions = await db.query(
      `SELECT id, scope, goal_count FROM engagement_missions
        WHERE enabled = TRUE AND metric_key = $1`,
      [metricKey],
    );
    for (const m of missions.rows) {
      const pk = periodKey(String(m.scope));
      await db.query(
        `INSERT INTO user_mission_progress (user_id, mission_id, period_key, progress, completed)
         VALUES ($1, $2, $3, LEAST($4, $5), $4 >= $5)
         ON CONFLICT (user_id, mission_id, period_key) DO UPDATE SET
           progress = LEAST($5, user_mission_progress.progress + $4),
           completed = (LEAST($5, user_mission_progress.progress + $4) >= $5)
             OR user_mission_progress.completed,
           updated_at = NOW()`,
        [userId, m.id, pk, delta, m.goal_count],
      );
    }
  } catch (err) {
    logger.warn({ err, userId, metricKey }, "bumpMission failed");
  }
}

/**
 * Count a creator once per weekly period for unique_creators missions.
 * Returns true when this creator is newly recorded for the period.
 */
export async function recordUniqueCreatorVisit(
  userId: string,
  creatorId: string,
): Promise<boolean> {
  const db = getPool();
  const creator = String(creatorId || "").trim();
  if (!db || !userId || !creator || userId === creator) return false;
  const pk = periodKey("weekly");
  try {
    const ins = await db.query(
      `INSERT INTO user_engagement_unique_creators (user_id, creator_id, period_key)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, creator_id, period_key) DO NOTHING
       RETURNING creator_id`,
      [userId, creator, pk],
    );
    return (ins.rowCount ?? 0) > 0;
  } catch (err) {
    logger.warn({ err, userId, creator }, "recordUniqueCreatorVisit failed");
    return false;
  }
}

export async function bumpAchievement(
  userId: string,
  metricKey: string,
  delta: number,
): Promise<void> {
  const db = getPool();
  if (!db || !userId || delta <= 0) return;
  try {
    const rows = await db.query(
      `SELECT id, goal_count, reward_xp, reward_promo_coins FROM engagement_achievements
        WHERE enabled = TRUE AND metric_key = $1`,
      [metricKey],
    );
    for (const a of rows.rows) {
      const r = await db.query(
        `INSERT INTO user_achievements (user_id, achievement_id, progress, unlocked, unlocked_at)
         VALUES ($1, $2, LEAST($3, $4), $3 >= $4, CASE WHEN $3 >= $4 THEN NOW() ELSE NULL END)
         ON CONFLICT (user_id, achievement_id) DO UPDATE SET
           progress = LEAST($4, user_achievements.progress + $3),
           unlocked = user_achievements.unlocked OR (user_achievements.progress + $3) >= $4,
           unlocked_at = COALESCE(
             user_achievements.unlocked_at,
             CASE WHEN (user_achievements.progress + $3) >= $4 THEN NOW() ELSE NULL END
           )
         RETURNING unlocked, claimed`,
        [userId, a.id, delta, a.goal_count],
      );
      const row = r.rows[0];
      if (row?.unlocked && !row.claimed) {
        const upd = await db.query(
          `UPDATE user_achievements SET claimed = TRUE
            WHERE user_id = $1 AND achievement_id = $2 AND claimed = FALSE
            RETURNING achievement_id`,
          [userId, a.id],
        );
        if (upd.rowCount) {
          if (Number(a.reward_promo_coins) > 0) {
            await creditPromoCoins(
              userId,
              Number(a.reward_promo_coins),
              "achievement",
              a.id,
            );
          }
          if (Number(a.reward_xp) > 0) {
            await awardEngagementXp(
              userId,
              Number(a.reward_xp),
              `achievement:${a.id}`,
            );
          }
        }
      }
    }
  } catch (err) {
    logger.warn({ err, userId, metricKey }, "bumpAchievement failed");
  }
}

export async function awardEngagementXp(
  userId: string,
  xp: number,
  reason: string,
): Promise<void> {
  const db = getPool();
  const gain = Math.max(0, Math.floor(xp));
  if (!db || !userId || gain <= 0) return;
  try {
    await db.query(
      `INSERT INTO user_progression (user_id, total_xp, current_level)
       VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO UPDATE SET
         total_xp = user_progression.total_xp + $2,
         updated_at = NOW()`,
      [userId, gain],
    );
    await db.query(
      `UPDATE user_progression up SET current_level = COALESCE((
         SELECT MAX(level) FROM xp_level_requirements
          WHERE total_xp_required <= up.total_xp
       ), 0), updated_at = NOW()
       WHERE user_id = $1`,
      [userId],
    );
    void reason;
  } catch (err) {
    logger.warn({ err, userId, reason }, "awardEngagementXp failed");
  }
}

export async function listMissionsForUser(userId: string) {
  const db = getPool();
  if (!db) return [];
  try {
    const { getMissionAdminMeta } = await import("./engagementAdmin");
    const meta = await getMissionAdminMeta();
    let isCreator = false;
    try {
      const cr = await db.query(
        `SELECT COALESCE(is_verified, FALSE) AS c FROM profiles WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      isCreator = !!cr.rows[0]?.c;
    } catch {
      isCreator = false;
    }
    const accountAgeDays = await (async () => {
      try {
        const r = await db.query(
          `SELECT EXTRACT(EPOCH FROM (NOW() - created_at))/86400.0 AS d
             FROM profiles WHERE user_id = $1 LIMIT 1`,
          [userId],
        );
        return Number(r.rows[0]?.d ?? 999);
      } catch {
        return 999;
      }
    })();

    const missions = await db.query(
      `SELECT * FROM engagement_missions WHERE enabled = TRUE ORDER BY scope, sort_order`,
    );
    const out = [];
    const now = Date.now();
    for (const m of missions.rows) {
      const mm = meta[m.id];
      if (mm?.archived) continue;
      if (mm?.starts_at) {
        const t = Date.parse(mm.starts_at);
        if (Number.isFinite(t) && t > now) continue;
      }
      if (mm?.ends_at) {
        const t = Date.parse(mm.ends_at);
        if (Number.isFinite(t) && t < now) continue;
      }
      const audience = mm?.audience || "all_authenticated";
      if (audience === "creators_only" && !isCreator) continue;
      if (audience === "viewers_only" && isCreator) continue;
      if (audience === "new_users" && accountAgeDays > 14) continue;

      const pk = periodKey(String(m.scope));
      const p = await db.query(
        `SELECT progress, completed, claimed FROM user_mission_progress
          WHERE user_id = $1 AND mission_id = $2 AND period_key = $3`,
        [userId, m.id, pk],
      );
      const prog = p.rows[0];
      out.push({
        id: m.id,
        scope: m.scope,
        title: m.title,
        description: m.description,
        goal_count: Number(m.goal_count),
        reward_xp: Number(m.reward_xp),
        reward_promo_coins: Number(m.reward_promo_coins),
        reward_energy: Number(m.reward_energy),
        metric_key: m.metric_key,
        period_key: pk,
        progress: Number(prog?.progress ?? 0),
        completed: !!prog?.completed,
        claimed: !!prog?.claimed,
        audience,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function claimMission(
  userId: string,
  missionId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!getEngagementFlags().missionRewardsEnabled) {
    return { ok: false, error: "MISSION_REWARDS_DISABLED" };
  }
  if (!canWriteEngagementWallets()) {
    return { ok: false, error: "ENGAGEMENT_NEON_PENDING_APPROVAL" };
  }
  const db = getPool();
  if (!db) return { ok: false, error: "DATABASE_UNAVAILABLE" };
  let mission: Record<string, unknown> | undefined;
  try {
    const m = await db.query(
      `SELECT * FROM engagement_missions WHERE id = $1 AND enabled = TRUE`,
      [missionId],
    );
    mission = m.rows[0];
  } catch {
    return { ok: false, error: "ENGAGEMENT_SCHEMA_PENDING" };
  }
  if (!mission) return { ok: false, error: "NOT_FOUND" };
  const pk = periodKey(String(mission.scope));
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const p = await client.query(
      `SELECT progress, completed, claimed FROM user_mission_progress
        WHERE user_id = $1 AND mission_id = $2 AND period_key = $3 FOR UPDATE`,
      [userId, missionId, pk],
    );
    const row = p.rows[0];
    if (!row || !row.completed) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NOT_COMPLETE" };
    }
    if (row.claimed) {
      await client.query("ROLLBACK");
      return { ok: false, error: "ALREADY_CLAIMED" };
    }
    await client.query(
      `UPDATE user_mission_progress SET claimed = TRUE, updated_at = NOW()
        WHERE user_id = $1 AND mission_id = $2 AND period_key = $3`,
      [userId, missionId, pk],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err, userId, missionId }, "claimMission failed");
    return { ok: false, error: "CLAIM_FAILED" };
  } finally {
    client.release();
  }
  // Promo / energy only when those flags are on (credit helpers also gate).
  if (Number(mission.reward_promo_coins) > 0) {
    await creditPromoCoins(
      userId,
      Number(mission.reward_promo_coins),
      "mission_claim",
      missionId,
    );
  }
  if (Number(mission.reward_energy) > 0) {
    await creditBattleEnergy(
      userId,
      Number(mission.reward_energy),
      "mission_claim",
      missionId,
    );
  }
  if (Number(mission.reward_xp) > 0) {
    await awardEngagementXp(
      userId,
      Number(mission.reward_xp),
      `mission:${missionId}`,
    );
  }
  try {
    const { spawnTreasureChest } = await import("./engagementPhase15");
    await spawnTreasureChest(userId, "chest_rare_missions", `mission:${missionId}`);
    if (String(mission.metric_key) === "unique_creators") {
      await spawnTreasureChest(userId, "chest_epic_streams", `mission:${missionId}`);
    }
  } catch (err) {
    logger.warn({ err, userId, missionId }, "mission treasure spawn skipped");
  }
  return { ok: true };
}

export async function listAchievementsForUser(userId: string) {
  const db = getPool();
  if (!db) return [];
  try {
    const a = await db.query(
      `SELECT * FROM engagement_achievements WHERE enabled = TRUE ORDER BY rarity, id`,
    );
    const out = [];
    for (const row of a.rows) {
      const u = await db.query(
        `SELECT progress, unlocked, unlocked_at, claimed FROM user_achievements
          WHERE user_id = $1 AND achievement_id = $2`,
        [userId, row.id],
      );
      const p = u.rows[0];
      out.push({
        id: row.id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        goal_count: Number(row.goal_count),
        reward_xp: Number(row.reward_xp),
        reward_promo_coins: Number(row.reward_promo_coins),
        rarity: row.rarity,
        progress: Number(p?.progress ?? 0),
        unlocked: !!p?.unlocked,
        unlocked_at: p?.unlocked_at || null,
        claimed: !!p?.claimed,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function getDailyLoginState(userId: string) {
  const db = getPool();
  const empty = {
    can_claim: false,
    streak_day: 1,
    claimed_today: false,
    next_reward: null as null | Record<string, unknown>,
  };
  if (!db || !getEngagementFlags().dailyLoginEnabled) return empty;
  try {
    const today = periodKey("daily");
    const todayClaim = await db.query(
      `SELECT streak_day FROM daily_reward_claims WHERE user_id = $1 AND claim_date = $2::date`,
      [userId, today],
    );
    if (todayClaim.rows[0]) {
      return {
        can_claim: false,
        streak_day: Number(todayClaim.rows[0].streak_day),
        claimed_today: true,
        next_reward: null,
      };
    }
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yKey = periodKey("daily", yesterday);
    const yClaim = await db.query(
      `SELECT streak_day FROM daily_reward_claims WHERE user_id = $1 AND claim_date = $2::date`,
      [userId, yKey],
    );
    const prev = Number(yClaim.rows[0]?.streak_day ?? 0);
    const nextDay = prev >= 1 && prev < 7 ? prev + 1 : 1;
    const cfg = await db.query(
      `SELECT * FROM daily_reward_config WHERE streak_day = $1`,
      [nextDay],
    );
    return {
      can_claim: canWriteEngagementWallets(),
      streak_day: nextDay,
      claimed_today: false,
      next_reward: cfg.rows[0]
        ? {
            streak_day: Number(cfg.rows[0].streak_day),
            reward_xp: Number(cfg.rows[0].reward_xp),
            reward_promo_coins: Number(cfg.rows[0].reward_promo_coins),
            reward_label: String(cfg.rows[0].reward_label),
          }
        : null,
    };
  } catch {
    return empty;
  }
}

export async function claimDailyLogin(userId: string) {
  if (!getEngagementFlags().dailyLoginEnabled) {
    return { ok: false as const, error: "DAILY_LOGIN_DISABLED" };
  }
  if (!canWriteEngagementWallets()) {
    return { ok: false as const, error: "ENGAGEMENT_NEON_PENDING_APPROVAL" };
  }
  const db = getPool();
  if (!db) return { ok: false as const, error: "DATABASE_UNAVAILABLE" };
  const state = await getDailyLoginState(userId);
  if (!state.can_claim) {
    // Idempotent: if already claimed today, return original-day info.
    if (state.claimed_today) {
      return {
        ok: true as const,
        already_claimed: true,
        streak_day: state.streak_day,
        reward: null,
      };
    }
    return { ok: false as const, error: "ALREADY_CLAIMED" };
  }
  const day = state.streak_day;
  let reward: Record<string, unknown> | undefined;
  try {
    const cfg = await db.query(
      `SELECT * FROM daily_reward_config WHERE streak_day = $1`,
      [day],
    );
    reward = cfg.rows[0];
  } catch {
    return { ok: false as const, error: "ENGAGEMENT_SCHEMA_PENDING" };
  }
  if (!reward) return { ok: false as const, error: "NO_CONFIG" };
  const today = periodKey("daily");
  try {
    await db.query(
      `INSERT INTO daily_reward_claims
         (user_id, claim_date, streak_day, reward_xp, reward_promo_coins, reward_label)
       VALUES ($1, $2::date, $3, $4, $5, $6)`,
      [
        userId,
        today,
        day,
        reward.reward_xp,
        reward.reward_promo_coins,
        reward.reward_label,
      ],
    );
  } catch {
    // Unique(user_id, claim_date) — duplicate claim is idempotent.
    const again = await getDailyLoginState(userId);
    return {
      ok: true as const,
      already_claimed: true,
      streak_day: again.streak_day,
      reward: null,
    };
  }
  if (Number(reward.reward_promo_coins) > 0) {
    await creditPromoCoins(
      userId,
      Number(reward.reward_promo_coins),
      "daily_login",
      `day-${day}`,
    );
  }
  if (Number(reward.reward_xp) > 0) {
    await awardEngagementXp(
      userId,
      Number(reward.reward_xp),
      `daily_login:${day}`,
    );
  }
  await bumpMission(userId, "login_streak_days", 1);
  // Progress by +1 per claim (not +streak_day), so day-7 unlocks correctly.
  await bumpAchievement(userId, "login_streak_days", 1);
  if (day === 7 || day === 5) {
    try {
      const { spawnTreasureChest } = await import("./engagementPhase15");
      await spawnTreasureChest(
        userId,
        day === 7 ? "chest_legendary_streak" : "chest_rare_missions",
        "daily_login",
      );
    } catch (err) {
      logger.warn({ err, userId, day }, "daily login treasure spawn skipped");
    }
  }
  return {
    ok: true as const,
    streak_day: day,
    reward: {
      reward_xp: Number(reward.reward_xp),
      reward_promo_coins: Number(reward.reward_promo_coins),
      reward_label: String(reward.reward_label),
    },
  };
}

export async function addMvpPoints(
  userId: string,
  points: number,
  opts: { roomId?: string; hostUserId?: string; source?: string },
): Promise<void> {
  const db = getPool();
  const pts = Math.max(0, Math.floor(points));
  if (!db || !userId || pts <= 0) return;
  try {
    await db.query(
      `INSERT INTO mvp_scores (user_id, room_id, host_user_id, points, source, day_key)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)`,
      [
        userId,
        opts.roomId || "",
        opts.hostUserId || "",
        pts,
        opts.source || "gift",
      ],
    );
    // Unlock mvp_top10 when the user is currently in today's top 10.
    const board = await getMvpLeaderboard("today", 10);
    if (board.some((row) => row.user_id === userId && row.rank <= 10)) {
      await bumpAchievement(userId, "mvp_top10", 1);
    }
  } catch (err) {
    logger.warn({ err, userId }, "addMvpPoints failed");
  }
}

export async function getMvpLeaderboard(
  period: "today" | "week" | "all",
  limit = 50,
) {
  const db = getPool();
  if (!db) return [];
  let where = "TRUE";
  if (period === "today") where = "day_key = CURRENT_DATE";
  if (period === "week") {
    where = "day_key >= (CURRENT_DATE - INTERVAL '7 days')";
  }
  const r = await db.query(
    `SELECT user_id, SUM(points)::bigint AS points
       FROM mvp_scores
      WHERE ${where}
      GROUP BY user_id
      ORDER BY points DESC
      LIMIT $1`,
    [Math.min(100, Math.max(1, limit))],
  );
  return r.rows.map((row, i) => ({
    rank: i + 1,
    user_id: row.user_id,
    points: Number(row.points ?? 0),
  }));
}

export async function getFanEnergy(roomId: string) {
  const db = getPool();
  if (!db || !roomId) return { host: 0, opponent: 0 };
  const r = await db.query(
    `SELECT side, energy::bigint AS e FROM battle_fan_energy WHERE room_id = $1`,
    [roomId],
  );
  let host = 0;
  let opponent = 0;
  for (const row of r.rows) {
    if (row.side === "host") host = Number(row.e ?? 0);
    if (row.side === "opponent") opponent = Number(row.e ?? 0);
  }
  return { host, opponent };
}

/** When Fan Energy >= threshold, apply gift-score multiplier (default 1.2).
 * CRITICAL: This multiplier is for battle score ONLY. Creator Diamonds must
 * always use giftEconomicValue (purchased/starter coin cost), never this.
 */
export async function fanEnergyGiftMultiplier(
  roomId: string,
  side: "host" | "opponent",
): Promise<number> {
  if (!getEngagementFlags().battleEnergyEnabled) return 1;
  const db = getPool();
  if (!db || !roomId) return 1;
  try {
    const settings = await db.query(
      `SELECT value_json FROM engagement_settings WHERE key = 'fan_energy_boost'`,
    );
    const cfg = (settings.rows[0]?.value_json || {}) as {
      threshold?: number;
      multiplier?: number;
    };
    const threshold = Math.max(1, Number(cfg.threshold) || 10000);
    const multiplier = Math.max(1, Number(cfg.multiplier) || 1.2);
    const fan = await getFanEnergy(roomId);
    const energy = side === "opponent" ? fan.opponent : fan.host;
    return energy >= threshold ? multiplier : 1;
  } catch {
    return 1;
  }
}

export async function getHubSummary(userId: string) {
  const [promo, energy, progression, daily, missions] = await Promise.all([
    getPromoBalance(userId),
    getEnergyBalance(userId),
    getProgressionSnapshot(userId),
    getDailyLoginState(userId),
    listMissionsForUser(userId),
  ]);
  const level = Number(progression?.current_level ?? 0);
  const incomplete = missions.filter((m) => !m.claimed).length;
  return {
    promotional_coins: promo,
    battle_energy: energy,
    total_xp: Number(progression?.total_xp ?? 0),
    fan_level: level,
    fan_tier: fanTierForLevel(level),
    daily_login: daily,
    missions_open: incomplete,
    starter_coin_balance: Number(progression?.starter_coin_balance ?? 0),
  };
}
