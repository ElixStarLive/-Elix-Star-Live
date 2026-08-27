-- Identity and session storage.
--
-- `users` holds credentials and nothing else; anything a person can edit about
-- how they appear lives in `profiles`. Keeping them apart means a profile read
-- on a hot path never has to touch a row containing a password hash.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- citext so two accounts cannot differ only by capitalisation.
  email               citext      NOT NULL UNIQUE,
  username            citext      NOT NULL UNIQUE,
  password_hash       text,
  -- NULL until the address is proven. Not a boolean: knowing *when* an address
  -- was confirmed is what lets a verification token be invalidated on use.
  email_confirmed_at  timestamptz,
  -- Apple's stable subject claim. NULL for password-only accounts.
  apple_sub           text        UNIQUE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT users_username_format CHECK (username ~ '^[a-zA-Z0-9_.]{3,30}$'),
  CONSTRAINT users_email_shape     CHECK (position('@' IN email) > 1),
  -- An account must be reachable by at least one credential; a row with neither
  -- can never be signed into and should not be creatable.
  CONSTRAINT users_has_credential  CHECK (password_hash IS NOT NULL OR apple_sub IS NOT NULL)
);

CREATE TABLE profiles (
  user_id       uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  display_name  text        NOT NULL,
  avatar_url    text        NOT NULL DEFAULT '',
  bio           text        NOT NULL DEFAULT '',
  is_admin      boolean     NOT NULL DEFAULT false,
  is_verified   boolean     NOT NULL DEFAULT false,
  -- Suspension expiry. NULL means not suspended; a past value means the
  -- suspension has lapsed, so bans expire without a sweep job.
  banned_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT profiles_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 60)
);

-- Partial index: only suspended accounts are ever scanned by moderation views.
CREATE INDEX profiles_banned_until_idx ON profiles (banned_until) WHERE banned_until IS NOT NULL;

CREATE TABLE auth_sessions (
  -- SHA-256 of the bearer token. The token itself is never stored, so a dump of
  -- this table cannot be replayed against the API.
  token_hash  text        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent  text        NOT NULL DEFAULT ''
);

-- Supports "sign out everywhere" and the per-user session list.
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);
-- Supports reaping expired rows without a full scan.
CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions (expires_at);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
