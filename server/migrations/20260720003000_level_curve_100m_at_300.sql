-- Level curve: power progression anchored to the owner's two targets.
--   level 20  = 200,000 XP      (reach 200k -> level 20)
--   level 300 = 100,000,000 XP  (reach 100M -> level 300)
--
-- Derived as total_xp_required = C * level^p where
--   p = ln(500)/ln(15) ≈ 2.294744   (since (300/20)^p = 100M/200k = 500)
--   C = 200000 / 20^p ≈ 206.9
-- Early levels stay easy and the climb steepens toward 300, so gifting coins
-- (1 coin = 1 XP) moves the level bit by bit and hitting level 300 needs 100M.
--
-- Overwrites total_xp_required for every level 1..300 (keeps titles/badges) and
-- recalculates each user's current level against the new curve. Idempotent.
BEGIN;

INSERT INTO xp_level_requirements (level, total_xp_required)
SELECT level, GREATEST(1, ROUND(206.9 * POWER(level::double precision, 2.294744)))::bigint
FROM generate_series(1, 300) AS level
ON CONFLICT (level) DO UPDATE SET
  total_xp_required = EXCLUDED.total_xp_required,
  updated_at = NOW();

-- Re-derive levels from the new curve for everyone.
UPDATE user_progression up
   SET current_level = COALESCE(
         (SELECT MAX(level) FROM xp_level_requirements
           WHERE total_xp_required <= up.total_xp),
         0
       ),
       updated_at = NOW();

UPDATE profiles p
   SET level = up.current_level, updated_at = NOW()
  FROM user_progression up
 WHERE up.user_id = p.user_id
   AND p.level IS DISTINCT FROM up.current_level;

COMMIT;
