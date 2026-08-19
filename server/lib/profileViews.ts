/**
 * Profile view registration — unique viewers (public) + total visits (analytics).
 * Backend is the sole source of truth; concurrent-safe via PK + ON CONFLICT DO NOTHING.
 */

import { getPool } from "./postgres";
import { logger } from "./logger";
import { isValkeyConfigured, valkeyDel } from "./valkey";

type ProfileViewRegisterResult = {
  uniqueViews: number;
  /** True when this request created a new unique viewer row. */
  isNewUniqueView: boolean;
  /** Internal analytics only — do not show on public profile UI. */
  totalVisits: number;
};

async function invalidateProfileCache(ownerUserId: string): Promise<void> {
  if (!isValkeyConfigured()) return;
  try {
    await valkeyDel(`profile:${ownerUserId}`);
  } catch (err) {
    logger.warn({ err, ownerUserId }, "profileViews: cache invalidate failed");
  }
}

/**
 * Register one profile open for an authenticated viewer.
 * - Always increments total_profile_visits (analytics).
 * - Lifetime unique: one row per (viewer, owner); increments unique_profile_views only on insert.
 * - Own-profile opens: visits only, never unique.
 */
export async function registerProfileView(
  viewerUserId: string,
  profileOwnerUserId: string,
): Promise<ProfileViewRegisterResult | null> {
  const viewer = String(viewerUserId || "").trim();
  const owner = String(profileOwnerUserId || "").trim();
  if (!viewer || !owner) return null;

  const db = getPool();
  if (!db) return null;

  const isSelf = viewer === owner;

  try {
    const result = await db.query<{
      unique_views: number;
      total_visits: number;
      is_new_unique: boolean;
    }>(
      `
      WITH visit AS (
        UPDATE profiles
        SET total_profile_visits = COALESCE(total_profile_visits, 0) + 1,
            updated_at = NOW()
        WHERE user_id = $2
        RETURNING
          COALESCE(unique_profile_views, 0) AS unique_views,
          COALESCE(total_profile_visits, 0) AS total_visits
      ),
      ins AS (
        INSERT INTO profile_unique_views (
          viewer_user_id,
          profile_owner_user_id,
          first_viewed_at,
          last_viewed_at
        )
        SELECT $1, $2, NOW(), NOW()
        WHERE $1 <> $2
        ON CONFLICT (viewer_user_id, profile_owner_user_id) DO NOTHING
        RETURNING 1
      ),
      touch AS (
        UPDATE profile_unique_views
        SET last_viewed_at = NOW()
        WHERE viewer_user_id = $1
          AND profile_owner_user_id = $2
          AND $1 <> $2
          AND NOT EXISTS (SELECT 1 FROM ins)
        RETURNING 1
      ),
      bump AS (
        UPDATE profiles
        SET unique_profile_views = COALESCE(unique_profile_views, 0) + 1,
            updated_at = NOW()
        WHERE user_id = $2
          AND $1 <> $2
          AND EXISTS (SELECT 1 FROM ins)
        RETURNING
          COALESCE(unique_profile_views, 0) AS unique_views,
          COALESCE(total_profile_visits, 0) AS total_visits
      )
      SELECT
        COALESCE(
          (SELECT unique_views FROM bump),
          (SELECT unique_views FROM visit),
          0
        )::int AS unique_views,
        COALESCE(
          (SELECT total_visits FROM bump),
          (SELECT total_visits FROM visit),
          0
        )::int AS total_visits,
        EXISTS (SELECT 1 FROM ins) AS is_new_unique
      `,
      [viewer, owner],
    );

    const row = result.rows?.[0];
    if (!row) {
      logger.warn({ viewer, owner }, "profileViews: register returned no row");
      return null;
    }

    await invalidateProfileCache(owner);

    return {
      uniqueViews: Number(row.unique_views) || 0,
      isNewUniqueView: Boolean(row.is_new_unique) && !isSelf,
      totalVisits: Number(row.total_visits) || 0,
    };
  } catch (err) {
    logger.error({ err, viewer, owner }, "profileViews: registerProfileView failed");
    return null;
  }
}