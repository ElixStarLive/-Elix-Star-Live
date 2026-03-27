BEGIN;

CREATE TABLE IF NOT EXISTS elix_auth_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_lower TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  username TEXT NOT NULL,
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elix_auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_elix_auth_sessions_user
  ON elix_auth_sessions(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS elix_device_tokens (
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_elix_device_tokens_user
  ON elix_device_tokens(user_id);

CREATE TABLE IF NOT EXISTS elix_gift_transactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  gift_id TEXT NOT NULL,
  coins INTEGER NOT NULL DEFAULT 0,
  client_transaction_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_elix_gift_transactions_user_time
  ON elix_gift_transactions(user_id, created_at DESC);

COMMIT;
