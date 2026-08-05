/**
 * For You lifecycle: initial distribution → promote @ threshold → remove if low → re-entry.
 * Backend-owned. Profile/search/direct links are unaffected when removed from FYP.
 */
import { getPool } from "../postgres";
import { logger } from "../logger";
import { loadForYouConfig } from "./foryouConfig";
import { computeForYouRankingScore } from "./foryouRanking";
import { bumpFeedForyouEpoch } from "../feedCacheValkey";

export type ForYouStage =
  | "initial"
  | "promoted"
  | "removed"
  | "reentry_eligible"
  | "reentered"
  | "exhausted";

export async function enrollVideoInForYou(input: {
  videoId: string;
  creatorUserId: string;
  privacy?: string | null;
}): Promise<void> {
  const videoId = String(input.videoId || "").trim();
  const creatorUserId = String(input.creatorUserId || "").trim();
  if (!videoId || !creatorUserId) return;
  if (input.privacy === "private") return;

  const pool = getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO elix_video_foryou_state (video_id, creator_user_id, stage, cycle_count)
       VALUES ($1, $2, 'initial', 1)
       ON CONFLICT (video_id) DO NOTHING`,
      [videoId, creatorUserId],
    );
    void bumpFeedForyouEpoch();
  } catch (err) {
    logger.warn({ err, videoId }, "enrollVideoInForYou failed");
  }
}

/**
 * After a new qualified unique view is accepted, refresh counters + stage transitions.
 */
export async function onQualifiedUniqueViewForFeed(input: {
  videoId: string;
  creatorUserId: string;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  const videoId = String(input.videoId || "").trim();
  if (!videoId) return;

  try {
    const cfg = await loadForYouConfig();
    const q = await pool.query(
      `SELECT COUNT(*)::int AS c FROM elix_qualified_video_views WHERE video_id = $1`,
      [videoId],
    );
    const qualified = Math.floor(Number(q.rows[0]?.c) || 0);

    await pool.query(
      `INSERT INTO elix_video_foryou_state (video_id, creator_user_id, stage, qualified_unique_views)
       VALUES ($1, $2, 'initial', $3)
       ON CONFLICT (video_id) DO UPDATE SET
         qualified_unique_views = $3,
         updated_at = NOW()`,
      [videoId, input.creatorUserId || "unknown", qualified],
    );

    const st = await pool.query(`SELECT * FROM elix_video_foryou_state WHERE video_id = $1`, [videoId]);
    const row = st.rows[0];
    if (!row) return;

    let stage = String(row.stage) as ForYouStage;
    const cycle = Math.floor(Number(row.cycle_count) || 1);
    const atRemoval = Math.floor(Number(row.qualified_at_removal) || 0);
    let qualifiedSinceRemoval = Math.max(0, qualified - atRemoval);
    let promotedAt = row.promoted_at;
    let removedAt = row.removed_at;
    let reentryAt = row.reentry_at;

    if (stage === "initial" || stage === "reentered") {
      if (qualified >= cfg.promotionQualifiedViews) {
        stage = "promoted";
        promotedAt = promotedAt || new Date().toISOString();
      } else if (stage === "initial" && removedAt == null) {
        // Window expiry checked below.
      }
    }

    if (stage === "removed" || stage === "reentry_eligible") {
      qualifiedSinceRemoval = Math.max(0, qualified - atRemoval);
      if (qualifiedSinceRemoval >= cfg.reentryAdditionalQualifiedViews) {
        if (cycle < cfg.maxRecommendationCycles) {
          stage = "reentry_eligible";
        } else {
          stage = "exhausted";
        }
      }
    }

    // Removal: still in initial after window and below promote threshold.
    if (stage === "initial" && !promotedAt) {
      const entered = row.initial_entered_at ? new Date(row.initial_entered_at).getTime() : Date.now();
      const ageHours = (Date.now() - entered) / 3_600_000;
      if (ageHours >= cfg.removalWindowHours && qualified < cfg.promotionQualifiedViews) {
        stage = "removed";
        removedAt = new Date().toISOString();
        await pool.query(
          `UPDATE elix_video_foryou_state SET
             stage = 'removed',
             removed_at = NOW(),
             qualified_at_removal = $2,
             qualified_since_removal = 0,
             updated_at = NOW()
           WHERE video_id = $1`,
          [videoId, qualified],
        );
        void bumpFeedForyouEpoch();
        return;
      }
    }

    // Re-entry: eligible → score gate → reentered (or stay eligible until score improves).
    if (stage === "reentry_eligible") {
      const score = await rescoreVideo(videoId);
      // Require positive multi-signal score before guaranteeing another cycle.
      if (score > 0) {
        stage = "reentered";
        reentryAt = new Date().toISOString();
        await pool.query(
          `UPDATE elix_video_foryou_state SET
             stage = 'reentered',
             cycle_count = cycle_count + 1,
             reentry_at = NOW(),
             ranking_score = $2,
             last_scored_at = NOW(),
             qualified_since_removal = $3,
             updated_at = NOW()
           WHERE video_id = $1`,
          [videoId, score, qualifiedSinceRemoval],
        );
        void bumpFeedForyouEpoch();
        return;
      }
    }

    const score = await rescoreVideo(videoId);
    await pool.query(
      `UPDATE elix_video_foryou_state SET
         stage = $2,
         qualified_unique_views = $3,
         qualified_since_removal = $4,
         ranking_score = $5,
         last_scored_at = NOW(),
         promoted_at = COALESCE(promoted_at, $6::timestamptz),
         removed_at = $7::timestamptz,
         reentry_at = COALESCE(reentry_at, $8::timestamptz),
         updated_at = NOW()
       WHERE video_id = $1`,
      [
        videoId,
        stage,
        qualified,
        qualifiedSinceRemoval,
        score,
        promotedAt,
        removedAt,
        reentryAt,
      ],
    );
  } catch (err) {
    logger.warn({ err, videoId }, "onQualifiedUniqueViewForFeed failed");
  }
}

export async function rescoreVideo(videoId: string): Promise<number> {
  const pool = getPool();
  if (!pool) return 0;
  try {
    const cfg = await loadForYouConfig();
    const r = await pool.query(
      `SELECT
         s.qualified_unique_views,
         s.guidelines_ok,
         s.creator_quality_score,
         s.initial_entered_at,
         COALESCE(v.likes,0)::int AS likes,
         COALESCE(v.comments,0)::int AS comments,
         COALESCE(v.shares,0)::int AS shares,
         COALESCE(v.saves,0)::int AS saves,
         COALESCE(sig.watch_time_seconds,0)::bigint AS watch_time_seconds,
         COALESCE(sig.completions,0)::bigint AS completions,
         COALESCE(sig.rewatches_unique,0)::bigint AS rewatches_unique,
         COALESCE(sig.follows_generated,0)::bigint AS follows_generated,
         COALESCE(sig.profile_visits_generated,0)::bigint AS profile_visits_generated,
         COALESCE(sig.report_count,0)::bigint AS report_count,
         COALESCE(sig.not_interested_count,0)::bigint AS not_interested_count,
         COALESCE(sig.retention_score,0)::float AS retention_score
       FROM elix_video_foryou_state s
       JOIN videos v ON v.id = s.video_id
       LEFT JOIN elix_video_feed_signals sig ON sig.video_id = s.video_id
       WHERE s.video_id = $1`,
      [videoId],
    );
    const row = r.rows[0];
    if (!row) return 0;
    const ageHours =
      (Date.now() - new Date(row.initial_entered_at || Date.now()).getTime()) / 3_600_000;
    const score = computeForYouRankingScore(
      {
        qualifiedUniqueViews: Number(row.qualified_unique_views) || 0,
        watchTimeSeconds: Number(row.watch_time_seconds) || 0,
        completions: Number(row.completions) || 0,
        rewatchesUnique: Number(row.rewatches_unique) || 0,
        shares: Number(row.shares) || 0,
        saves: Number(row.saves) || 0,
        comments: Number(row.comments) || 0,
        likes: Number(row.likes) || 0,
        followsGenerated: Number(row.follows_generated) || 0,
        profileVisitsGenerated: Number(row.profile_visits_generated) || 0,
        reportCount: Number(row.report_count) || 0,
        notInterestedCount: Number(row.not_interested_count) || 0,
        retentionScore: Number(row.retention_score) || 0,
        ageHours,
        freshnessWindowHours: cfg.freshnessWindowHours,
        creatorQualityScore: Number(row.creator_quality_score) || 1,
        guidelinesOk: row.guidelines_ok !== false,
      },
      cfg,
    );
    return score;
  } catch (err) {
    logger.warn({ err, videoId }, "rescoreVideo failed");
    return 0;
  }
}

/** Periodic sweep: expire initial windows and refresh scores for active candidates. */
export async function sweepForYouLifecycle(limit = 200): Promise<{ removed: number; rescored: number }> {
  const pool = getPool();
  if (!pool) return { removed: 0, rescored: 0 };
  let removed = 0;
  let rescored = 0;
  try {
    const cfg = await loadForYouConfig();
    const expired = await pool.query(
      `UPDATE elix_video_foryou_state s SET
         stage = 'removed',
         removed_at = NOW(),
         qualified_at_removal = s.qualified_unique_views,
         qualified_since_removal = 0,
         updated_at = NOW()
       WHERE s.stage = 'initial'
         AND s.promoted_at IS NULL
         AND s.initial_entered_at <= NOW() - ($1::text || ' hours')::interval
         AND s.qualified_unique_views < $2
       RETURNING video_id`,
      [String(cfg.removalWindowHours), cfg.promotionQualifiedViews],
    );
    removed = expired.rowCount ?? 0;

    const active = await pool.query(
      `SELECT video_id FROM elix_video_foryou_state
        WHERE stage IN ('initial','promoted','reentered','reentry_eligible')
        ORDER BY updated_at ASC
        LIMIT $1`,
      [limit],
    );
    for (const row of active.rows) {
      const score = await rescoreVideo(String(row.video_id));
      await pool.query(
        `UPDATE elix_video_foryou_state SET ranking_score = $2, last_scored_at = NOW(), updated_at = NOW()
         WHERE video_id = $1`,
        [row.video_id, score],
      );
      rescored += 1;
    }
    if (removed > 0) void bumpFeedForyouEpoch();
  } catch (err) {
    logger.warn({ err }, "sweepForYouLifecycle failed");
  }
  return { removed, rescored };
}

export async function markNotInterested(videoId: string, userId: string): Promise<void> {
  const pool = getPool();
  if (!pool || !videoId || !userId) return;
  try {
    await pool.query(
      `INSERT INTO elix_video_not_interested (video_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [videoId, userId],
    );
    await pool.query(
      `INSERT INTO elix_video_feed_signals (video_id, not_interested_count, updated_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (video_id) DO UPDATE SET
         not_interested_count = elix_video_feed_signals.not_interested_count + 1,
         updated_at = NOW()`,
      [videoId],
    );
    await rescoreVideo(videoId);
  } catch (err) {
    logger.warn({ err, videoId }, "markNotInterested failed");
  }
}

export async function bumpFeedSignal(
  videoId: string,
  field:
    | "watch_time_seconds"
    | "completions"
    | "rewatches_unique"
    | "follows_generated"
    | "profile_visits_generated"
    | "report_count",
  amount = 1,
): Promise<void> {
  const pool = getPool();
  if (!pool || !videoId) return;
  const allowed = new Set([
    "watch_time_seconds",
    "completions",
    "rewatches_unique",
    "follows_generated",
    "profile_visits_generated",
    "report_count",
  ]);
  if (!allowed.has(field)) return;
  try {
    await pool.query(
      `INSERT INTO elix_video_feed_signals (video_id, ${field}, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (video_id) DO UPDATE SET
         ${field} = elix_video_feed_signals.${field} + $2,
         updated_at = NOW()`,
      [videoId, Math.max(0, Math.floor(amount))],
    );
  } catch (err) {
    logger.warn({ err, videoId, field }, "bumpFeedSignal failed");
  }
}
