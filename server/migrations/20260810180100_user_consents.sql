-- Server-authoritative user consent records (terms / age).
BEGIN;

CREATE TABLE IF NOT EXISTS user_consents (
  user_id TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  version TEXT NOT NULL,
  age_confirmed_13_plus BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, consent_type, version)
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_id
  ON user_consents (user_id);

COMMIT;
