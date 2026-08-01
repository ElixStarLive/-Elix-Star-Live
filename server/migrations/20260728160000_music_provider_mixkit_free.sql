-- Drop Epidemic Sound as default music provider for Rising Stars.
-- In-app catalog is Mixkit free (server/services/freeSoundCatalog.ts).

ALTER TABLE IF EXISTS rs_challenges
  ALTER COLUMN sound_provider SET DEFAULT 'mixkit_free';

UPDATE rs_challenges
SET sound_provider = 'mixkit_free'
WHERE sound_provider = 'epidemic';
