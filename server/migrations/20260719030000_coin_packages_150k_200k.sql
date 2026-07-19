-- Add higher coin tiers (150k, 200k) so large single purchases credit correctly.
-- Product IDs use the store-aligned "elixstarlive.coins_*" form (no "com." prefix).
-- Prices follow the existing rate of GBP 0.0035 per coin. Coins credited come from
-- the "coins" column; bonus_coins mirrors the existing ~10% pattern and is cosmetic.
BEGIN;

INSERT INTO elix_coin_packages (id, coins, price, label, bonus_coins, is_popular, product_id) VALUES
  ('coins_150000', 150000, 525.0, '150K Coins', 15000, FALSE, 'elixstarlive.coins_150000'),
  ('coins_200000', 200000, 700.0, '200K Coins', 20000, FALSE, 'elixstarlive.coins_200000')
ON CONFLICT (id) DO NOTHING;

COMMIT;
