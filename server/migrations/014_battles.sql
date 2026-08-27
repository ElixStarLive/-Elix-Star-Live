-- PAGE-037: live battles.
BEGIN;

CREATE TABLE IF NOT EXISTS battles (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  creator_stream_id TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  opponent_stream_id TEXT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
  creator_score INTEGER NOT NULL DEFAULT 0,
  opponent_score INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  CHECK (creator_stream_id <> opponent_stream_id)
);

CREATE TABLE IF NOT EXISTS battle_taps (
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (battle_id, user_id, side)
);

CREATE INDEX IF NOT EXISTS idx_battles_active ON battles(is_active, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_battle_taps_battle ON battle_taps(battle_id);

COMMIT;
