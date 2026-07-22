-- Engagement Phase 1: Promotional Coins, Battle Energy, missions, achievements,
-- daily login, MVP scores. Never mixes with elix_wallet (purchased) or test coins.

CREATE TABLE IF NOT EXISTS promotional_coin_balances (
  user_id TEXT PRIMARY KEY,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_granted BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_granted >= 0),
  lifetime_spent BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promotional_coin_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  amount_delta BIGINT NOT NULL CHECK (amount_delta <> 0),
  balance_before BIGINT NOT NULL CHECK (balance_before >= 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  reason TEXT NOT NULL,
  reference_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'reversed', 'held')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_ledger_user_created
  ON promotional_coin_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS battle_energy_balances (
  user_id TEXT PRIMARY KEY,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  lifetime_spent BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS battle_energy_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  amount_delta BIGINT NOT NULL CHECK (amount_delta <> 0),
  balance_before BIGINT NOT NULL CHECK (balance_before >= 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  reason TEXT NOT NULL,
  reference_id TEXT,
  room_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_energy_ledger_user_created
  ON battle_energy_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS battle_energy_daily_caps (
  user_id TEXT NOT NULL,
  day_key DATE NOT NULL,
  watch_energy BIGINT NOT NULL DEFAULT 0,
  comment_energy BIGINT NOT NULL DEFAULT 0,
  share_energy BIGINT NOT NULL DEFAULT 0,
  invite_energy BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day_key)
);

CREATE TABLE IF NOT EXISTS engagement_missions (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('daily', 'weekly', 'creator', 'special')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  goal_count INTEGER NOT NULL CHECK (goal_count > 0),
  reward_xp INTEGER NOT NULL DEFAULT 0 CHECK (reward_xp >= 0),
  reward_promo_coins INTEGER NOT NULL DEFAULT 0 CHECK (reward_promo_coins >= 0),
  reward_energy INTEGER NOT NULL DEFAULT 0 CHECK (reward_energy >= 0),
  metric_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_mission_progress (
  user_id TEXT NOT NULL,
  mission_id TEXT NOT NULL REFERENCES engagement_missions(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mission_id, period_key)
);

CREATE TABLE IF NOT EXISTS engagement_achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '🏅',
  metric_key TEXT NOT NULL,
  goal_count INTEGER NOT NULL CHECK (goal_count > 0),
  reward_xp INTEGER NOT NULL DEFAULT 0,
  reward_promo_coins INTEGER NOT NULL DEFAULT 0,
  rarity TEXT NOT NULL DEFAULT 'common',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL REFERENCES engagement_achievements(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0,
  unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  unlocked_at TIMESTAMPTZ,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS daily_reward_claims (
  user_id TEXT NOT NULL,
  claim_date DATE NOT NULL,
  streak_day INTEGER NOT NULL CHECK (streak_day BETWEEN 1 AND 7),
  reward_xp INTEGER NOT NULL DEFAULT 0,
  reward_promo_coins INTEGER NOT NULL DEFAULT 0,
  reward_label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, claim_date)
);

CREATE TABLE IF NOT EXISTS daily_reward_config (
  streak_day INTEGER PRIMARY KEY CHECK (streak_day BETWEEN 1 AND 7),
  reward_xp INTEGER NOT NULL DEFAULT 0,
  reward_promo_coins INTEGER NOT NULL DEFAULT 0,
  reward_label TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS mvp_scores (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  room_id TEXT NOT NULL DEFAULT '',
  host_user_id TEXT NOT NULL DEFAULT '',
  points BIGINT NOT NULL DEFAULT 0 CHECK (points >= 0),
  source TEXT NOT NULL DEFAULT 'gift',
  day_key DATE NOT NULL DEFAULT (CURRENT_DATE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mvp_scores_day_points
  ON mvp_scores(day_key, points DESC);
CREATE INDEX IF NOT EXISTS idx_mvp_scores_room
  ON mvp_scores(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mvp_scores_user
  ON mvp_scores(user_id, day_key);

CREATE TABLE IF NOT EXISTS battle_fan_energy (
  room_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('host', 'opponent')),
  energy BIGINT NOT NULL DEFAULT 0 CHECK (energy >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, side)
);

CREATE TABLE IF NOT EXISTS engagement_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO engagement_settings (key, value_json) VALUES
  ('battle_energy_caps', '{"watch_per_battle":300,"comment_per_battle":20,"share_per_day":20,"watch_per_minute":5,"comment":2,"share":20}'::jsonb),
  ('fan_energy_boost', '{"threshold":10000,"multiplier":1.2,"duration_sec":5}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO daily_reward_config (streak_day, reward_xp, reward_promo_coins, reward_label) VALUES
  (1, 100, 0, '100 XP'),
  (2, 200, 0, '200 XP'),
  (3, 0, 0, 'Gift coupon'),
  (4, 0, 500, '500 Promotional Coins'),
  (5, 0, 0, 'Temporary profile frame'),
  (6, 1000, 0, '1,000 XP'),
  (7, 500, 1000, 'Mystery reward')
ON CONFLICT (streak_day) DO NOTHING;

INSERT INTO engagement_missions (id, scope, title, description, goal_count, reward_xp, reward_promo_coins, reward_energy, metric_key, sort_order) VALUES
  ('daily_watch_10', 'daily', 'Watch LIVE for 10 minutes', 'Stay in any LIVE for 10 minutes', 10, 50, 100, 20, 'watch_minutes', 1),
  ('daily_join_battle', 'daily', 'Join one battle', 'Enter a battle room as a spectator', 1, 40, 50, 10, 'battles_joined', 2),
  ('daily_comments_3', 'daily', 'Send three comments', 'Chat three times in LIVE', 3, 30, 50, 6, 'comments', 3),
  ('daily_share_1', 'daily', 'Share one LIVE', 'Share a LIVE stream once', 1, 40, 75, 20, 'shares', 4),
  ('daily_energy_boost', 'daily', 'Support with Battle Energy', 'Spend Battle Energy to boost a creator', 1, 50, 100, 0, 'energy_boosts', 5),
  ('weekly_watch_5_creators', 'weekly', 'Watch five different creators', 'Visit 5 unique LIVE creators', 5, 200, 500, 50, 'unique_creators', 1),
  ('weekly_battles_10', 'weekly', 'Join ten battles', 'Spectate 10 battles this week', 10, 250, 750, 80, 'battles_joined', 2),
  ('weekly_streak_5', 'weekly', 'Maintain a five-day streak', 'Claim daily reward 5 days in a row', 5, 300, 1000, 100, 'login_streak_days', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO engagement_achievements (id, name, description, icon, metric_key, goal_count, reward_xp, reward_promo_coins, rarity) VALUES
  ('first_gift', 'First Gift', 'Send your first gift', '🎁', 'gifts_sent', 1, 50, 100, 'common'),
  ('first_battle', 'First Battle', 'Join your first battle', '⚔️', 'battles_joined', 1, 50, 100, 'common'),
  ('watch_100', '100 LIVE Sessions Watched', 'Watch 100 LIVE sessions', '📺', 'lives_watched', 100, 500, 1000, 'rare'),
  ('streak_7', 'Seven-Day Streak', 'Claim daily rewards 7 days in a row', '🔥', 'login_streak_days', 7, 300, 500, 'rare'),
  ('mvp_top10', 'Top 10 MVP', 'Reach top 10 on an MVP board', '👑', 'mvp_top10', 1, 400, 750, 'epic'),
  ('energy_master', 'Battle Energy Master', 'Spend 5,000 Battle Energy', '⚡', 'energy_spent', 5000, 400, 500, 'epic')
ON CONFLICT (id) DO NOTHING;
