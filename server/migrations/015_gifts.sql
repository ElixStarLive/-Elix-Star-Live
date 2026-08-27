-- PAGE-037: gifts for live streams and battles.
BEGIN;

CREATE TABLE IF NOT EXISTS gift_packages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  animation TEXT NOT NULL DEFAULT '',
  battle_points INTEGER NOT NULL DEFAULT 0,
  financial_value_gbp NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS live_gifts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  stream_id TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gift_id TEXT NOT NULL REFERENCES gift_packages(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'test',
  battle_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_gifts_stream ON live_gifts(stream_id);

COMMIT;
