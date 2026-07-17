BEGIN;

-- Creator-specific Google Play subscription entitlements.
-- Additive-only: legacy rows in elix_membership_purchases keep NULLs in the
-- new columns and remain untouched. Raw purchase tokens are never stored —
-- only sha256 hex hashes (purchase_token_hash / linked_purchase_token_hash).
ALTER TABLE elix_membership_purchases
  ADD COLUMN IF NOT EXISTS product_id TEXT,
  ADD COLUMN IF NOT EXISTS base_plan_id TEXT,
  ADD COLUMN IF NOT EXISTS purchase_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS subscription_state TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_renew_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS acknowledgement_state TEXT,
  ADD COLUMN IF NOT EXISTS latest_order_id TEXT,
  ADD COLUMN IF NOT EXISTS linked_purchase_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS verification JSONB,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- One entitlement row per purchase token; partial so legacy rows (NULL hash)
-- are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_purchases_token_hash
  ON elix_membership_purchases (purchase_token_hash)
  WHERE purchase_token_hash IS NOT NULL;

-- Entitlement lookup: viewer + creator, filtered by state and expiry.
CREATE INDEX IF NOT EXISTS idx_membership_purchases_entitlement
  ON elix_membership_purchases (user_id, creator_id, subscription_state, expires_at DESC)
  WHERE purchase_token_hash IS NOT NULL;

COMMIT;
