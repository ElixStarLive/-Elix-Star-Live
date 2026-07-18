-- Mist Fog booster: backend-driven duration (reuses the booster_config table).
-- The fog hides the battle score for everyone except the supported creator; it is
-- purely visual (no points), so it only needs a tunable active window here.

INSERT INTO booster_config (key, value, description) VALUES
  ('mist_fog_duration_ms', 30000, 'Active window of the Mist Fog booster (hides battle score from the opposing side), in milliseconds')
ON CONFLICT (key) DO NOTHING;
