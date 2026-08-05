-- Unique profile views (lifetime per viewer→owner) + total visits (analytics).
-- Public counter: unique_profile_views. Internal: total_profile_visits.

BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS unique_profile_views INT NOT NULL DEFAULT 0;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS total_profile_visits INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS profile_unique_views (
  viewer_user_id TEXT NOT NULL,
  profile_owner_user_id TEXT NOT NULL,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (viewer_user_id, profile_owner_user_id),
  CONSTRAINT profile_unique_views_no_self CHECK (viewer_user_id <> profile_owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_unique_views_owner
  ON profile_unique_views (profile_owner_user_id);

CREATE INDEX IF NOT EXISTS idx_profile_unique_views_owner_first
  ON profile_unique_views (profile_owner_user_id, first_viewed_at DESC);

COMMIT;
