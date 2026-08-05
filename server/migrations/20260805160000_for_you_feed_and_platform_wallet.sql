-- For You ranking lifecycle + admin config + platform GBP wallet for reconciliation.
-- Defaults: promote at 5000 qualified unique views; re-entry after 1000 post-removal.

CREATE TABLE IF NOT EXISTS elix_foryou_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  initial_audience_size INT NOT NULL DEFAULT 500,
  promotion_qualified_views INT NOT NULL DEFAULT 5000,
  removal_window_hours INT NOT NULL DEFAULT 168,
  reentry_additional_qualified_views INT NOT NULL DEFAULT 1000,
  max_recommendation_cycles INT NOT NULL DEFAULT 5,
  freshness_window_hours INT NOT NULL DEFAULT 72,
  fraud_sensitivity INT NOT NULL DEFAULT 50,
  weight_qualified_views NUMERIC(8,4) NOT NULL DEFAULT 1.0,
  weight_watch_time NUMERIC(8,4) NOT NULL DEFAULT 1.2,
  weight_completion NUMERIC(8,4) NOT NULL DEFAULT 1.5,
  weight_rewatches NUMERIC(8,4) NOT NULL DEFAULT 0.8,
  weight_shares NUMERIC(8,4) NOT NULL DEFAULT 2.0,
  weight_saves NUMERIC(8,4) NOT NULL DEFAULT 1.8,
  weight_comments NUMERIC(8,4) NOT NULL DEFAULT 1.4,
  weight_likes NUMERIC(8,4) NOT NULL DEFAULT 1.0,
  weight_follows NUMERIC(8,4) NOT NULL DEFAULT 2.5,
  weight_profile_visits NUMERIC(8,4) NOT NULL DEFAULT 1.6,
  weight_report_rate NUMERIC(8,4) NOT NULL DEFAULT -5.0,
  weight_not_interested NUMERIC(8,4) NOT NULL DEFAULT -4.0,
  weight_retention NUMERIC(8,4) NOT NULL DEFAULT 1.3,
  weight_freshness NUMERIC(8,4) NOT NULL DEFAULT 1.1,
  weight_creator_quality NUMERIC(8,4) NOT NULL DEFAULT 1.0,
  weight_guidelines NUMERIC(8,4) NOT NULL DEFAULT -10.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO elix_foryou_config (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- Lifecycle stages for organic For You distribution (not paid Promote IAP).
CREATE TABLE IF NOT EXISTS elix_video_foryou_state (
  video_id TEXT PRIMARY KEY,
  creator_user_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'initial'
    CHECK (stage IN ('initial', 'promoted', 'removed', 'reentry_eligible', 'reentered', 'exhausted')),
  cycle_count INT NOT NULL DEFAULT 1,
  qualified_unique_views INT NOT NULL DEFAULT 0,
  qualified_at_removal INT NOT NULL DEFAULT 0,
  qualified_since_removal INT NOT NULL DEFAULT 0,
  ranking_score NUMERIC(18,6) NOT NULL DEFAULT 0,
  initial_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promoted_at TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  reentry_at TIMESTAMPTZ,
  last_scored_at TIMESTAMPTZ,
  guidelines_ok BOOLEAN NOT NULL DEFAULT TRUE,
  creator_quality_score NUMERIC(10,4) NOT NULL DEFAULT 1.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foryou_state_stage_score
  ON elix_video_foryou_state (stage, ranking_score DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_foryou_state_creator
  ON elix_video_foryou_state (creator_user_id);

CREATE TABLE IF NOT EXISTS elix_video_not_interested (
  video_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (video_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_not_interested_user
  ON elix_video_not_interested (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS elix_video_feed_signals (
  video_id TEXT PRIMARY KEY,
  watch_time_seconds BIGINT NOT NULL DEFAULT 0,
  completions BIGINT NOT NULL DEFAULT 0,
  rewatches_unique BIGINT NOT NULL DEFAULT 0,
  follows_generated BIGINT NOT NULL DEFAULT 0,
  profile_visits_generated BIGINT NOT NULL DEFAULT 0,
  report_count BIGINT NOT NULL DEFAULT 0,
  not_interested_count BIGINT NOT NULL DEFAULT 0,
  retention_score NUMERIC(10,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform GBP books for reconciliation (report-only; no silent repair).
CREATE TABLE IF NOT EXISTS elix_platform_wallet_gbp (
  id TEXT PRIMARY KEY DEFAULT 'default',
  available_pence BIGINT NOT NULL DEFAULT 0,
  pending_pence BIGINT NOT NULL DEFAULT 0,
  reversed_pence BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO elix_platform_wallet_gbp (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- Backfill platform books from existing ledger (report baseline; future posts increment).
UPDATE elix_platform_wallet_gbp SET
  available_pence = COALESCE((
    SELECT COALESCE(SUM(CASE
      WHEN revenue_source IN ('PAID_GIFT','CREATOR_SUBSCRIPTION','PROMOTE_VIDEO')
           AND reversal_of_id IS NULL
           AND status IN ('available','paid')
      THEN platform_amount_pence ELSE 0 END),0)
      + COALESCE(SUM(CASE
      WHEN revenue_source IN ('PAID_GIFT','CREATOR_SUBSCRIPTION','PROMOTE_VIDEO')
           AND reversal_of_id IS NULL
           AND status IN ('pending','awaiting_settlement','held')
      THEN 0 ELSE 0 END),0)
    FROM elix_financial_ledger
  ), 0),
  pending_pence = COALESCE((
    SELECT COALESCE(SUM(CASE
      WHEN revenue_source IN ('PAID_GIFT','CREATOR_SUBSCRIPTION','PROMOTE_VIDEO')
           AND reversal_of_id IS NULL
           AND status IN ('pending','awaiting_settlement','held')
      THEN platform_amount_pence ELSE 0 END),0)
    FROM elix_financial_ledger
  ), 0),
  reversed_pence = COALESCE((
    SELECT COALESCE(SUM(CASE
      WHEN revenue_source IN ('REFUND_REVERSAL','CHARGEBACK_REVERSAL')
      THEN ABS(LEAST(platform_amount_pence,0)) ELSE 0 END),0)
    FROM elix_financial_ledger
  ), 0),
  updated_at = NOW()
WHERE id = 'default';

-- Backfill public videos into initial For You distribution.
INSERT INTO elix_video_foryou_state (video_id, creator_user_id, stage, cycle_count)
SELECT v.id, v.user_id, 'initial', 1
  FROM videos v
 WHERE (v.privacy IS NULL OR v.privacy <> 'private')
   AND v.url IS NOT NULL AND btrim(v.url) <> ''
   AND v.url NOT ILIKE '%/stories/%'
ON CONFLICT (video_id) DO NOTHING;
