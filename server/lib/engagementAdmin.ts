import { getPool } from "./postgres";
import { logger } from "./logger";
import {
  type EngagementFlags,
  getEngagementFlagsFromEnv,
} from "./engagementFlags";

const FEATURE_FLAGS_KEY = "feature_flags";
const BATTLE_ENERGY_CAPS_KEY = "battle_energy_caps";

export type BattleEnergyCaps = {
  watch_amount: number;
  comment_amount: number;
  share_amount: number;
  watch_cap: number;
  comment_cap: number;
  share_cap: number;
};

export const DEFAULT_BATTLE_ENERGY_CAPS: BattleEnergyCaps = {
  watch_amount: 5,
  comment_amount: 2,
  share_amount: 20,
  watch_cap: 300,
  comment_cap: 20,
  share_cap: 1,
};

async function writeAdminAudit(
  adminUserId: string,
  action: string,
  target: string,
  previousValue: unknown,
  newValue: unknown,
): Promise<void> {
  const db = getPool();
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO engagement_admin_audit
         (admin_user_id, action, target, previous_value, new_value)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      [
        adminUserId,
        action,
        target,
        JSON.stringify(previousValue ?? null),
        JSON.stringify(newValue ?? null),
      ],
    );
  } catch (err) {
    logger.warn({ err, action, target }, "engagement admin audit write failed");
  }
}

export async function listMissionsAdmin() {
  const db = getPool();
  if (!db) return [];
  const r = await db.query(
    `SELECT id, scope, title, description, goal_count, reward_xp,
            reward_promo_coins, reward_energy, metric_key, enabled, sort_order
       FROM engagement_missions
      ORDER BY scope, sort_order, id`,
  );
  return r.rows;
}

export async function createMissionAdmin(input: {
  id: string;
  scope: "daily" | "weekly" | "creator" | "special";
  title: string;
  description?: string | null;
  goal_count: number;
  reward_xp: number;
  reward_promo_coins: number;
  reward_energy: number;
  metric_key: string;
  sort_order?: number;
  adminUserId: string;
}) {
  const db = getPool();
  if (!db) return null;
  const id = String(input.id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 80);
  if (!id) return null;
  const r = await db.query(
    `INSERT INTO engagement_missions
       (id, scope, title, description, goal_count, reward_xp, reward_promo_coins,
        reward_energy, metric_key, enabled, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,$10)
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [
      id,
      input.scope,
      input.title.slice(0, 200),
      input.description ?? null,
      Math.max(1, Math.floor(input.goal_count)),
      Math.max(0, Math.floor(input.reward_xp)),
      Math.max(0, Math.floor(input.reward_promo_coins)),
      Math.max(0, Math.floor(input.reward_energy)),
      String(input.metric_key).slice(0, 80),
      Math.floor(input.sort_order ?? 100),
    ],
  );
  if (!r.rows[0]) return null;
  await writeAdminAudit(
    input.adminUserId,
    "mission_create",
    id,
    null,
    r.rows[0],
  );
  return r.rows[0];
}

export async function updateMissionAdmin(input: {
  id: string;
  title?: string;
  description?: string | null;
  goal_count?: number;
  reward_xp?: number;
  reward_promo_coins?: number;
  reward_energy?: number;
  enabled?: boolean;
  sort_order?: number;
  adminUserId: string;
}) {
  const db = getPool();
  if (!db) return null;
  const prev = await db.query(
    `SELECT * FROM engagement_missions WHERE id = $1`,
    [input.id],
  );
  if (!prev.rows[0]) return null;
  const claimed = await db.query(
    `SELECT COUNT(*)::int AS c FROM user_mission_progress
      WHERE mission_id = $1 AND claimed = TRUE`,
    [input.id],
  );
  const claimedCount = Number(claimed.rows[0]?.c || 0);
  const row = prev.rows[0];
  // If already claimed, only allow enable/disable + sort — not reward/goal edits.
  const lockRewards = claimedCount > 0;
  const next = {
    title: input.title ?? row.title,
    description:
      input.description !== undefined ? input.description : row.description,
    goal_count: lockRewards
      ? Number(row.goal_count)
      : input.goal_count !== undefined
        ? Math.max(1, Math.floor(input.goal_count))
        : Number(row.goal_count),
    reward_xp: lockRewards
      ? Number(row.reward_xp)
      : input.reward_xp !== undefined
        ? Math.max(0, Math.floor(input.reward_xp))
        : Number(row.reward_xp),
    reward_promo_coins: lockRewards
      ? Number(row.reward_promo_coins)
      : input.reward_promo_coins !== undefined
        ? Math.max(0, Math.floor(input.reward_promo_coins))
        : Number(row.reward_promo_coins),
    reward_energy: lockRewards
      ? Number(row.reward_energy)
      : input.reward_energy !== undefined
        ? Math.max(0, Math.floor(input.reward_energy))
        : Number(row.reward_energy),
    enabled: input.enabled !== undefined ? !!input.enabled : !!row.enabled,
    sort_order:
      input.sort_order !== undefined
        ? Math.floor(input.sort_order)
        : Number(row.sort_order),
  };
  const r = await db.query(
    `UPDATE engagement_missions
        SET title = $2,
            description = $3,
            goal_count = $4,
            reward_xp = $5,
            reward_promo_coins = $6,
            reward_energy = $7,
            enabled = $8,
            sort_order = $9
      WHERE id = $1
      RETURNING *`,
    [
      input.id,
      next.title,
      next.description,
      next.goal_count,
      next.reward_xp,
      next.reward_promo_coins,
      next.reward_energy,
      next.enabled,
      next.sort_order,
    ],
  );
  await writeAdminAudit(
    input.adminUserId,
    "mission_update",
    input.id,
    { ...row, claimedCount },
    r.rows[0],
  );
  return r.rows[0];
}

export async function archiveMissionAdmin(input: {
  id: string;
  adminUserId: string;
}) {
  const db = getPool();
  if (!db) return null;
  const claims = await db.query(
    `SELECT COUNT(*)::int AS c FROM user_mission_progress
      WHERE mission_id = $1 AND claimed = TRUE`,
    [input.id],
  );
  const claimedCount = Number(claims.rows[0]?.c || 0);
  const prev = await db.query(
    `SELECT * FROM engagement_missions WHERE id = $1`,
    [input.id],
  );
  if (!prev.rows[0]) return null;
  // Soft-archive: disable. Do not mutate rewards if already claimed.
  const r = await db.query(
    `UPDATE engagement_missions SET enabled = FALSE WHERE id = $1 RETURNING *`,
    [input.id],
  );
  await writeAdminAudit(
    input.adminUserId,
    "mission_archive",
    input.id,
    { ...prev.rows[0], claimedCount },
    r.rows[0],
  );
  return { mission: r.rows[0], claimedCount };
}

export async function getMissionStatsAdmin(missionId: string) {
  const db = getPool();
  if (!db) return null;
  const r = await db.query(
    `SELECT
       COUNT(*)::int AS participants,
       COUNT(*) FILTER (WHERE completed)::int AS completed,
       COUNT(*) FILTER (WHERE claimed)::int AS claimed
     FROM user_mission_progress
     WHERE mission_id = $1`,
    [missionId],
  );
  return r.rows[0] || { participants: 0, completed: 0, claimed: 0 };
}

export async function listDailyRewardConfigAdmin() {
  const db = getPool();
  if (!db) return [];
  const r = await db.query(
    `SELECT streak_day, reward_xp, reward_promo_coins, reward_label
       FROM daily_reward_config
      ORDER BY streak_day ASC`,
  );
  return r.rows;
}

export async function updateDailyRewardConfigAdmin(input: {
  streakDay: number;
  reward_xp: number;
  reward_promo_coins: number;
  reward_label?: string | null;
  adminUserId: string;
}) {
  const db = getPool();
  if (!db) return null;
  const day = Math.floor(input.streakDay);
  if (day < 1 || day > 7) return null;
  const prev = await db.query(
    `SELECT * FROM daily_reward_config WHERE streak_day = $1`,
    [day],
  );
  const r = await db.query(
    `INSERT INTO daily_reward_config (streak_day, reward_xp, reward_promo_coins, reward_label)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (streak_day) DO UPDATE SET
       reward_xp = EXCLUDED.reward_xp,
       reward_promo_coins = EXCLUDED.reward_promo_coins,
       reward_label = EXCLUDED.reward_label
     RETURNING *`,
    [
      day,
      Math.max(0, Math.floor(input.reward_xp)),
      Math.max(0, Math.floor(input.reward_promo_coins)),
      input.reward_label ?? null,
    ],
  );
  await writeAdminAudit(
    input.adminUserId,
    "daily_reward_update",
    `day_${day}`,
    prev.rows[0] || null,
    r.rows[0],
  );
  return r.rows[0];
}

export async function getBattleEnergyCaps(): Promise<BattleEnergyCaps> {
  const db = getPool();
  if (!db) return { ...DEFAULT_BATTLE_ENERGY_CAPS };
  try {
    const r = await db.query(
      `SELECT value_json FROM engagement_settings WHERE key = $1`,
      [BATTLE_ENERGY_CAPS_KEY],
    );
    const raw = r.rows[0]?.value_json;
    if (!raw || typeof raw !== "object") return { ...DEFAULT_BATTLE_ENERGY_CAPS };
    const v = raw as Record<string, unknown>;
    return {
      watch_amount: Math.max(
        0,
        Math.floor(Number(v.watch_amount ?? v.watch_per_minute ?? 5)),
      ),
      comment_amount: Math.max(0, Math.floor(Number(v.comment_amount ?? v.comment ?? 2))),
      share_amount: Math.max(0, Math.floor(Number(v.share_amount ?? v.share ?? 20))),
      watch_cap: Math.max(
        0,
        Math.floor(Number(v.watch_cap ?? v.watch_per_battle ?? 300)),
      ),
      comment_cap: Math.max(
        0,
        Math.floor(Number(v.comment_cap ?? v.comment_per_battle ?? 20)),
      ),
      share_cap: Math.max(0, Math.floor(Number(v.share_cap ?? v.share_per_day ?? 1))),
    };
  } catch {
    return { ...DEFAULT_BATTLE_ENERGY_CAPS };
  }
}

export async function updateBattleEnergyCapsAdmin(
  caps: BattleEnergyCaps,
  adminUserId: string,
): Promise<BattleEnergyCaps> {
  const db = getPool();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const prev = await getBattleEnergyCaps();
  const next: BattleEnergyCaps = {
    watch_amount: Math.max(0, Math.floor(caps.watch_amount)),
    comment_amount: Math.max(0, Math.floor(caps.comment_amount)),
    share_amount: Math.max(0, Math.floor(caps.share_amount)),
    watch_cap: Math.max(0, Math.floor(caps.watch_cap)),
    comment_cap: Math.max(0, Math.floor(caps.comment_cap)),
    share_cap: Math.max(0, Math.floor(caps.share_cap)),
  };
  await db.query(
    `INSERT INTO engagement_settings (key, value_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json`,
    [BATTLE_ENERGY_CAPS_KEY, JSON.stringify(next)],
  );
  await writeAdminAudit(
    adminUserId,
    "battle_energy_caps_update",
    BATTLE_ENERGY_CAPS_KEY,
    prev,
    next,
  );
  return next;
}

async function loadFlagOverrides(): Promise<Partial<EngagementFlags>> {
  const db = getPool();
  if (!db) return {};
  try {
    const r = await db.query(
      `SELECT value_json FROM engagement_settings WHERE key = $1`,
      [FEATURE_FLAGS_KEY],
    );
    const raw = r.rows[0]?.value_json;
    if (!raw || typeof raw !== "object") return {};
    const out: Partial<EngagementFlags> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "boolean" && k in getEngagementFlagsFromEnv()) {
        (out as Record<string, boolean>)[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Env baseline merged with DB overrides. Env kill-switch for Neon always wins when false. */
export async function getEngagementFlagsMerged(): Promise<EngagementFlags> {
  const envFlags = getEngagementFlagsFromEnv();
  const overrides = await loadFlagOverrides();
  const merged = { ...envFlags, ...overrides };
  if (!envFlags.engagementNeonApproved) {
    merged.engagementNeonApproved = false;
    merged.promotionalCoinsEnabled = false;
    merged.battleEnergyEnabled = false;
    merged.promoGiftSpendEnabled = false;
  }
  return merged;
}

export async function updateFeatureFlagsAdmin(
  patch: Partial<EngagementFlags>,
  adminUserId: string,
): Promise<EngagementFlags> {
  const db = getPool();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const prev = await getEngagementFlagsMerged();
  const allowed: (keyof EngagementFlags)[] = [
    "engagementHubEnabled",
    "promotionalCoinsEnabled",
    "battleEnergyEnabled",
    "dailyLoginEnabled",
    "missionRewardsEnabled",
    "promoGiftSpendEnabled",
    "treasureHuntEnabled",
    "stickerCollectionEnabled",
    "creatorCollectionsEnabled",
    "engagementNeonApproved",
    "liveQuestsEnabled",
    "petEvolutionEnabled",
    "worldEventsEnabled",
    "guildsEnabled",
    "appleSignInEnabled",
  ];
  const nextOverrides: Partial<EngagementFlags> = {
    ...(await loadFlagOverrides()),
  };
  for (const key of allowed) {
    if (typeof patch[key] === "boolean") {
      nextOverrides[key] = patch[key];
    }
  }
  await db.query(
    `INSERT INTO engagement_settings (key, value_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json`,
    [FEATURE_FLAGS_KEY, JSON.stringify(nextOverrides)],
  );
  const next = await getEngagementFlagsMerged();
  const { setEngagementFlagOverrides } = await import("./engagementFlags");
  setEngagementFlagOverrides(await loadFlagOverrides());
  await writeAdminAudit(
    adminUserId,
    "feature_flags_update",
    FEATURE_FLAGS_KEY,
    prev,
    next,
  );
  return next;
}

/** Call once at boot so sync getEngagementFlags() sees DB overrides. */
export async function warmEngagementFlagCache(): Promise<void> {
  const { setEngagementFlagOverrides } = await import("./engagementFlags");
  setEngagementFlagOverrides(await loadFlagOverrides());
}
