-- Starter Coins + user XP progression.
-- Starter coins are an isolated, non-monetary onboarding currency. They never
-- touch elix_wallet_balances, elix_wallet_ledger, creator earnings, IAP, or Stripe.

CREATE TABLE IF NOT EXISTS starter_coin_balances (
  user_id TEXT PRIMARY KEY,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_granted BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_granted >= 0),
  lifetime_spent BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS starter_coin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('onboarding_grant', 'gift_debit', 'admin_adjustment')),
  amount_delta BIGINT NOT NULL CHECK (amount_delta <> 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  gift_id TEXT,
  room_id TEXT,
  recipient_user_id TEXT,
  client_transaction_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  admin_user_id TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_starter_coin_transactions_user_created
  ON starter_coin_transactions(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_starter_gift_client_transaction
  ON starter_coin_transactions(client_transaction_id)
  WHERE client_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_progression (
  user_id TEXT PRIMARY KEY,
  total_xp BIGINT NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  current_level INTEGER NOT NULL DEFAULT 0 CHECK (current_level >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Read-only compatibility views expose the requested user_xp and user_level
-- concepts while one locked row keeps XP + level updates atomic.
CREATE OR REPLACE VIEW user_xp AS
SELECT user_id, total_xp, created_at, updated_at FROM user_progression;

CREATE OR REPLACE VIEW user_level AS
SELECT user_id, current_level AS level, created_at, updated_at
FROM user_progression;

CREATE TABLE IF NOT EXISTS xp_activity_config (
  source TEXT PRIMARY KEY,
  xp_amount INTEGER NOT NULL CHECK (xp_amount >= 0),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO xp_activity_config (source, xp_amount, description) VALUES
  ('starter_gift_small', 10, 'Small gift sent with Starter Coins'),
  ('starter_gift_medium', 50, 'Medium gift sent with Starter Coins'),
  ('starter_gift_big', 200, 'Large gift sent with Starter Coins'),
  ('starter_gift_universe', 500, 'Special gift sent with Starter Coins'),
  ('paid_gift_small', 10, 'Small paid gift'),
  ('paid_gift_medium', 50, 'Medium paid gift'),
  ('paid_gift_big', 200, 'Large paid gift'),
  ('paid_gift_universe', 500, 'Special paid gift'),
  ('challenge', 100, 'Challenge participation'),
  ('daily_activity', 10, 'Eligible daily activity')
ON CONFLICT (source) DO NOTHING;

CREATE TABLE IF NOT EXISTS xp_level_requirements (
  level INTEGER PRIMARY KEY CHECK (level >= 1),
  total_xp_required BIGINT NOT NULL CHECK (total_xp_required > 0),
  title TEXT,
  badge_code TEXT,
  cosmetic_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default curve: total XP required = 100 * level^2. Admin may edit any row.
INSERT INTO xp_level_requirements (level, total_xp_required, title, badge_code)
SELECT
  level,
  100::bigint * level::bigint * level::bigint,
  CASE level
    WHEN 1 THEN 'New Supporter'
    WHEN 10 THEN 'Active Fan'
    WHEN 25 THEN 'Super Supporter'
    WHEN 50 THEN 'Elite Supporter'
    ELSE NULL
  END,
  CASE level
    WHEN 1 THEN 'new_supporter'
    WHEN 10 THEN 'active_fan'
    WHEN 25 THEN 'super_supporter'
    WHEN 50 THEN 'elite_supporter'
    ELSE NULL
  END
FROM generate_series(1, 100) AS level
ON CONFLICT (level) DO NOTHING;

CREATE TABLE IF NOT EXISTS xp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  xp_amount INTEGER NOT NULL CHECK (xp_amount <> 0),
  source TEXT NOT NULL,
  related_activity_type TEXT,
  related_activity_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  admin_user_id TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xp_transactions_user_created
  ON xp_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS level_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  from_level INTEGER NOT NULL CHECK (from_level >= 0),
  to_level INTEGER NOT NULL CHECK (to_level >= 0),
  total_xp BIGINT NOT NULL CHECK (total_xp >= 0),
  source_xp_transaction_id UUID REFERENCES xp_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_level_history_user_created
  ON level_history(user_id, created_at DESC);

-- Explicit source on gift records. Existing rows are paid gifts.
ALTER TABLE elix_gift_transactions
  ADD COLUMN IF NOT EXISTS gift_source TEXT NOT NULL DEFAULT 'paid_coins';
ALTER TABLE elix_gift_transactions
  DROP CONSTRAINT IF EXISTS elix_gift_transactions_gift_source_check;
ALTER TABLE elix_gift_transactions
  ADD CONSTRAINT elix_gift_transactions_gift_source_check
  CHECK (gift_source IN ('starter_coins', 'paid_coins'));

-- Existing users get progression state only. Starter coins are granted only
-- inside the new-user registration transaction.
INSERT INTO user_progression (user_id, total_xp, current_level)
SELECT user_id, 0, 0 FROM profiles
ON CONFLICT (user_id) DO NOTHING;
