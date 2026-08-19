/**
 * For You algorithm config — admin-configurable, never hardcode thresholds in ranking.
 */
import { getPool } from "../postgres";
import { logger } from "../logger";

export type ForYouConfig = {
  initialAudienceSize: number;
  promotionQualifiedViews: number;
  removalWindowHours: number;
  reentryAdditionalQualifiedViews: number;
  maxRecommendationCycles: number;
  freshnessWindowHours: number;
  fraudSensitivity: number;
  weights: {
    qualifiedViews: number;
    watchTime: number;
    completion: number;
    rewatches: number;
    shares: number;
    saves: number;
    comments: number;
    likes: number;
    follows: number;
    profileVisits: number;
    reportRate: number;
    notInterested: number;
    retention: number;
    freshness: number;
    creatorQuality: number;
    guidelines: number;
  };
};

const DEFAULT_FORYOU_CONFIG: ForYouConfig = {
  initialAudienceSize: 500,
  promotionQualifiedViews: 5000,
  removalWindowHours: 168,
  reentryAdditionalQualifiedViews: 1000,
  maxRecommendationCycles: 5,
  freshnessWindowHours: 72,
  fraudSensitivity: 50,
  weights: {
    qualifiedViews: 1.0,
    watchTime: 1.2,
    completion: 1.5,
    rewatches: 0.8,
    shares: 2.0,
    saves: 1.8,
    comments: 1.4,
    likes: 1.0,
    follows: 2.5,
    profileVisits: 1.6,
    reportRate: -5.0,
    notInterested: -4.0,
    retention: 1.3,
    freshness: 1.1,
    creatorQuality: 1.0,
    guidelines: -10.0,
  },
};

let cache: { at: number; cfg: ForYouConfig } | null = null;
const CACHE_MS = 30_000;

export function defaultForYouConfig(): ForYouConfig {
  return {
    ...DEFAULT_FORYOU_CONFIG,
    weights: { ...DEFAULT_FORYOU_CONFIG.weights },
  };
}

function n(v: unknown, fallback: number): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export async function loadForYouConfig(force = false): Promise<ForYouConfig> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.cfg;
  const pool = getPool();
  if (!pool) {
    const cfg = defaultForYouConfig();
    cache = { at: Date.now(), cfg };
    return cfg;
  }
  try {
    const r = await pool.query(`SELECT * FROM elix_foryou_config WHERE id = 'default' LIMIT 1`);
    const row = r.rows[0];
    if (!row) {
      const cfg = defaultForYouConfig();
      cache = { at: Date.now(), cfg };
      return cfg;
    }
    const d = DEFAULT_FORYOU_CONFIG;
    const cfg: ForYouConfig = {
      initialAudienceSize: Math.max(1, Math.floor(n(row.initial_audience_size, d.initialAudienceSize))),
      promotionQualifiedViews: Math.max(
        1,
        Math.floor(n(row.promotion_qualified_views, d.promotionQualifiedViews)),
      ),
      removalWindowHours: Math.max(1, Math.floor(n(row.removal_window_hours, d.removalWindowHours))),
      reentryAdditionalQualifiedViews: Math.max(
        1,
        Math.floor(n(row.reentry_additional_qualified_views, d.reentryAdditionalQualifiedViews)),
      ),
      maxRecommendationCycles: Math.max(
        1,
        Math.floor(n(row.max_recommendation_cycles, d.maxRecommendationCycles)),
      ),
      freshnessWindowHours: Math.max(1, Math.floor(n(row.freshness_window_hours, d.freshnessWindowHours))),
      fraudSensitivity: Math.min(100, Math.max(0, Math.floor(n(row.fraud_sensitivity, d.fraudSensitivity)))),
      weights: {
        qualifiedViews: n(row.weight_qualified_views, d.weights.qualifiedViews),
        watchTime: n(row.weight_watch_time, d.weights.watchTime),
        completion: n(row.weight_completion, d.weights.completion),
        rewatches: n(row.weight_rewatches, d.weights.rewatches),
        shares: n(row.weight_shares, d.weights.shares),
        saves: n(row.weight_saves, d.weights.saves),
        comments: n(row.weight_comments, d.weights.comments),
        likes: n(row.weight_likes, d.weights.likes),
        follows: n(row.weight_follows, d.weights.follows),
        profileVisits: n(row.weight_profile_visits, d.weights.profileVisits),
        reportRate: n(row.weight_report_rate, d.weights.reportRate),
        notInterested: n(row.weight_not_interested, d.weights.notInterested),
        retention: n(row.weight_retention, d.weights.retention),
        freshness: n(row.weight_freshness, d.weights.freshness),
        creatorQuality: n(row.weight_creator_quality, d.weights.creatorQuality),
        guidelines: n(row.weight_guidelines, d.weights.guidelines),
      },
    };
    cache = { at: Date.now(), cfg };
    return cfg;
  } catch (err) {
    logger.warn({ err }, "loadForYouConfig failed; using defaults");
    const cfg = defaultForYouConfig();
    cache = { at: Date.now(), cfg };
    return cfg;
  }
}

export function invalidateForYouConfigCache(): void {
  cache = null;
}

export const FORYOU_CONFIG_FIELD_MAP: Record<string, string> = {
  initialAudienceSize: "initial_audience_size",
  promotionQualifiedViews: "promotion_qualified_views",
  removalWindowHours: "removal_window_hours",
  reentryAdditionalQualifiedViews: "reentry_additional_qualified_views",
  maxRecommendationCycles: "max_recommendation_cycles",
  freshnessWindowHours: "freshness_window_hours",
  fraudSensitivity: "fraud_sensitivity",
  weightQualifiedViews: "weight_qualified_views",
  weightWatchTime: "weight_watch_time",
  weightCompletion: "weight_completion",
  weightRewatches: "weight_rewatches",
  weightShares: "weight_shares",
  weightSaves: "weight_saves",
  weightComments: "weight_comments",
  weightLikes: "weight_likes",
  weightFollows: "weight_follows",
  weightProfileVisits: "weight_profile_visits",
  weightReportRate: "weight_report_rate",
  weightNotInterested: "weight_not_interested",
  weightRetention: "weight_retention",
  weightFreshness: "weight_freshness",
  weightCreatorQuality: "weight_creator_quality",
  weightGuidelines: "weight_guidelines",
};
