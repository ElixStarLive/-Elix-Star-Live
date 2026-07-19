-- Level curve: steady linear progression of 10,000 XP per level.
--   level 1  = 10,000 XP
--   level 20 = 200,000 XP   (owner spec: reach 200k -> level 20)
--   level 300 = 3,000,000 XP
-- Since gift XP now equals coins spent (1 coin = 1 XP), the level climbs
-- steadily as coins are gifted instead of the old steep 100*level^2 curve.
--
-- Overwrites total_xp_required for every level 1..300 (keeps existing titles /
-- badges). Recalculates each user's current level against the new curve.
-- Idempotent.
BEGIN;

INSERT INTO xp_level_requirements (level, total_xp_required)
SELECT level, 10000::bigint * level::bigint
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
