/**
 * Candidate selection for For You — backend-owned visibility.
 * Removed videos stay on profile/search/direct links; they are excluded here only.
 */
import { getPool } from "../postgres";
import { logger } from "../logger";
import { loadForYouConfig } from "./foryouConfig";

export type ForYouCandidateRow = Record<string, unknown>;

/**
 * Ranked For You page. Excludes not-interested for viewer when provided.
 * Only stages initial | promoted | reentered are recommended.
 */
export async function queryRankedForYouPage(input: {
  limit: number;
  offset: number;
  viewerUserId?: string | null;
}): Promise<ForYouCandidateRow[]> {
  const pool = getPool();
  if (!pool) return [];
  const limit = Math.min(50, Math.max(1, input.limit));
  const offset = Math.max(0, input.offset);
  const viewer = input.viewerUserId ? String(input.viewerUserId) : null;

  try {
    const cfg = await loadForYouConfig();
    // Prefer ranked state table; fall back to recency for videos not yet enrolled.
    const { rows } = await pool.query(
      `WITH eligible AS (
         SELECT
           v.id, v.url, v.thumbnail, v.duration, v.description, v.hashtags, v.music,
           v.views, v.likes, v.comments, v.shares, v.saves,
           v.created_at, v.privacy, v.user_id,
           COALESCE(s.ranking_score, 0)::float AS ranking_score,
           COALESCE(s.stage, 'initial') AS foryou_stage,
           COALESCE(s.qualified_unique_views, 0)::int AS qualified_unique_views,
           (COALESCE(v.views,0) + COALESCE(v.likes,0)*2 + COALESCE(v.comments,0) + COALESCE(v.shares,0))::int AS engagement_score,
           (json_build_object(
             'user_id', p.user_id,
             'username', p.username,
             'display_name', p.display_name,
             'avatar_url', p.avatar_url,
             'is_creator', COALESCE(p.is_verified, false),
             'followers', COALESCE(p.followers, 0),
             'following', COALESCE(p.following, 0),
             'level', COALESCE(p.level, 1)
           ))::json AS user
         FROM videos v
         LEFT JOIN profiles p ON p.user_id = v.user_id
         LEFT JOIN elix_video_foryou_state s ON s.video_id = v.id
         WHERE (v.privacy IS NULL OR v.privacy <> 'private')
           AND v.url IS NOT NULL AND btrim(v.url) <> ''
           AND v.url NOT ILIKE '%/stories/%'
           AND (
             s.video_id IS NULL
             OR s.stage IN ('initial', 'promoted', 'reentered')
           )
           AND COALESCE(s.guidelines_ok, TRUE) = TRUE
           AND (
             $3::text IS NULL
             OR NOT EXISTS (
               SELECT 1 FROM elix_video_not_interested ni
                WHERE ni.video_id = v.id AND ni.user_id = $3
             )
           )
           AND (
             -- Soft fraud gate: exclude creators with open confirmed fraud hold when sensitivity high
             $4::int < 70
             OR NOT EXISTS (
               SELECT 1 FROM elix_fraud_reviews fr
                WHERE fr.user_id = v.user_id
                  AND fr.status IN ('open', 'under_review', 'confirmed_fraud')
                LIMIT 1
             )
           )
       )
       SELECT * FROM eligible
       ORDER BY ranking_score DESC NULLS LAST, created_at DESC NULLS LAST
       LIMIT $1 OFFSET $2`,
      [limit, offset, viewer, cfg.fraudSensitivity],
    );
    return rows || [];
  } catch (err) {
    // Table may not exist yet pre-migration — fall back to recency.
    logger.warn({ err }, "queryRankedForYouPage failed; falling back to recency");
    try {
      const { rows } = await pool.query(
        `SELECT v.id, v.url, v.thumbnail, v.duration, v.description, v.hashtags, v.music,
                v.views, v.likes, v.comments, v.shares, v.saves,
                v.created_at, v.privacy, v.user_id,
                (COALESCE(v.views,0) + COALESCE(v.likes,0)*2 + COALESCE(v.comments,0) + COALESCE(v.shares,0))::int AS engagement_score,
                (json_build_object(
                  'user_id', p.user_id,
                  'username', p.username,
                  'display_name', p.display_name,
                  'avatar_url', p.avatar_url,
                  'is_creator', COALESCE(p.is_verified, false),
                  'followers', COALESCE(p.followers, 0),
                  'following', COALESCE(p.following, 0),
                  'level', COALESCE(p.level, 1)
                ))::json AS user
         FROM videos v
         LEFT JOIN profiles p ON p.user_id = v.user_id
         WHERE (v.privacy IS NULL OR v.privacy <> 'private')
           AND v.url IS NOT NULL AND btrim(v.url) <> ''
           AND v.url NOT ILIKE '%/stories/%'
         ORDER BY v.created_at DESC NULLS LAST
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      return rows || [];
    } catch (err2) {
      logger.error({ err: err2 }, "For You recency fallback failed");
      return [];
    }
  }
}
