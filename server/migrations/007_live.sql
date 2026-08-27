-- PAGE-038: live streams.
BEGIN;

CREATE TABLE IF NOT EXISTS live_streams (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  stream_key TEXT NOT NULL,
  is_live BOOLEAN NOT NULL DEFAULT TRUE,
  viewer_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_live_streams_user ON live_streams(user_id);
CREATE INDEX IF NOT EXISTS idx_live_streams_live ON live_streams(is_live, started_at DESC);

COMMIT;
