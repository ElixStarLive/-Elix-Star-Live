/**
 * Authoritative Profile → Reposts ownership.
 * Live (and video-capable) reposts persist in elix_reposts — not local UI state.
 */
import { getPool } from "./postgres";
import { logger } from "./logger";

export type RepostTargetType = "live" | "video";

export type RepostListItem = {
  target_type: RepostTargetType;
  target_id: string;
  created_at: string;
  /** Live host / video owner */
  owner_user_id: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_live: boolean;
  viewer_count: number;
  /** Video fields when target_type = video */
  video_url: string | null;
  thumbnail_url: string | null;
  views: number;
};

function isTargetType(v: unknown): v is RepostTargetType {
  return v === "live" || v === "video";
}

export async function dbRepostExists(
  userId: string,
  targetType: RepostTargetType,
  targetId: string,
): Promise<boolean> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  const r = await pool.query(
    `SELECT 1 FROM elix_reposts
      WHERE user_id = $1 AND target_type = $2 AND target_id = $3
      LIMIT 1`,
    [userId, targetType, targetId],
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Toggle: if present → remove; else → insert.
 * Single transaction owner for one tap.
 */
export async function dbToggleRepost(
  userId: string,
  targetType: RepostTargetType,
  targetId: string,
): Promise<{ reposted: boolean }> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT 1 FROM elix_reposts
        WHERE user_id = $1 AND target_type = $2 AND target_id = $3
        FOR UPDATE`,
      [userId, targetType, targetId],
    );
    if ((existing.rowCount ?? 0) > 0) {
      await client.query(
        `DELETE FROM elix_reposts
          WHERE user_id = $1 AND target_type = $2 AND target_id = $3`,
        [userId, targetType, targetId],
      );
      await client.query("COMMIT");
      return { reposted: false };
    }
    await client.query(
      `INSERT INTO elix_reposts (user_id, target_type, target_id)
       VALUES ($1, $2, $3)`,
      [userId, targetType, targetId],
    );
    await client.query("COMMIT");
    return { reposted: true };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    logger.error({ err, userId, targetType, targetId }, "dbToggleRepost failed");
    throw err;
  } finally {
    client.release();
  }
}

export async function dbListUserReposts(
  userId: string,
  limit: number,
  offset: number,
): Promise<RepostListItem[]> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  const lim = Math.min(100, Math.max(1, limit));
  const off = Math.max(0, offset);
  const r = await pool.query(
    `SELECT
        r.target_type,
        r.target_id,
        r.created_at,
        CASE
          WHEN r.target_type = 'live' THEN ls.user_id
          WHEN r.target_type = 'video' THEN v.user_id
          ELSE NULL
        END AS owner_user_id,
        CASE
          WHEN r.target_type = 'live' THEN COALESCE(NULLIF(ls.display_name, ''), p_live.display_name, p_live.username)
          WHEN r.target_type = 'video' THEN COALESCE(p_vid.display_name, p_vid.username)
          ELSE NULL
        END AS display_name,
        CASE
          WHEN r.target_type = 'live' THEN p_live.username
          WHEN r.target_type = 'video' THEN p_vid.username
          ELSE NULL
        END AS username,
        CASE
          WHEN r.target_type = 'live' THEN p_live.avatar_url
          WHEN r.target_type = 'video' THEN p_vid.avatar_url
          ELSE NULL
        END AS avatar_url,
        CASE WHEN r.target_type = 'live' THEN COALESCE(ls.is_live, FALSE) ELSE FALSE END AS is_live,
        CASE WHEN r.target_type = 'live' THEN COALESCE(ls.viewer_count, 0) ELSE 0 END AS viewer_count,
        CASE WHEN r.target_type = 'video' THEN v.url ELSE NULL END AS video_url,
        CASE WHEN r.target_type = 'video' THEN v.thumbnail ELSE NULL END AS thumbnail_url,
        CASE
          WHEN r.target_type = 'video' THEN COALESCE(v.views, 0)
          WHEN r.target_type = 'live' THEN COALESCE(ls.viewer_count, 0)
          ELSE 0
        END AS views
     FROM elix_reposts r
     LEFT JOIN live_streams ls
       ON r.target_type = 'live' AND ls.stream_key = r.target_id
     LEFT JOIN profiles p_live
       ON r.target_type = 'live' AND p_live.user_id = ls.user_id
     LEFT JOIN videos v
       ON r.target_type = 'video' AND v.id = r.target_id
     LEFT JOIN profiles p_vid
       ON r.target_type = 'video' AND p_vid.user_id = v.user_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, lim, off],
  );

  return (r.rows || []).map((row: Record<string, unknown>) => {
    const targetType = isTargetType(row.target_type) ? row.target_type : "live";
    return {
      target_type: targetType,
      target_id: String(row.target_id ?? ""),
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? ""),
      owner_user_id: row.owner_user_id != null ? String(row.owner_user_id) : null,
      display_name: row.display_name != null ? String(row.display_name) : null,
      username: row.username != null ? String(row.username) : null,
      avatar_url: row.avatar_url != null ? String(row.avatar_url) : null,
      is_live: Boolean(row.is_live),
      viewer_count: Number(row.viewer_count) || 0,
      video_url: row.video_url != null ? String(row.video_url) : null,
      thumbnail_url: row.thumbnail_url != null ? String(row.thumbnail_url) : null,
      views: Number(row.views) || 0,
    };
  });
}

/** Validate live stream_key exists (current or ended). */
export async function dbLiveStreamExists(streamKey: string): Promise<boolean> {
  const pool = getPool();
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  const r = await pool.query(
    `SELECT 1 FROM live_streams WHERE stream_key = $1 LIMIT 1`,
    [streamKey],
  );
  return (r.rowCount ?? 0) > 0;
}
