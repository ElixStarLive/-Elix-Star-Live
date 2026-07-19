-- Re-price gifts to a sane ladder:
--   * Universe gifts  -> exactly 50,000 coins (single premium tier).
--   * Every other gift -> stays well UNDER 50,000 coins.
--
-- Background: 20260718003000_gift_prices_min_15k.sql multiplied every price by
-- 1000, pushing universe gifts to 1,000,000-5,000,000 coins and big gifts up to
-- 500,000. That made a single gift cost ~1000 GBP, which nobody will pay.
--
-- This migration:
--   * pins all universe gifts at 50,000 coins (and 50,000 battle points),
--   * undoes the x1000 inflation on all non-universe gifts (restores the
--     15..500 coin ladder and its battle-point ratio).
--
-- Idempotent: universe rows are set to a fixed value; non-universe rows are only
-- divided while still on the inflated scale (coin_cost >= 15000).
BEGIN;

-- Universe = the single 50k premium tier.
UPDATE elix_gifts
   SET coin_cost = 50000,
       battle_points = 50000
 WHERE gift_type = 'universe';

-- All other gifts: undo the x1000 inflation so every non-universe gift is well
-- under 50,000 coins, preserving the original ladder and battle-point ratio.
UPDATE elix_gifts
   SET coin_cost = GREATEST(1, coin_cost / 1000),
       battle_points = GREATEST(1, battle_points / 1000)
 WHERE gift_type <> 'universe'
   AND coin_cost >= 15000;

COMMIT;
