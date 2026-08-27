-- PAGE-047: sounds/music catalog.
BEGIN;

CREATE TABLE IF NOT EXISTS sounds (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  thumbnail TEXT NOT NULL DEFAULT '',
  duration NUMERIC NOT NULL DEFAULT 0,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sounds_use_count ON sounds (use_count DESC);

COMMIT;
