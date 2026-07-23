-- Email verification for password accounts.
-- Existing accounts are grandfathered (confirmed) so nobody is locked out.
-- New registrations leave email_confirmed_at NULL until the verify link is used.

ALTER TABLE elix_auth_users
  ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;

UPDATE elix_auth_users
   SET email_confirmed_at = COALESCE(created_at, NOW())
 WHERE email_confirmed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_elix_auth_users_unconfirmed
  ON elix_auth_users (id)
  WHERE email_confirmed_at IS NULL;
