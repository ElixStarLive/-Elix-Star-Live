-- Creator monetisation foundation: immutable pence ledger, qualified views,
-- reward periods, admin config snapshots. Additive — does not rewrite gift coin wallets.

BEGIN;

-- ── Admin-configurable monetisation settings (current row + audit) ───────────
CREATE TABLE IF NOT EXISTS elix_monetisation_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  gift_creator_pct INT NOT NULL DEFAULT 60 CHECK (gift_creator_pct >= 0 AND gift_creator_pct <= 100),
  gift_platform_pct INT NOT NULL DEFAULT 40 CHECK (gift_platform_pct >= 0 AND gift_platform_pct <= 100),
  gift_settlement_hours INT NOT NULL DEFAULT 72 CHECK (gift_settlement_hours >= 0),
  gift_monetisation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sub_creator_pct INT NOT NULL DEFAULT 60 CHECK (sub_creator_pct >= 0 AND sub_creator_pct <= 100),
  sub_platform_pct INT NOT NULL DEFAULT 40 CHECK (sub_platform_pct >= 0 AND sub_platform_pct <= 100),
  sub_settlement_hours INT NOT NULL DEFAULT 72 CHECK (sub_settlement_hours >= 0),
  sub_monetisation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rewards_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rewards_min_followers INT NOT NULL DEFAULT 8000,
  rewards_min_prev_30d_qualified_views INT NOT NULL DEFAULT 100000,
  rewards_max_pence_per_creator INT NOT NULL DEFAULT 100000, -- £1,000
  rewards_monthly_budget_pence INT NOT NULL DEFAULT 0, -- 0 = unlimited until set
  rewards_min_watch_seconds INT NOT NULL DEFAULT 3,
  rewards_settlement_hours INT NOT NULL DEFAULT 168,
  rewards_auto_approve BOOLEAN NOT NULL DEFAULT FALSE,
  withdraw_min_pence INT NOT NULL DEFAULT 0,
  withdraw_max_pence INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT elix_monetisation_config_gift_split CHECK (gift_creator_pct + gift_platform_pct = 100),
  CONSTRAINT elix_monetisation_config_sub_split CHECK (sub_creator_pct + sub_platform_pct = 100)
);

INSERT INTO elix_monetisation_config (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS elix_monetisation_config_audit (
  id BIGSERIAL PRIMARY KEY,
  config_id TEXT NOT NULL DEFAULT 'default',
  admin_user_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  reason TEXT,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monetisation_config_audit_created
  ON elix_monetisation_config_audit (created_at DESC);

-- ── Immutable financial ledger (GBP pence; never delete rows) ────────────────
CREATE TABLE IF NOT EXISTS elix_financial_ledger (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  external_transaction_id TEXT,
  creator_user_id TEXT,
  payer_user_id TEXT,
  revenue_source TEXT NOT NULL,
  gift_id TEXT,
  subscription_id TEXT,
  promotion_id TEXT,
  reward_period_id TEXT,
  video_id TEXT,
  live_room_id TEXT,
  coin_amount INT NOT NULL DEFAULT 0,
  coin_source TEXT,
  gross_pence INT NOT NULL DEFAULT 0,
  app_store_deduction_pence INT NOT NULL DEFAULT 0,
  tax_deduction_pence INT NOT NULL DEFAULT 0,
  processing_deduction_pence INT NOT NULL DEFAULT 0,
  refund_pence INT NOT NULL DEFAULT 0,
  chargeback_pence INT NOT NULL DEFAULT 0,
  net_revenue_pence INT NOT NULL DEFAULT 0,
  creator_pct INT NOT NULL DEFAULT 0,
  creator_amount_pence INT NOT NULL DEFAULT 0,
  platform_pct INT NOT NULL DEFAULT 0,
  platform_amount_pence INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  exchange_rate_bp INT, -- basis points vs GBP if converted
  pending_at TIMESTAMPTZ,
  available_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  reversal_of_id TEXT REFERENCES elix_financial_ledger(id),
  rule_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT elix_financial_ledger_idempotency UNIQUE (idempotency_key),
  CONSTRAINT elix_financial_ledger_revenue_source_chk CHECK (
    revenue_source IN (
      'PAID_GIFT',
      'CREATOR_SUBSCRIPTION',
      'CREATOR_REWARD',
      'PROMOTE_VIDEO',
      'ADMIN_ADJUSTMENT',
      'REFUND_REVERSAL',
      'CHARGEBACK_REVERSAL',
      'WITHDRAWAL',
      'PAYOUT_FAILURE',
      'PAYOUT_REVERSAL'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_financial_ledger_creator_created
  ON elix_financial_ledger (creator_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_source_created
  ON elix_financial_ledger (revenue_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_external
  ON elix_financial_ledger (external_transaction_id)
  WHERE external_transaction_id IS NOT NULL;

-- Creator GBP wallet (pence) — reconstructible from ledger
CREATE TABLE IF NOT EXISTS elix_creator_wallet_gbp (
  user_id TEXT PRIMARY KEY,
  pending_pence INT NOT NULL DEFAULT 0,
  available_pence INT NOT NULL DEFAULT 0,
  withdrawn_pence INT NOT NULL DEFAULT 0,
  reversed_pence INT NOT NULL DEFAULT 0,
  held_pence INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Qualified reward views (one user = one qualified view per video) ─────────
CREATE TABLE IF NOT EXISTS elix_qualified_video_views (
  video_id TEXT NOT NULL,
  viewer_user_id TEXT NOT NULL,
  creator_user_id TEXT NOT NULL,
  watch_seconds INT NOT NULL DEFAULT 0,
  reward_period_id TEXT,
  first_qualified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (video_id, viewer_user_id),
  CONSTRAINT elix_qualified_video_views_no_self CHECK (viewer_user_id <> creator_user_id)
);

CREATE INDEX IF NOT EXISTS idx_qualified_views_creator_period
  ON elix_qualified_video_views (creator_user_id, reward_period_id, first_qualified_at DESC);
CREATE INDEX IF NOT EXISTS idx_qualified_views_creator_first
  ON elix_qualified_video_views (creator_user_id, first_qualified_at DESC);

CREATE TABLE IF NOT EXISTS elix_video_view_metrics (
  video_id TEXT PRIMARY KEY,
  creator_user_id TEXT NOT NULL,
  total_plays BIGINT NOT NULL DEFAULT 0,
  unique_viewers BIGINT NOT NULL DEFAULT 0,
  qualified_reward_views BIGINT NOT NULL DEFAULT 0,
  repeat_plays BIGINT NOT NULL DEFAULT 0,
  self_views BIGINT NOT NULL DEFAULT 0,
  invalid_views BIGINT NOT NULL DEFAULT 0,
  fraud_rejected_views BIGINT NOT NULL DEFAULT 0,
  qualified_watch_time_seconds BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Creator Rewards periods + milestone results ─────────────────────────────
CREATE TABLE IF NOT EXISTS elix_creator_reward_periods (
  id TEXT PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  rules_snapshot JSONB NOT NULL,
  monthly_budget_pence INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  CONSTRAINT elix_creator_reward_periods_range CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS elix_creator_reward_results (
  id TEXT PRIMARY KEY,
  reward_period_id TEXT NOT NULL REFERENCES elix_creator_reward_periods(id),
  creator_user_id TEXT NOT NULL,
  qualified_views BIGINT NOT NULL DEFAULT 0,
  followers_at_close INT NOT NULL DEFAULT 0,
  eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ineligible_reason TEXT,
  milestone_views BIGINT NOT NULL DEFAULT 0,
  reward_pence INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  fraud_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ledger_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT elix_creator_reward_results_unique UNIQUE (creator_user_id, reward_period_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_reward_results_period
  ON elix_creator_reward_results (reward_period_id, status);

-- Default milestone table (pence) for rule snapshots
CREATE TABLE IF NOT EXISTS elix_creator_reward_milestones (
  config_id TEXT NOT NULL DEFAULT 'default',
  min_qualified_views BIGINT NOT NULL,
  reward_pence INT NOT NULL,
  PRIMARY KEY (config_id, min_qualified_views)
);

INSERT INTO elix_creator_reward_milestones (config_id, min_qualified_views, reward_pence) VALUES
  ('default', 500000, 500),
  ('default', 1000000, 1000),
  ('default', 2500000, 2500),
  ('default', 5000000, 5000),
  ('default', 10000000, 10000),
  ('default', 20000000, 25000),
  ('default', 30000000, 50000),
  ('default', 40000000, 75000),
  ('default', 50000000, 100000)
ON CONFLICT (config_id, min_qualified_views) DO NOTHING;

-- Paid coin lots: FIFO attribution of verified IAP net revenue to gifts (pence).
-- net_pence NULL until store settlement is applied — gifts then skip GBP until settled.
CREATE TABLE IF NOT EXISTS elix_paid_coin_lots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  coins_original INT NOT NULL CHECK (coins_original > 0),
  coins_remaining INT NOT NULL CHECK (coins_remaining >= 0),
  gross_pence INT NOT NULL CHECK (gross_pence >= 0),
  app_store_deduction_pence INT NOT NULL DEFAULT 0,
  tax_deduction_pence INT NOT NULL DEFAULT 0,
  processing_deduction_pence INT NOT NULL DEFAULT 0,
  net_pence INT,
  settlement_status TEXT NOT NULL DEFAULT 'pending_settlement',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  CONSTRAINT elix_paid_coin_lots_provider_txn UNIQUE (provider, provider_transaction_id),
  CONSTRAINT elix_paid_coin_lots_settlement_chk CHECK (
    settlement_status IN ('pending_settlement', 'settled', 'reversed')
  )
);

CREATE INDEX IF NOT EXISTS idx_paid_coin_lots_user_fifo
  ON elix_paid_coin_lots (user_id, created_at ASC)
  WHERE coins_remaining > 0 AND settlement_status = 'settled';

-- Processed store / webhook events (idempotent)
CREATE TABLE IF NOT EXISTS elix_processed_webhook_events (
  webhook_event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elix_processed_purchases (
  external_purchase_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  product_id TEXT,
  user_id TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Withdrawal idempotency / payout-provider uniqueness
CREATE TABLE IF NOT EXISTS elix_creator_withdrawals_gbp (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  creator_user_id TEXT NOT NULL,
  amount_pence INT NOT NULL CHECK (amount_pence > 0),
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL DEFAULT 'pending',
  payout_provider_ref TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  CONSTRAINT elix_creator_withdrawals_gbp_idem UNIQUE (idempotency_key),
  CONSTRAINT elix_creator_withdrawals_gbp_provider_paid UNIQUE (payout_provider_ref)
);

CREATE TABLE IF NOT EXISTS elix_creator_withdrawal_status_history (
  id BIGSERIAL PRIMARY KEY,
  withdrawal_id TEXT NOT NULL REFERENCES elix_creator_withdrawals_gbp(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  admin_user_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Promote tracking extensions (additive columns if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'elix_promote_purchases'
  ) THEN
    ALTER TABLE elix_promote_purchases
      ADD COLUMN IF NOT EXISTS gross_pence INT,
      ADD COLUMN IF NOT EXISTS deduction_pence INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS net_platform_pence INT,
      ADD COLUMN IF NOT EXISTS ledger_id TEXT,
      ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS targeting JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS impressions BIGINT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS unique_viewers BIGINT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS views_gained BIGINT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT 'none';
  END IF;
END $$;

-- One active like per content + user (when likes table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'video_likes'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_video_likes_video_user_unique
      ON video_likes (video_id, user_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

ALTER TABLE elix_creator_earnings
  ADD COLUMN IF NOT EXISTS amount_pence INT,
  ADD COLUMN IF NOT EXISTS ledger_id TEXT,
  ADD COLUMN IF NOT EXISTS rule_snapshot JSONB;

COMMIT;
