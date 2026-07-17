-- Re-price gifts so the catalog starts at 15,000 coins (premium "big gift" ladder).
-- Scales the existing tier ladder by x1000 (floor 15 -> 15,000; top 500 -> 500,000),
-- preserving relative ordering and the small(1x)/big(5x) battle-point relationship.
-- Guarded by `coin_cost < 15000` so the migration is idempotent and only touches
-- gifts still on the old low-coin scale.
BEGIN;

UPDATE elix_gifts
   SET coin_cost = coin_cost * 1000,
       battle_points = battle_points * 1000
 WHERE coin_cost < 15000;

COMMIT;
