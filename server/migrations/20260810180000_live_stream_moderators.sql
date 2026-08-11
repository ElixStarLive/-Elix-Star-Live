-- Live stream moderators (host-granted per stream_key).
BEGIN;

CREATE TABLE IF NOT EXISTS live_stream_moderators (
  stream_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (stream_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_stream_moderators_user_id
  ON live_stream_moderators (user_id);

COMMIT;
