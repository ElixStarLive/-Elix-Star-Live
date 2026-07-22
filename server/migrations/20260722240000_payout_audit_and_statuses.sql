-- Additive: payout admin identity, audit trail, expanded manual statuses.
-- Non-destructive. Safe to re-run (IF NOT EXISTS / IF NOT EXISTS columns).

ALTER TABLE elix_payout_requests
  ADD COLUMN IF NOT EXISTS processed_by TEXT;

ALTER TABLE elix_payout_requests
  ADD COLUMN IF NOT EXISTS previous_status TEXT;

-- Status vocabulary (app-enforced):
-- pending | under_review | approved | paid_manually | rejected | cancelled

CREATE TABLE IF NOT EXISTS elix_payout_audit (
  id BIGSERIAL PRIMARY KEY,
  payout_request_id TEXT NOT NULL,
  admin_user_id TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_elix_payout_audit_request
  ON elix_payout_audit (payout_request_id);

CREATE INDEX IF NOT EXISTS idx_elix_payout_audit_created
  ON elix_payout_audit (created_at DESC);
