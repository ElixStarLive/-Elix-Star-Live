-- Stories (24h) stored in Neon — Add story / For You rings
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT DEFAULT '',
  display_name TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  media_url TEXT NOT NULL,
  thumbnail TEXT DEFAULT '',
  media_type TEXT DEFAULT 'video',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories (expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_user_id_created ON stories (user_id, created_at DESC);
-- NOTE: a partial index predicate cannot use NOW() (not IMMUTABLE). A composite
-- (user_id, expires_at) index serves the same "active stories for a user" lookups
-- (user_id = $1 AND expires_at > now()) without the illegal predicate.
CREATE INDEX IF NOT EXISTS idx_stories_active_user ON stories (user_id, expires_at);
