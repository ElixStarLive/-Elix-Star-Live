-- PAGE-071: rising stars challenges.
BEGIN;

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  hashtag TEXT NOT NULL DEFAULT '',
  start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenges_active ON challenges (is_active, end_at DESC);

COMMIT;
