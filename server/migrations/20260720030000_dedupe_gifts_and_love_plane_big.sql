-- De-duplicate the gift catalog + make the love plane a premium big gift.
--
-- Problem: six legacy gifts reuse another gift's animation (visual duplicates):
--   rose   -> treasure_drake_cub.mp4   (dup of "Treasure Drake Cub")
--   heart  -> pink_love_jet.mp4        (dup of "Pink Love Jet")
--   kiss   -> romantic_jet.mp4         (dup of "Romantic Jet")
--   rocket -> lightning_hypercar.mp4   (dup of "Lightning Hypercar")
--   diamond-> celestial_star_wand.mp4  (dup of "Celestial Star Wand")
--   crown  -> crown_kitty_treasure.mp4 (dup of "Crown Kitty Treasure")
-- Deactivate the legacy borrowers; keep the canonical named gifts.
--
-- Also: "Pink Love Jet" (the love plane) is a premium gift, so it becomes a BIG
-- gift priced at the 50,000 max. To keep every price unique, the top universe
-- gift is nudged off 50,000.
BEGIN;

-- 1) Remove duplicate legacy gifts (they reuse another gift's animation).
UPDATE elix_gifts
   SET is_active = FALSE
 WHERE gift_id IN ('rose', 'heart', 'kiss', 'crown', 'diamond', 'rocket');

-- 2) Love plane becomes a premium BIG gift at the 50k top (battle = coins * 5).
UPDATE elix_gifts
   SET gift_type = 'big',
       coin_cost = 50000,
       battle_points = 250000
 WHERE gift_id = 'pink_love_jet';

-- 3) Keep prices unique: free 50,000 for the love plane (was the top universe).
UPDATE elix_gifts
   SET coin_cost = 49900
 WHERE gift_id = 'elix_global_universe';

COMMIT;
