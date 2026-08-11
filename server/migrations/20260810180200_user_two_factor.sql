-- Per-user TOTP two-factor authentication.
BEGIN;

CREATE TABLE IF NOT EXISTS user_two_factor (
  user_id TEXT NOT NULL PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  secret TEXT NULL,
  backup_codes TEXT[] NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
