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
  /** Storage / wallet energy cap (not Diamonds). */
  storage_cap: number;
  session_cap: number;
  daily_cap: number;
  minimum_boost: number;
  allowed_boost_values: number[];
  fan_energy_threshold: number;
  /** Score multiplier only — never Diamonds. Server floor 1.0, cap 5.0 */
  score_multiplier: number;
  boost_duration_sec: number;
  enabled: boolean;
};

export const DEFAULT_BATTLE_ENERGY_CAPS: BattleEnergyCaps = {
  watch_amount: 5,
  comment_amount: 2,
  share_amount: 20,
  watch_cap: 300,
  comment_cap: 20,
  share_cap: 1,
  storage_cap: 10_000,
  session_cap: 500,
  daily_cap: 2_000,
  minimum_boost: 1,
  allowed_boost_values: [1, 2, 5, 10],
  fan_energy_threshold: 10_000,
  score_multiplier: 1.2,
  boost_duration_sec: 5,
  enabled: true,
};

const MAX_SCORE_MULTIPLIER = 5;
const MAX_BOOST_DURATION_SEC = 120;

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
  const meta = await getMissionAdminMeta();
  return r.rows.map((row) => {
    const m = meta[row.id] || {
      audience: "all_authenticated",
      starts_at: null,
      ends_at: null,
      archived: false,
    };
    return {
      ...row,
      audience: m.audience,
      starts_at: m.starts_at,
      ends_at: m.ends_at,
      archived: !!m.archived,
    };
  });
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
    const [capsR, boostR] = await Promise.all([
      db.query(`SELECT value_json FROM engagement_settings WHERE key = $1`, [
        BATTLE_ENERGY_CAPS_KEY,
      ]),
      db.query(`SELECT value_json FROM engagement_settings WHERE key = $1`, [
        "fan_energy_boost",
      ]),
    ]);
    const raw = capsR.rows[0]?.value_json;
    const boost =
      boostR.rows[0]?.value_json && typeof boostR.rows[0].value_json === "object"
        ? (boostR.rows[0].value_json as Record<string, unknown>)
        : {};
    const v =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const allowedRaw = Array.isArray(v.allowed_boost_values)
      ? (v.allowed_boost_values as unknown[])
          .map((n) => Math.floor(Number(n)))
          .filter((n) => Number.isFinite(n) && n >= 1)
      : DEFAULT_BATTLE_ENERGY_CAPS.allowed_boost_values;
    const multiplier = Math.min(
      MAX_SCORE_MULTIPLIER,
      Math.max(
        1,
        Number(
          v.score_multiplier ??
            boost.multiplier ??
            DEFAULT_BATTLE_ENERGY_CAPS.score_multiplier,
        ),
      ),
    );
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
      storage_cap: Math.max(
        0,
        Math.floor(Number(v.storage_cap ?? DEFAULT_BATTLE_ENERGY_CAPS.storage_cap)),
      ),
      session_cap: Math.max(
        0,
        Math.floor(Number(v.session_cap ?? DEFAULT_BATTLE_ENERGY_CAPS.session_cap)),
      ),
      daily_cap: Math.max(
        0,
        Math.floor(Number(v.daily_cap ?? DEFAULT_BATTLE_ENERGY_CAPS.daily_cap)),
      ),
      minimum_boost: Math.max(
        1,
        Math.floor(Number(v.minimum_boost ?? DEFAULT_BATTLE_ENERGY_CAPS.minimum_boost)),
      ),
      allowed_boost_values:
        allowedRaw.length > 0
          ? allowedRaw
          : [...DEFAULT_BATTLE_ENERGY_CAPS.allowed_boost_values],
      fan_energy_threshold: Math.max(
        1,
        Math.floor(
          Number(
            v.fan_energy_threshold ??
              boost.threshold ??
              DEFAULT_BATTLE_ENERGY_CAPS.fan_energy_threshold,
          ),
        ),
      ),
      score_multiplier: multiplier,
      boost_duration_sec: Math.min(
        MAX_BOOST_DURATION_SEC,
        Math.max(
          1,
          Math.floor(
            Number(
              v.boost_duration_sec ??
                boost.duration_sec ??
                DEFAULT_BATTLE_ENERGY_CAPS.boost_duration_sec,
            ),
          ),
        ),
      ),
      enabled: v.enabled === undefined ? true : !!v.enabled,
    };
  } catch {
    return { ...DEFAULT_BATTLE_ENERGY_CAPS };
  }
}

export async function updateBattleEnergyCapsAdmin(
  caps: Partial<BattleEnergyCaps>,
  adminUserId: string,
): Promise<BattleEnergyCaps> {
  const db = getPool();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const prev = await getBattleEnergyCaps();
  const allowed = Array.isArray(caps.allowed_boost_values)
    ? caps.allowed_boost_values
        .map((n) => Math.floor(Number(n)))
        .filter((n) => Number.isFinite(n) && n >= 1)
        .slice(0, 20)
    : prev.allowed_boost_values;
  const next: BattleEnergyCaps = {
    watch_amount: Math.max(0, Math.floor(Number(caps.watch_amount ?? prev.watch_amount))),
    comment_amount: Math.max(
      0,
      Math.floor(Number(caps.comment_amount ?? prev.comment_amount)),
    ),
    share_amount: Math.max(0, Math.floor(Number(caps.share_amount ?? prev.share_amount))),
    watch_cap: Math.max(0, Math.floor(Number(caps.watch_cap ?? prev.watch_cap))),
    comment_cap: Math.max(0, Math.floor(Number(caps.comment_cap ?? prev.comment_cap))),
    share_cap: Math.max(0, Math.floor(Number(caps.share_cap ?? prev.share_cap))),
    storage_cap: Math.max(0, Math.floor(Number(caps.storage_cap ?? prev.storage_cap))),
    session_cap: Math.max(0, Math.floor(Number(caps.session_cap ?? prev.session_cap))),
    daily_cap: Math.max(0, Math.floor(Number(caps.daily_cap ?? prev.daily_cap))),
    minimum_boost: Math.max(1, Math.floor(Number(caps.minimum_boost ?? prev.minimum_boost))),
    allowed_boost_values: allowed.length ? allowed : prev.allowed_boost_values,
    fan_energy_threshold: Math.max(
      1,
      Math.floor(Number(caps.fan_energy_threshold ?? prev.fan_energy_threshold)),
    ),
    score_multiplier: Math.min(
      MAX_SCORE_MULTIPLIER,
      Math.max(1, Number(caps.score_multiplier ?? prev.score_multiplier)),
    ),
    boost_duration_sec: Math.min(
      MAX_BOOST_DURATION_SEC,
      Math.max(1, Math.floor(Number(caps.boost_duration_sec ?? prev.boost_duration_sec))),
    ),
    enabled: caps.enabled !== undefined ? !!caps.enabled : prev.enabled,
  };
  await db.query(
    `INSERT INTO engagement_settings (key, value_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [BATTLE_ENERGY_CAPS_KEY, JSON.stringify(next)],
  );
  // Keep fan_energy_boost mirror for legacy readers (score only — never Diamonds).
  await db.query(
    `INSERT INTO engagement_settings (key, value_json)
     VALUES ('fan_energy_boost', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [
      JSON.stringify({
        threshold: next.fan_energy_threshold,
        multiplier: next.score_multiplier,
        duration_sec: next.boost_duration_sec,
      }),
    ],
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
  patch: Partial<EngagementFlags> & { reason?: string },
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
  const reason = String(patch.reason || "").slice(0, 500);
  for (const key of allowed) {
    if (typeof patch[key] === "boolean") {
      nextOverrides[key] = patch[key];
    }
  }
  await db.query(
    `INSERT INTO engagement_settings (key, value_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [FEATURE_FLAGS_KEY, JSON.stringify(nextOverrides)],
  );
  const metaKey = "feature_flags_meta";
  const prevMeta = await db.query(
    `SELECT value_json FROM engagement_settings WHERE key = $1`,
    [metaKey],
  );
  const metaObj =
    prevMeta.rows[0]?.value_json &&
    typeof prevMeta.rows[0].value_json === "object"
      ? { ...(prevMeta.rows[0].value_json as Record<string, unknown>) }
      : {};
  for (const key of allowed) {
    if (typeof patch[key] === "boolean") {
      metaObj[key] = {
        last_changed_by: adminUserId,
        last_changed_at: new Date().toISOString(),
        reason: reason || null,
        admin_value: patch[key],
      };
    }
  }
  await db.query(
    `INSERT INTO engagement_settings (key, value_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [metaKey, JSON.stringify(metaObj)],
  );
  const next = await getEngagementFlagsMerged();
  const { setEngagementFlagOverrides } = await import("./engagementFlags");
  setEngagementFlagOverrides(await loadFlagOverrides());
  await writeAdminAudit(
    adminUserId,
    "feature_flags_update",
    FEATURE_FLAGS_KEY,
    { flags: prev, reason: reason || null },
    { flags: next, reason: reason || null },
  );
  return next;
}

export type FeatureFlagAdminRow = {
  key: keyof EngagementFlags;
  effective: boolean;
  default_value: boolean;
  env_value: boolean;
  admin_value: boolean | null;
  last_changed_by: string | null;
  last_changed_at: string | null;
  reason: string | null;
};

export async function listFeatureFlagsAdminDetail(): Promise<{
  flags: EngagementFlags;
  rows: FeatureFlagAdminRow[];
}> {
  const envFlags = getEngagementFlagsFromEnv();
  const defaults = getEngagementFlagsFromEnv(); // same source; env is baseline default
  const overrides = await loadFlagOverrides();
  const effective = await getEngagementFlagsMerged();
  const db = getPool();
  let meta: Record<string, unknown> = {};
  if (db) {
    try {
      const r = await db.query(
        `SELECT value_json FROM engagement_settings WHERE key = 'feature_flags_meta'`,
      );
      if (r.rows[0]?.value_json && typeof r.rows[0].value_json === "object") {
        meta = r.rows[0].value_json as Record<string, unknown>;
      }
    } catch {
      meta = {};
    }
  }
  const keys = Object.keys(effective) as (keyof EngagementFlags)[];
  const rows: FeatureFlagAdminRow[] = keys.map((key) => {
    const m =
      meta[key] && typeof meta[key] === "object"
        ? (meta[key] as Record<string, unknown>)
        : {};
    return {
      key,
      effective: !!effective[key],
      default_value: !!defaults[key],
      env_value: !!envFlags[key],
      admin_value:
        typeof overrides[key] === "boolean" ? !!overrides[key] : null,
      last_changed_by:
        typeof m.last_changed_by === "string" ? m.last_changed_by : null,
      last_changed_at:
        typeof m.last_changed_at === "string" ? m.last_changed_at : null,
      reason: typeof m.reason === "string" ? m.reason : null,
    };
  });
  return { flags: effective, rows };
}

/** Supported mission audience — no free-form eligibility DSL. */
export type MissionAudience =
  | "all_authenticated"
  | "creators_only"
  | "viewers_only"
  | "new_users";

export async function getMissionAdminMeta(): Promise<
  Record<
    string,
    {
      audience: MissionAudience;
      starts_at: string | null;
      ends_at: string | null;
      archived: boolean;
    }
  >
> {
  const db = getPool();
  if (!db) return {};
  try {
    const r = await db.query(
      `SELECT value_json FROM engagement_settings WHERE key = 'mission_admin_meta'`,
    );
    const raw = r.rows[0]?.value_json;
    if (!raw || typeof raw !== "object") return {};
    return raw as Record<
      string,
      {
        audience: MissionAudience;
        starts_at: string | null;
        ends_at: string | null;
        archived: boolean;
      }
    >;
  } catch {
    return {};
  }
}

export async function upsertMissionAdminMeta(
  missionId: string,
  patch: {
    audience?: MissionAudience;
    starts_at?: string | null;
    ends_at?: string | null;
    archived?: boolean;
  },
  adminUserId: string,
) {
  const db = getPool();
  if (!db) return null;
  const all = await getMissionAdminMeta();
  const prev = all[missionId] || {
    audience: "all_authenticated" as MissionAudience,
    starts_at: null,
    ends_at: null,
    archived: false,
  };
  const next = {
    audience: patch.audience ?? prev.audience,
    starts_at: patch.starts_at !== undefined ? patch.starts_at : prev.starts_at,
    ends_at: patch.ends_at !== undefined ? patch.ends_at : prev.ends_at,
    archived: patch.archived !== undefined ? !!patch.archived : prev.archived,
  };
  all[missionId] = next;
  await db.query(
    `INSERT INTO engagement_settings (key, value_json)
     VALUES ('mission_admin_meta', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify(all)],
  );
  await writeAdminAudit(
    adminUserId,
    "mission_meta_update",
    missionId,
    prev,
    next,
  );
  return next;
}

export async function getDailyRewardPolicyAdmin() {
  const db = getPool();
  const defaults = {
    streak_reset_policy: "miss_one_day" as const,
    effective_start: null as string | null,
    effective_end: null as string | null,
    active: true,
  };
  if (!db) return defaults;
  try {
    const r = await db.query(
      `SELECT value_json FROM engagement_settings WHERE key = 'daily_reward_policy'`,
    );
    const v = r.rows[0]?.value_json;
    if (!v || typeof v !== "object") return defaults;
    const o = v as Record<string, unknown>;
    return {
      streak_reset_policy:
        o.streak_reset_policy === "never" ||
        o.streak_reset_policy === "miss_one_day"
          ? o.streak_reset_policy
          : "miss_one_day",
      effective_start:
        typeof o.effective_start === "string" ? o.effective_start : null,
      effective_end:
        typeof o.effective_end === "string" ? o.effective_end : null,
      active: o.active === undefined ? true : !!o.active,
    };
  } catch {
    return defaults;
  }
}

export async function updateDailyRewardPolicyAdmin(
  policy: {
    streak_reset_policy?: "miss_one_day" | "never";
    effective_start?: string | null;
    effective_end?: string | null;
    active?: boolean;
  },
  adminUserId: string,
) {
  const db = getPool();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const prev = await getDailyRewardPolicyAdmin();
  const next = {
    streak_reset_policy:
      policy.streak_reset_policy ?? prev.streak_reset_policy,
    effective_start:
      policy.effective_start !== undefined
        ? policy.effective_start
        : prev.effective_start,
    effective_end:
      policy.effective_end !== undefined
        ? policy.effective_end
        : prev.effective_end,
    active: policy.active !== undefined ? !!policy.active : prev.active,
  };
  await db.query(
    `INSERT INTO engagement_settings (key, value_json)
     VALUES ('daily_reward_policy', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify(next)],
  );
  await writeAdminAudit(
    adminUserId,
    "daily_reward_policy_update",
    "daily_reward_policy",
    prev,
    next,
  );
  return next;
}

export async function listAdminAuditHistory(limit = 50) {
  const db = getPool();
  if (!db) return [];
  try {
    const r = await db.query(
      `SELECT id, admin_user_id, action, target, previous_value, new_value, created_at
         FROM engagement_admin_audit
        ORDER BY created_at DESC
        LIMIT $1`,
      [Math.min(200, Math.max(1, limit))],
    );
    return r.rows;
  } catch {
    return [];
  }
}

/** Call once at boot so sync getEngagementFlags() sees DB overrides. */
export async function warmEngagementFlagCache(): Promise<void> {
  const { setEngagementFlagOverrides } = await import("./engagementFlags");
  setEngagementFlagOverrides(await loadFlagOverrides());
}
