-- Restore temporary test gift prices introduced for QA.
-- Previous migrations set rose/horse to 50 coins "for testing".
-- PK column is gift_id (not id).

-- elix_gifts has no updated_at column (see 20260328120000 create table).
UPDATE elix_gifts
SET coin_cost = 5000
WHERE gift_id IN ('rose', 'horse')
  AND coin_cost = 50;
