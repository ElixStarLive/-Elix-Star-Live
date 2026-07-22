-- Engagement E2E completion: unique creators + creator collection progress.
-- Also backfill day 3/5 daily rewards so claims always grant real Promo/XP
-- (cosmetic labels kept; no Diamonds).

CREATE TABLE IF NOT EXISTS user_engagement_unique_creators (
  user_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, creator_id, period_key)
);
CREATE INDEX IF NOT EXISTS idx_eng_unique_creators_user_period
  ON user_engagement_unique_creators(user_id, period_key);

CREATE TABLE IF NOT EXISTS user_creator_collection_progress (
  user_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  watch_minutes INTEGER NOT NULL DEFAULT 0 CHECK (watch_minutes >= 0),
  gifts_count INTEGER NOT NULL DEFAULT 0 CHECK (gifts_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, creator_id)
);
CREATE INDEX IF NOT EXISTS idx_creator_collection_progress_user
  ON user_creator_collection_progress(user_id, updated_at DESC);

UPDATE daily_reward_config
   SET reward_xp = 150, reward_promo_coins = 200, reward_label = 'Gift coupon + 150 XP + 200 Promo'
 WHERE streak_day = 3 AND reward_xp = 0 AND reward_promo_coins = 0;

UPDATE daily_reward_config
   SET reward_xp = 100, reward_promo_coins = 300, reward_label = 'Profile frame + 100 XP + 300 Promo'
 WHERE streak_day = 5 AND reward_xp = 0 AND reward_promo_coins = 0;
