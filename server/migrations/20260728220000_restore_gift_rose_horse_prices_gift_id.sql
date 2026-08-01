-- Re-apply rose/horse restore using the correct PK column (gift_id).
-- 20260728210000 filtered on `id`, which is not the gifts primary key, so
-- production could still show coin_cost = 50 after that migration "ran".

UPDATE elix_gifts
SET coin_cost = 5000,
    updated_at = NOW()
WHERE gift_id IN ('rose', 'horse')
  AND coin_cost <> 5000;
