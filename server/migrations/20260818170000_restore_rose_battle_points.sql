-- Finish reverting the July QA gift-price experiment.
--
-- 20260723183000 and 20260723184500 dropped Rose and Horse to 50 coins for
-- live gift-send testing and rewrote battle_points with the same 50. The
-- follow-up revert (20260728210000) restored coin_cost = 5000 but left
-- battle_points behind, and 20260804153000 only re-synced Horse. Rose was
-- therefore still carrying the test score: 5000 coins bought 50 battle points
-- where every other gift awards points equal to its coin cost.
--
-- battle_points is authoritative for battle score (server/websocket/giftRegistry.ts
-- reads `battle_points || coin_cost`), and Rose is inactive today, so this is a
-- latent value rather than a live one. It is corrected here so reactivating the
-- gift cannot resurrect the QA number.
--
-- Rule reproduced from 20260720020000: universe keeps its own points, big is
-- coins * 5, everything else equals coin_cost. Only rows still holding the
-- literal test value are touched.

UPDATE elix_gifts
SET battle_points = CASE
                      WHEN gift_type = 'big' THEN coin_cost * 5
                      ELSE coin_cost
                    END
WHERE gift_id IN ('rose', 'horse')
  AND coin_cost = 5000
  AND battle_points = 50;
