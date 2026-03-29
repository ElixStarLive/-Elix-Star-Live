-- Core app tables, wallet, payout, moderation, and seed data.
-- Applied once per filename via npm run migrate (never from app workers).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  thumbnail TEXT DEFAULT '',
  duration NUMERIC DEFAULT 0,
  user_id TEXT NOT NULL,
  username TEXT DEFAULT '',
  display_name TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  description TEXT DEFAULT '',
  hashtags JSONB DEFAULT '[]',
  music JSONB DEFAULT NULL,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  privacy TEXT DEFAULT 'public'
);

ALTER TABLE videos ADD COLUMN IF NOT EXISTS url TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS duration NUMERIC DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS username TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS display_name TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS hashtags JSONB DEFAULT '[]';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS music JSONB DEFAULT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS comments INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS saves INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE videos ADD COLUMN IF NOT EXISTS privacy TEXT DEFAULT 'public';

CREATE TABLE IF NOT EXISTS live_streams (
  stream_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  display_name TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  is_live BOOLEAN DEFAULT TRUE,
  viewer_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  parent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE comments ADD COLUMN IF NOT EXISTS video_id TEXT DEFAULT '';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT '';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS text TEXT DEFAULT '';
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS likes (
  user_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, video_id)
);

CREATE TABLE IF NOT EXISTS saves (
  user_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, video_id)
);

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  username TEXT DEFAULT '',
  display_name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  username TEXT DEFAULT '',
  display_name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  website TEXT DEFAULT '',
  followers INT DEFAULT 0,
  following INT DEFAULT 0,
  video_count INT DEFAULT 0,
  coins INT DEFAULT 0,
  level INT DEFAULT 1,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'follows' AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE follows ADD PRIMARY KEY (follower_id, following_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN others THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS live_share_inbox (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  recipient_id TEXT NOT NULL,
  sharer_id TEXT NOT NULL,
  stream_key TEXT NOT NULL,
  host_user_id TEXT NOT NULL,
  host_name TEXT DEFAULT '',
  host_avatar TEXT DEFAULT '',
  sharer_name TEXT DEFAULT '',
  sharer_avatar TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (recipient_id, sharer_id, stream_key)
);

CREATE TABLE IF NOT EXISTS battle_creator_buckets (
  host_room_id TEXT NOT NULL,
  battle_id TEXT NOT NULL DEFAULT '',
  slot TEXT NOT NULL,
  creator_user_id TEXT NOT NULL DEFAULT '',
  score BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (host_room_id, slot),
  CONSTRAINT battle_creator_buckets_slot_chk CHECK (slot IN ('host', 'opponent', 'player3', 'player4'))
);

CREATE TABLE IF NOT EXISTS creator_stickers (
  id SERIAL PRIMARY KEY,
  creator_user_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_hearts (
  id SERIAL PRIMARY KEY,
  creator_user_id TEXT NOT NULL,
  member_user_id TEXT NOT NULL,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(creator_user_id, member_user_id, day)
);

CREATE TABLE IF NOT EXISTS gift_logs (
  id SERIAL PRIMARY KEY,
  sender_user_id TEXT NOT NULL,
  creator_user_id TEXT NOT NULL,
  room_id TEXT NOT NULL DEFAULT '',
  gift_id TEXT NOT NULL,
  coins INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elix_notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  action_url TEXT DEFAULT '',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elix_blocked_users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  blocker_user_id TEXT NOT NULL,
  blocked_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_user_id, blocked_user_id)
);

CREATE TABLE IF NOT EXISTS elix_reports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reporter_user_id TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'unknown',
  target_id TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  details TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'elix_blocked_users' AND column_name = 'blocker_id'
  ) THEN
    ALTER TABLE elix_blocked_users RENAME COLUMN blocker_id TO blocker_user_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'elix_reports' AND column_name = 'reporter_id'
  ) THEN
    ALTER TABLE elix_reports RENAME COLUMN reporter_id TO reporter_user_id;
  END IF;
END $$;

ALTER TABLE elix_reports ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE elix_reports ADD COLUMN IF NOT EXISTS target_id TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS elix_gifts (
  gift_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gift_type TEXT NOT NULL DEFAULT 'small',
  coin_cost INTEGER NOT NULL DEFAULT 0,
  animation_url TEXT,
  sfx_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  battle_points INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS elix_coin_packages (
  id TEXT PRIMARY KEY,
  coins INTEGER NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  bonus_coins INTEGER NOT NULL DEFAULT 0,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  product_id TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS elix_analytics_events (
  id SERIAL PRIMARY KEY,
  user_id TEXT,
  event TEXT NOT NULL DEFAULT 'unknown',
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elix_wallet_balances (
  user_id TEXT PRIMARY KEY,
  coin_balance BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT elix_wallet_balance_nn CHECK (coin_balance >= 0)
);

CREATE TABLE IF NOT EXISTS elix_wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  coins_delta INTEGER NOT NULL,
  provider TEXT,
  provider_transaction_id TEXT,
  product_id TEXT,
  gift_id TEXT,
  room_id TEXT,
  client_transaction_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  verification JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elix_promote_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  content_type TEXT,
  content_id TEXT,
  goal TEXT NOT NULL,
  amount_gbp NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elix_membership_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  creator_id TEXT,
  provider TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elix_shop_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_session_id TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  buyer_id TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  amount_gbp NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elix_creator_balances (
  user_id TEXT PRIMARY KEY,
  pending_coins BIGINT NOT NULL DEFAULT 0,
  available_coins BIGINT NOT NULL DEFAULT 0,
  locked_coins BIGINT NOT NULL DEFAULT 0,
  total_earned BIGINT NOT NULL DEFAULT 0,
  total_withdrawn BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elix_creator_earnings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  creator_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  coins INTEGER NOT NULL DEFAULT 0,
  gift_id TEXT,
  room_id TEXT,
  sender_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elix_payout_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  coins_amount BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payout_method_id TEXT,
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS elix_payout_methods (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_moderation_log (
  id SERIAL PRIMARY KEY,
  stream_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  category TEXT,
  severity TEXT,
  action_taken TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_user_id ON videos(user_id);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_videos_privacy_created ON videos(privacy, created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_videos_foryou_public
  ON videos (created_at DESC NULLS LAST)
  WHERE (privacy IS NULL OR privacy <> 'private')
    AND url IS NOT NULL AND btrim(url) <> '';
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_live_streams_is_live ON live_streams(is_live) WHERE is_live = TRUE;
CREATE INDEX IF NOT EXISTS idx_comments_video_id ON comments(video_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_video_id ON likes(video_id);
CREATE INDEX IF NOT EXISTS idx_saves_video_id ON saves(video_id);
CREATE INDEX IF NOT EXISTS idx_battle_creator_buckets_battle_id ON battle_creator_buckets(battle_id);
CREATE INDEX IF NOT EXISTS idx_creator_stickers_user ON creator_stickers(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_daily_hearts_creator_day ON daily_hearts(creator_user_id, day);
CREATE INDEX IF NOT EXISTS idx_gift_logs_creator ON gift_logs(creator_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gift_logs_sender ON gift_logs(sender_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_elix_notifications_user_created ON elix_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_elix_ledger_user_time ON elix_wallet_ledger (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_elix_ledger_iap_provider_txn
  ON elix_wallet_ledger (provider, provider_transaction_id)
  WHERE kind = 'iap_purchase' AND provider IS NOT NULL AND provider_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_elix_creator_earnings_user ON elix_creator_earnings (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_elix_analytics_events_created ON elix_analytics_events(created_at DESC);

ALTER TABLE elix_wallet_ledger DROP CONSTRAINT IF EXISTS elix_ledger_coins_delta_bounds;
ALTER TABLE elix_wallet_ledger ADD CONSTRAINT elix_ledger_coins_delta_bounds
  CHECK (coins_delta >= -50000000 AND coins_delta <= 50000000);

INSERT INTO elix_gifts (gift_id, name, gift_type, coin_cost, animation_url, sfx_url, is_active, battle_points) VALUES
  ('rose', 'Rose', 'small', 1, '/gifts/rose.webm', NULL, TRUE, 1),
  ('heart', 'Heart', 'small', 5, '/gifts/heart.webm', NULL, TRUE, 5),
  ('kiss', 'Kiss', 'small', 10, '/gifts/kiss.webm', NULL, TRUE, 10),
  ('crown', 'Crown', 'big', 50, '/gifts/crown.webm', NULL, TRUE, 1500),
  ('diamond', 'Diamond', 'big', 100, '/gifts/diamond.webm', NULL, TRUE, 300),
  ('rocket', 'Rocket', 'big', 500, '/gifts/rocket.webm', NULL, TRUE, 500),
  ('elix_global_universe', 'Elix Universe', 'universe', 1000, '/gifts/elix_global_universe.webm', NULL, TRUE, 1000000),
  ('elix_live_universe', 'Elix Live', 'universe', 2000, '/gifts/elix_live_universe.webm', NULL, TRUE, 80000),
  ('elix_gold_universe', 'Elix Gold', 'universe', 5000, '/gifts/elix_gold_universe.webm', NULL, TRUE, 120000)
ON CONFLICT (gift_id) DO NOTHING;

INSERT INTO elix_coin_packages (id, coins, price, label, bonus_coins, is_popular, product_id) VALUES
  ('coins_10', 10, 0.05, '10 Coins', 0, FALSE, 'com.elixstarlive.coins_10'),
  ('coins_50', 50, 0.18, '50 Coins', 0, FALSE, 'com.elixstarlive.coins_50'),
  ('coins_100', 100, 0.35, '100 Coins', 0, FALSE, 'com.elixstarlive.coins_100'),
  ('coins_500', 500, 1.75, '500 Coins', 50, FALSE, 'com.elixstarlive.coins_500'),
  ('coins_1000', 1000, 3.5, '1,000 Coins', 100, TRUE, 'com.elixstarlive.coins_1000'),
  ('coins_2000', 2000, 7.0, '2,000 Coins', 200, FALSE, 'com.elixstarlive.coins_2000'),
  ('coins_5000', 5000, 17.5, '5,000 Coins', 500, FALSE, 'com.elixstarlive.coins_5000'),
  ('coins_10000', 10000, 35.0, '10K Coins', 1000, FALSE, 'com.elixstarlive.coins_10000'),
  ('coins_50000', 50000, 175.0, '50K Coins', 5000, FALSE, 'com.elixstarlive.coins_50000'),
  ('coins_100000', 100000, 350.0, '100K Coins', 10000, FALSE, 'com.elixstarlive.coins_100000')
ON CONFLICT (id) DO NOTHING;

COMMIT;
