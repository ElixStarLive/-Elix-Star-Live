-- Glove booster: keep catches rare. Never catch every gift.
-- Catch rate is a probability 0-1 (default 12%). Max catches per activation
-- hard-caps how many gifts one glove window can multiply.

UPDATE booster_config
SET value = 0.12,
    description = 'Probability (0-1) that an active glove booster catches a gift. Must stay well below 1 so most gifts score normally.',
    updated_at = NOW()
WHERE key = 'point_multiplier_catch_rate';

INSERT INTO booster_config (key, value, description) VALUES
  ('point_multiplier_max_catches', 3, 'Max gifts one glove activation window can catch. Further gifts in that window always score normally.')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();
