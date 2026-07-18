-- video_views: analytics rows written by POST /api/feed track-view. The table was
-- referenced in code but never created by a migration, so every insert failed
-- (logged as "Failed to insert video_views row after track view"). Create it
-- idempotently plus the indexes the read/aggregation paths need.
--
-- elix_creator_earnings: the periodic maturation job scans
--   WHERE status='pending' AND kind='gift' AND created_at <= NOW() - interval
-- ordered by created_at. Add a partial index so this stays fast as the table grows.
BEGIN;

CREATE TABLE IF NOT EXISTS video_views (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  watch_time_seconds INTEGER NOT NULL DEFAULT 0,
  video_duration_seconds INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_views_video_id_created_at
  ON video_views (video_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_views_user_id_created_at
  ON video_views (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_earnings_pending_gift_created_at
  ON elix_creator_earnings (created_at)
  WHERE status = 'pending' AND kind = 'gift';

COMMIT;
