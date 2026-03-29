-- Feed query performance: composite seek for friends / user timelines + FYP partial index alignment.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_videos_user_id_created_at
  ON videos (user_id, created_at DESC NULLS LAST);

COMMIT;
