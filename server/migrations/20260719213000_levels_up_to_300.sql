-- Extend the existing level curve from 100 to 300 levels.
-- Uses the same default curve already seeded for 1..100:
--   total XP required = 100 * level^2.
-- ON CONFLICT DO NOTHING keeps any admin-edited rows (1..100) untouched and only
-- fills in the new 101..300 rows. Idempotent.
BEGIN;

INSERT INTO xp_level_requirements (level, total_xp_required, title, badge_code)
SELECT
  level,
  100::bigint * level::bigint * level::bigint,
  CASE level
    WHEN 100 THEN 'Legend'
    WHEN 200 THEN 'Mythic'
    WHEN 300 THEN 'Immortal'
    ELSE NULL
  END,
  CASE level
    WHEN 100 THEN 'legend'
    WHEN 200 THEN 'mythic'
    WHEN 300 THEN 'immortal'
    ELSE NULL
  END
FROM generate_series(1, 300) AS level
ON CONFLICT (level) DO NOTHING;

COMMIT;
