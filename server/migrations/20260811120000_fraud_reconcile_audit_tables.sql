-- Tables previously invented via request-path CREATE TABLE IF NOT EXISTS.
-- Schema must come from migrate only.

BEGIN;

CREATE TABLE IF NOT EXISTS elix_fraud_decisions (
  id BIGSERIAL PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  user_id TEXT,
  reason_code TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_decisions_subject
  ON elix_fraud_decisions (subject_type, subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fraud_decisions_user
  ON elix_fraud_decisions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS elix_reconciliation_runs (
  id BIGSERIAL PRIMARY KEY,
  status TEXT NOT NULL,
  mismatch_count INT NOT NULL DEFAULT 0,
  mismatches JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_created
  ON elix_reconciliation_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS elix_test_coin_issue_audit (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  origin TEXT NOT NULL DEFAULT 'test_coins',
  outcome TEXT NOT NULL,
  reason TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
