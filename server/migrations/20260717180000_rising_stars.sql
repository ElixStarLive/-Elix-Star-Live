-- Rising Stars competition system (additive). Free votes are NOT coins/gifts/wallet.

CREATE TABLE IF NOT EXISTS rs_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rs_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES rs_seasons(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (season_id, slug)
);

CREATE TABLE IF NOT EXISTS rs_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES rs_seasons(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  country_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (season_id, slug)
);

CREATE TABLE IF NOT EXISTS rs_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES rs_seasons(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES rs_categories(id) ON DELETE CASCADE,
  region_id UUID REFERENCES rs_regions(id) ON DELETE SET NULL,
  week_index INT NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT,
  sound_provider TEXT NOT NULL DEFAULT 'epidemic',
  sound_track_id TEXT NOT NULL,
  sound_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  exclusive_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'open', 'voting', 'qualified', 'final', 'closed')),
  leaderboard_frozen BOOLEAN NOT NULL DEFAULT FALSE,
  live_qualifier_room_id TEXT,
  live_final_room_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_challenges_season_status
  ON rs_challenges(season_id, status);
CREATE INDEX IF NOT EXISTS idx_rs_challenges_category_region
  ON rs_challenges(category_id, region_id);

CREATE TABLE IF NOT EXISTS rs_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES rs_seasons(id) ON DELETE CASCADE,
  region_id UUID REFERENCES rs_regions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  captain_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season_id, slug)
);

CREATE TABLE IF NOT EXISTS rs_team_members (
  team_id UUID NOT NULL REFERENCES rs_teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('member', 'captain')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rs_team_members_user ON rs_team_members(user_id);

CREATE TABLE IF NOT EXISTS rs_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES rs_challenges(id) ON DELETE CASCADE,
  creator_user_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  team_id UUID REFERENCES rs_teams(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'disqualified', 'advanced', 'eliminated', 'withdrawn')),
  vote_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, creator_user_id),
  UNIQUE (challenge_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_rs_entries_challenge_votes
  ON rs_entries(challenge_id, vote_count DESC)
  WHERE status IN ('active', 'advanced');
CREATE INDEX IF NOT EXISTS idx_rs_entries_creator
  ON rs_entries(creator_user_id);

-- One free vote per authenticated user per challenge per calendar day (UTC date).
CREATE TABLE IF NOT EXISTS rs_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES rs_challenges(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES rs_entries(id) ON DELETE CASCADE,
  voter_user_id TEXT NOT NULL,
  vote_day DATE NOT NULL DEFAULT (CURRENT_DATE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, voter_user_id, vote_day)
);

CREATE INDEX IF NOT EXISTS idx_rs_votes_entry ON rs_votes(entry_id);
CREATE INDEX IF NOT EXISTS idx_rs_votes_voter_day ON rs_votes(voter_user_id, vote_day);

CREATE TABLE IF NOT EXISTS rs_phase_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES rs_challenges(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('qualifier', 'final')),
  entry_id UUID NOT NULL REFERENCES rs_entries(id) ON DELETE CASCADE,
  rank INT NOT NULL,
  vote_count_snapshot INT NOT NULL DEFAULT 0,
  live_score_snapshot INT NOT NULL DEFAULT 0,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (challenge_id, phase, entry_id),
  UNIQUE (challenge_id, phase, rank)
);

CREATE TABLE IF NOT EXISTS rs_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES rs_seasons(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT,
  kind TEXT NOT NULL
    CHECK (kind IN ('participation', 'top10', 'finalist', 'winner', 'region', 'team', 'season')),
  UNIQUE (season_id, code)
);

CREATE TABLE IF NOT EXISTS rs_user_badges (
  user_id TEXT NOT NULL,
  badge_id UUID NOT NULL REFERENCES rs_badges(id) ON DELETE CASCADE,
  challenge_id UUID REFERENCES rs_challenges(id) ON DELETE SET NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  awarded_by TEXT,
  PRIMARY KEY (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_rs_user_badges_user ON rs_user_badges(user_id);

CREATE TABLE IF NOT EXISTS rs_reward_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES rs_seasons(id) ON DELETE CASCADE,
  place_from INT NOT NULL DEFAULT 1,
  place_to INT NOT NULL DEFAULT 1,
  category_id UUID REFERENCES rs_categories(id) ON DELETE SET NULL,
  region_id UUID REFERENCES rs_regions(id) ON DELETE SET NULL,
  reward_kind TEXT NOT NULL
    CHECK (reward_kind IN ('badge', 'cosmetic', 'featured', 'cash_off_platform', 'creator_credit_manual', 'none')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (place_from >= 1 AND place_to >= place_from)
);

CREATE TABLE IF NOT EXISTS rs_reward_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES rs_reward_definitions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  challenge_id UUID REFERENCES rs_challenges(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'granted', 'rejected')),
  granted_by TEXT,
  granted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (definition_id, user_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS rs_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_admin_audit_created
  ON rs_admin_audit(created_at DESC);
