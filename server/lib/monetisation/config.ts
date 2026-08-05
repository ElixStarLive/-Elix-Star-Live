/**
 * Monetisation config loader + admin audit helpers.
 */
import { getPool } from "../postgres";
import { logger } from "../logger";
import {
  DEFAULT_CREATOR_REWARD_MILESTONES,
  DEFAULT_MAX_REWARD_PENCE,
  DEFAULT_MIN_FOLLOWERS,
  DEFAULT_MIN_PREV_30D_QUALIFIED,
  type RewardMilestone,
} from "./creatorRewardsMath";

export type MonetisationConfig = {
  giftCreatorPct: number;
  giftPlatformPct: number;
  giftSettlementHours: number;
  giftMonetisationEnabled: boolean;
  subCreatorPct: number;
  subPlatformPct: number;
  subSettlementHours: number;
  subMonetisationEnabled: boolean;
  rewardsEnabled: boolean;
  rewardsMinFollowers: number;
  rewardsMinPrev30dQualifiedViews: number;
  rewardsMaxPencePerCreator: number;
  rewardsMonthlyBudgetPence: number;
  rewardsMinWatchSeconds: number;
  rewardsSettlementHours: number;
  rewardsAutoApprove: boolean;
  withdrawMinPence: number;
  withdrawMaxPence: number | null;
  milestones: RewardMilestone[];
};

const DEFAULT_CONFIG: MonetisationConfig = {
  giftCreatorPct: 60,
  giftPlatformPct: 40,
  giftSettlementHours: 72,
  giftMonetisationEnabled: true,
  subCreatorPct: 60,
  subPlatformPct: 40,
  subSettlementHours: 72,
  subMonetisationEnabled: true,
  rewardsEnabled: true,
  rewardsMinFollowers: DEFAULT_MIN_FOLLOWERS,
  rewardsMinPrev30dQualifiedViews: DEFAULT_MIN_PREV_30D_QUALIFIED,
  rewardsMaxPencePerCreator: DEFAULT_MAX_REWARD_PENCE,
  rewardsMonthlyBudgetPence: 0,
  rewardsMinWatchSeconds: 3,
  rewardsSettlementHours: 168,
  rewardsAutoApprove: false,
  withdrawMinPence: 0,
  withdrawMaxPence: null,
  milestones: DEFAULT_CREATOR_REWARD_MILESTONES,
};

let cache: { at: number; cfg: MonetisationConfig } | null = null;
const CACHE_MS = 30_000;

export function defaultMonetisationConfig(): MonetisationConfig {
  return { ...DEFAULT_CONFIG, milestones: [...DEFAULT_CREATOR_REWARD_MILESTONES] };
}

export async function loadMonetisationConfig(force = false): Promise<MonetisationConfig> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.cfg;
  const pool = getPool();
  if (!pool) {
    const cfg = defaultMonetisationConfig();
    cache = { at: Date.now(), cfg };
    return cfg;
  }
  try {
    const rowR = await pool.query(`SELECT * FROM elix_monetisation_config WHERE id = 'default' LIMIT 1`);
    const milestonesR = await pool.query(
      `SELECT min_qualified_views, reward_pence
         FROM elix_creator_reward_milestones
        WHERE config_id = 'default'
        ORDER BY min_qualified_views ASC`,
    );
    const row = rowR.rows[0];
    if (!row) {
      const cfg = defaultMonetisationConfig();
      cache = { at: Date.now(), cfg };
      return cfg;
    }
    const milestones: RewardMilestone[] =
      milestonesR.rows.length > 0
        ? milestonesR.rows.map((m) => ({
            minQualifiedViews: Math.floor(Number(m.min_qualified_views) || 0),
            rewardPence: Math.floor(Number(m.reward_pence) || 0),
          }))
        : [...DEFAULT_CREATOR_REWARD_MILESTONES];

    const cfg: MonetisationConfig = {
      giftCreatorPct: Math.floor(Number(row.gift_creator_pct) || 60),
      giftPlatformPct: Math.floor(Number(row.gift_platform_pct) || 40),
      giftSettlementHours: Math.floor(Number(row.gift_settlement_hours) || 72),
      giftMonetisationEnabled: row.gift_monetisation_enabled !== false,
      subCreatorPct: Math.floor(Number(row.sub_creator_pct) || 60),
      subPlatformPct: Math.floor(Number(row.sub_platform_pct) || 40),
      subSettlementHours: Math.floor(Number(row.sub_settlement_hours) || 72),
      subMonetisationEnabled: row.sub_monetisation_enabled !== false,
      rewardsEnabled: row.rewards_enabled !== false,
      rewardsMinFollowers: Math.floor(Number(row.rewards_min_followers) || DEFAULT_MIN_FOLLOWERS),
      rewardsMinPrev30dQualifiedViews: Math.floor(
        Number(row.rewards_min_prev_30d_qualified_views) || DEFAULT_MIN_PREV_30D_QUALIFIED,
      ),
      rewardsMaxPencePerCreator: Math.floor(
        Number(row.rewards_max_pence_per_creator) || DEFAULT_MAX_REWARD_PENCE,
      ),
      rewardsMonthlyBudgetPence: Math.floor(Number(row.rewards_monthly_budget_pence) || 0),
      rewardsMinWatchSeconds: Math.floor(Number(row.rewards_min_watch_seconds) || 3),
      rewardsSettlementHours: Math.floor(Number(row.rewards_settlement_hours) || 168),
      rewardsAutoApprove: row.rewards_auto_approve === true,
      withdrawMinPence: Math.floor(Number(row.withdraw_min_pence) || 0),
      withdrawMaxPence:
        row.withdraw_max_pence == null ? null : Math.floor(Number(row.withdraw_max_pence) || 0),
      milestones,
    };
    cache = { at: Date.now(), cfg };
    return cfg;
  } catch (err) {
    logger.warn({ err }, "loadMonetisationConfig failed — using defaults");
    const cfg = defaultMonetisationConfig();
    cache = { at: Date.now(), cfg };
    return cfg;
  }
}

export function invalidateMonetisationConfigCache(): void {
  cache = null;
}

export function ruleSnapshotFromConfig(
  cfg: MonetisationConfig,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: "creator_monetisation_v1",
    gift_creator_pct: cfg.giftCreatorPct,
    gift_platform_pct: cfg.giftPlatformPct,
    sub_creator_pct: cfg.subCreatorPct,
    sub_platform_pct: cfg.subPlatformPct,
    rewards_max_pence: cfg.rewardsMaxPencePerCreator,
    rewards_min_followers: cfg.rewardsMinFollowers,
    rewards_min_prev_30d_qualified_views: cfg.rewardsMinPrev30dQualifiedViews,
    rewards_monthly_budget_pence: cfg.rewardsMonthlyBudgetPence,
    milestones: cfg.milestones,
    ...extra,
  };
}

export async function auditMonetisationConfigChange(input: {
  adminUserId: string;
  fieldName: string;
  previousValue: string | null;
  newValue: string;
  reason?: string;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO elix_monetisation_config_audit
         (config_id, admin_user_id, field_name, previous_value, new_value, reason)
       VALUES ('default', $1, $2, $3, $4, $5)`,
      [
        input.adminUserId,
        input.fieldName,
        input.previousValue,
        input.newValue,
        input.reason ?? null,
      ],
    );
  } catch (err) {
    logger.error({ err }, "auditMonetisationConfigChange failed");
  }
}
