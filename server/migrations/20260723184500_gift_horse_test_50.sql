-- Temporary test price: Horse (active catalog gift) = 50 coins for LIVE
-- gift-send + creator withdraw verification. Restore to 5000 after testing.
BEGIN;

UPDATE elix_gifts
SET
  coin_cost = 50,
  battle_points = CASE
                    WHEN gift_type = 'universe' THEN battle_points
                    WHEN gift_type = 'big' THEN 50 * 5
                    ELSE 50
                  END,
  is_active = TRUE
WHERE gift_id = 'horse';

COMMIT;
