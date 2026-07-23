-- Temporary test price: Rose gift = 50 coins (Rose may be inactive in catalog).
-- Follow-up migration sets active Horse to 50 for LIVE testing.
BEGIN;

UPDATE elix_gifts
SET
  coin_cost = 50,
  battle_points = CASE
                    WHEN gift_type = 'universe' THEN battle_points
                    WHEN gift_type = 'big' THEN 50 * 5
                    ELSE 50
                  END
WHERE gift_id = 'rose';

COMMIT;
