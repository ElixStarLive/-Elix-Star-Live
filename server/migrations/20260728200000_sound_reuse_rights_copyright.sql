-- Sound reuse rights, copyright reports, appeals, and moderation audit.
-- Backward-compatible: existing sounds default to non-reusable.

ALTER TABLE sounds
  ADD COLUMN IF NOT EXISTS allow_reuse BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rights_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rights_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rights_confirmation_version TEXT,
  ADD COLUMN IF NOT EXISTS rights_confirmed_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS rights_confirmation_ip_hash TEXT,
  ADD COLUMN IF NOT EXISTS rights_confirmation_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS copyright_status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS reuse_disabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reuse_disabled_reason TEXT,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_reason TEXT,
  ADD COLUMN IF NOT EXISTS original_uploader_id TEXT,
  ADD COLUMN IF NOT EXISTS source_video_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Ensure existing rows are non-reusable (explicit; defaults already cover new rows).
UPDATE sounds
SET allow_reuse = FALSE,
    rights_confirmed = FALSE,
    copyright_status = COALESCE(NULLIF(copyright_status, ''), 'ACTIVE')
WHERE allow_reuse IS DISTINCT FROM FALSE
   OR rights_confirmed IS DISTINCT FROM FALSE;

CREATE INDEX IF NOT EXISTS idx_sounds_uploader ON sounds(original_uploader_id);
CREATE INDEX IF NOT EXISTS idx_sounds_source_video ON sounds(source_video_id);
CREATE INDEX IF NOT EXISTS idx_sounds_reuse ON sounds(allow_reuse, copyright_status)
  WHERE allow_reuse = TRUE AND removed_at IS NULL;

CREATE TABLE IF NOT EXISTS sound_rights_confirmations (
  id TEXT PRIMARY KEY,
  sound_id TEXT NOT NULL REFERENCES sounds(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  confirmation_version TEXT NOT NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash TEXT,
  user_agent TEXT,
  app_version TEXT,
  platform TEXT
);

CREATE INDEX IF NOT EXISTS idx_sound_rights_confirmations_sound
  ON sound_rights_confirmations(sound_id);
CREATE INDEX IF NOT EXISTS idx_sound_rights_confirmations_user
  ON sound_rights_confirmations(user_id);

CREATE TABLE IF NOT EXISTS sound_reuse_events (
  id TEXT PRIMARY KEY,
  sound_id TEXT NOT NULL REFERENCES sounds(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL,
  video_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sound_reuse_events_sound
  ON sound_reuse_events(sound_id);

CREATE TABLE IF NOT EXISTS copyright_reports (
  id TEXT PRIMARY KEY,
  case_reference TEXT NOT NULL UNIQUE,
  sound_id TEXT NOT NULL,
  source_video_id TEXT,
  reporter_user_id TEXT,
  reporter_name TEXT NOT NULL,
  reporter_email TEXT NOT NULL,
  rights_owner_name TEXT NOT NULL,
  relationship_to_rights_owner TEXT NOT NULL,
  description TEXT NOT NULL,
  original_work_description TEXT NOT NULL,
  original_work_url TEXT,
  supporting_evidence_url TEXT,
  good_faith_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  accuracy_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  electronic_signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  assigned_moderator_id TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  decision_reason TEXT,
  internal_notes TEXT,
  idempotency_key TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_copyright_reports_status ON copyright_reports(status);
CREATE INDEX IF NOT EXISTS idx_copyright_reports_sound ON copyright_reports(sound_id);
CREATE INDEX IF NOT EXISTS idx_copyright_reports_reporter ON copyright_reports(reporter_user_id);

CREATE TABLE IF NOT EXISTS copyright_appeals (
  id TEXT PRIMARY KEY,
  case_reference TEXT NOT NULL,
  report_id TEXT NOT NULL REFERENCES copyright_reports(id) ON DELETE RESTRICT,
  appellant_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  rights_explanation TEXT NOT NULL,
  supporting_evidence_url TEXT,
  accuracy_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  electronic_signature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  decision_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_copyright_appeals_report ON copyright_appeals(report_id);
CREATE INDEX IF NOT EXISTS idx_copyright_appeals_appellant ON copyright_appeals(appellant_user_id);

CREATE TABLE IF NOT EXISTS copyright_moderation_actions (
  id TEXT PRIMARY KEY,
  report_id TEXT,
  sound_id TEXT,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_copyright_moderation_actions_report
  ON copyright_moderation_actions(report_id);
CREATE INDEX IF NOT EXISTS idx_copyright_moderation_actions_sound
  ON copyright_moderation_actions(sound_id);

-- Repeat-infringement tracking on profiles (additive; no auto-ban).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS valid_copyright_findings INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copyright_warnings INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS temporary_copyright_restrictions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copyright_account_reviews INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS copyright_reuse_suspended_until TIMESTAMPTZ;
