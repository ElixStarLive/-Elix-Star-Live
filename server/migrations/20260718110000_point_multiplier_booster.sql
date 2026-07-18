-- Point Multiplier Booster: server-side "catch" mechanic.
-- Config is backend-driven (never hardcoded) and every catch attempt is audited.

CREATE TABLE IF NOT EXISTS booster_config (
  key TEXT PRIMARY KEY,
  value NUMERIC NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO booster_config (key, value, description) VALUES
  ('point_multiplier_catch_rate', 0.12, 'Probability (0-1) that an active glove booster catches a gift — most gifts must miss'),
  ('point_multiplier_max_catches', 3, 'Max gifts one glove activation window can catch'),
  ('point_multiplier_duration_ms', 30000, 'Active window of the point-multiplier booster, in milliseconds'),
  ('point_multiplier_x3_enabled', 1, 'Whether the x3 point-multiplier booster is enabled (1/0)'),
  ('point_multiplier_x5_enabled', 1, 'Whether the x5 point-multiplier booster is enabled (1/0)')
ON CONFLICT (key) DO NOTHING;

-- One audit row per gift processed while a booster was active (caught or not).
-- The UNIQUE(transaction_id) index makes catch resolution replay-safe.
CREATE TABLE IF NOT EXISTS booster_catch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  gift_id TEXT,
  multiplier INTEGER NOT NULL,
  base_points INTEGER NOT NULL,
  final_points INTEGER NOT NULL,
  caught BOOLEAN NOT NULL,
  catch_rate NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_booster_catch_tx ON booster_catch_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_booster_catch_room ON booster_catch_logs(room_id, created_at DESC);
