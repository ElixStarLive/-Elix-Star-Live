/**
 * Qualified reward views — one user = one qualified view per video (DB PK).
 */
import { getPool } from "../postgres";
import { logger } from "../logger";
import { loadMonetisationConfig } from "./config";

export type QualifyViewInput = {
  videoId: string;
  viewerUserId: string;
  creatorUserId: string;
  watchSeconds: number;
  rewardPeriodId?: string | null;
  /** Soft fraud / eligibility flags from caller */
  rejectReason?:
    | "bot"
    | "fraud"
    | "ineligible_video"
    | "logged_out"
    | "self"
    | "watch_time"
    | null;
};

export type QualifyViewResult = {
  accepted: boolean;
  qualified: boolean;
  reason:
    | "ok"
    | "duplicate"
    | "self"
    | "logged_out"
    | "watch_time"
    | "bot"
    | "fraud"
    | "ineligible_video"
    | "disabled"
    | "db_error";
};

async function bumpMetrics(
  videoId: string,
  creatorUserId: string,
  fields: Partial<{
    total_plays: number;
    unique_viewers: number;
    qualified_reward_views: number;
    repeat_plays: number;
    self_views: number;
    invalid_views: number;
    fraud_rejected_views: number;
    qualified_watch_time_seconds: number;
  }>,
): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  const cols = Object.keys(fields);
  if (cols.length === 0) return;
  const sets = cols.map((c, i) => `${c} = elix_video_view_metrics.${c} + $${i + 3}`).join(", ");
  const vals = cols.map((c) => Math.max(0, Math.floor(Number((fields as Record<string, number>)[c]) || 0)));
  try {
    await pool.query(
      `INSERT INTO elix_video_view_metrics (video_id, creator_user_id, ${cols.join(", ")}, updated_at)
       VALUES ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")}, NOW())
       ON CONFLICT (video_id) DO UPDATE SET
         ${sets},
         updated_at = NOW()`,
      [videoId, creatorUserId, ...vals],
    );
  } catch (err) {
    logger.warn({ err, videoId }, "bumpMetrics failed");
  }
}

/**
 * Attempt to record a qualified reward view. Uniqueness enforced by PK (video_id, viewer_user_id).
 */
export async function recordQualifiedRewardView(input: QualifyViewInput): Promise<QualifyViewResult> {
  const videoId = String(input.videoId || "").trim();
  const viewerUserId = String(input.viewerUserId || "").trim();
  const creatorUserId = String(input.creatorUserId || "").trim();
  const watchSeconds = Math.max(0, Math.floor(Number(input.watchSeconds) || 0));

  if (!videoId) {
    return { accepted: false, qualified: false, reason: "ineligible_video" };
  }

  await bumpMetrics(videoId, creatorUserId || "unknown", { total_plays: 1 });

  if (!viewerUserId || viewerUserId === "anonymous") {
    await bumpMetrics(videoId, creatorUserId || "unknown", { invalid_views: 1 });
    return { accepted: true, qualified: false, reason: "logged_out" };
  }

  if (input.rejectReason === "self" || viewerUserId === creatorUserId) {
    await bumpMetrics(videoId, creatorUserId || viewerUserId, { self_views: 1 });
    return { accepted: true, qualified: false, reason: "self" };
  }

  if (input.rejectReason === "bot" || input.rejectReason === "fraud") {
    await bumpMetrics(videoId, creatorUserId, { fraud_rejected_views: 1 });
    return { accepted: true, qualified: false, reason: input.rejectReason };
  }

  if (input.rejectReason === "ineligible_video") {
    await bumpMetrics(videoId, creatorUserId, { invalid_views: 1 });
    return { accepted: true, qualified: false, reason: "ineligible_video" };
  }

  const cfg = await loadMonetisationConfig();
  if (!cfg.rewardsEnabled) {
    return { accepted: true, qualified: false, reason: "disabled" };
  }
  if (watchSeconds < cfg.rewardsMinWatchSeconds) {
    await bumpMetrics(videoId, creatorUserId, { invalid_views: 1 });
    return { accepted: true, qualified: false, reason: "watch_time" };
  }

  const pool = getPool();
  if (!pool) return { accepted: false, qualified: false, reason: "db_error" };

  try {
    const ins = await pool.query(
      `INSERT INTO elix_qualified_video_views
         (video_id, viewer_user_id, creator_user_id, watch_seconds, reward_period_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (video_id, viewer_user_id) DO UPDATE SET
         last_seen_at = NOW(),
         watch_seconds = GREATEST(elix_qualified_video_views.watch_seconds, EXCLUDED.watch_seconds)
       RETURNING (xmax = 0) AS inserted`,
      [videoId, viewerUserId, creatorUserId, watchSeconds, input.rewardPeriodId ?? null],
    );
    const inserted = Boolean(ins.rows[0]?.inserted);
    if (!inserted) {
      await bumpMetrics(videoId, creatorUserId, { repeat_plays: 1 });
      return { accepted: true, qualified: false, reason: "duplicate" };
    }
    await bumpMetrics(videoId, creatorUserId, {
      unique_viewers: 1,
      qualified_reward_views: 1,
      qualified_watch_time_seconds: watchSeconds,
    });
    return { accepted: true, qualified: true, reason: "ok" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // CHECK violation for self-view
    if (/elix_qualified_video_views_no_self|check_violation/i.test(msg)) {
      await bumpMetrics(videoId, creatorUserId, { self_views: 1 });
      return { accepted: true, qualified: false, reason: "self" };
    }
    logger.error({ err, videoId, viewerUserId }, "recordQualifiedRewardView failed");
    return { accepted: false, qualified: false, reason: "db_error" };
  }
}
