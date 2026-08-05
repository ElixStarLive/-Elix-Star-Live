-- Payout-provider accounts, financial-report ingest, fraud review (additive).
BEGIN;

CREATE TABLE IF NOT EXISTS elix_creator_payout_accounts (
  id TEXT PRIMARY KEY,
  creator_user_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'stripe_connect',
  provider_account_id TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN (
      'pending', 'restricted', 'verified', 'rejected', 'disabled'
    )),
  details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_url TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT elix_creator_payout_accounts_provider_acct UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS elix_payout_provider_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  withdrawal_id TEXT,
  provider_ref TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT elix_payout_provider_events_uniq UNIQUE (provider, event_id)
);

ALTER TABLE elix_creator_withdrawals_gbp
  ADD COLUMN IF NOT EXISTS payment_rail TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS provider_fee_pence INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_status TEXT,
  ADD COLUMN IF NOT EXISTS manual_exception BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_exception_note TEXT,
  ADD COLUMN IF NOT EXISTS payout_account_id TEXT;

CREATE TABLE IF NOT EXISTS elix_store_financial_reports (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL CHECK (store IN ('apple', 'google')),
  report_type TEXT NOT NULL,
  report_period TEXT,
  source_filename TEXT,
  import_hash TEXT NOT NULL,
  imported_by TEXT,
  line_count INT NOT NULL DEFAULT 0,
  matched_count INT NOT NULL DEFAULT 0,
  unmatched_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT elix_store_financial_reports_hash UNIQUE (import_hash)
);

CREATE TABLE IF NOT EXISTS elix_store_financial_report_lines (
  id BIGSERIAL PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES elix_store_financial_reports(id) ON DELETE CASCADE,
  line_key TEXT NOT NULL,
  external_transaction_id TEXT,
  product_id TEXT,
  currency TEXT,
  gross_pence INT NOT NULL DEFAULT 0,
  tax_pence INT NOT NULL DEFAULT 0,
  commission_pence INT NOT NULL DEFAULT 0,
  net_proceeds_pence INT NOT NULL DEFAULT 0,
  quantity INT DEFAULT 1,
  matched_purchase_id TEXT,
  match_status TEXT NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched', 'matched', 'adjusted', 'ignored')),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT elix_store_fin_line_key UNIQUE (report_id, line_key)
);

CREATE INDEX IF NOT EXISTS idx_store_fin_lines_ext
  ON elix_store_financial_report_lines (external_transaction_id);
CREATE INDEX IF NOT EXISTS idx_store_fin_lines_match
  ON elix_store_financial_report_lines (match_status);

CREATE TABLE IF NOT EXISTS elix_fraud_reviews (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'under_review', 'cleared', 'confirmed_fraud', 'appealed')),
  reviewer_user_id TEXT,
  outcome_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_reviews_user
  ON elix_fraud_reviews (user_id, status, created_at DESC);

COMMIT;
