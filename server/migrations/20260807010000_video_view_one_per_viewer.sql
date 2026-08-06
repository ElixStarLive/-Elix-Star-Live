-- One public view per viewer per video (scroll-back must not inflate videos.views).
BEGIN;

CREATE TABLE IF NOT EXISTS video_view_counters (
  video_id TEXT NOT NULL,
  viewer_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (video_id, viewer_key)
);

CREATE INDEX IF NOT EXISTS idx_video_view_counters_video_id
  ON video_view_counters (video_id);

COMMIT;
