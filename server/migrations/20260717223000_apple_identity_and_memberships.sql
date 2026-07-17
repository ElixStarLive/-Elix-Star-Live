BEGIN;

-- Stable Sign in with Apple account link. Apple can hide/change the relay
-- email, so the provider's immutable `sub` claim is the canonical identity.
ALTER TABLE elix_auth_users
  ADD COLUMN IF NOT EXISTS apple_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_elix_auth_users_apple_sub
  ON elix_auth_users (apple_sub)
  WHERE apple_sub IS NOT NULL;

-- Apple creator-membership entitlements use the same provider-neutral table
-- as Google. This index makes original-transaction reconciliation efficient.
CREATE INDEX IF NOT EXISTS idx_membership_purchases_provider_transaction
  ON elix_membership_purchases (provider, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- Apple cannot create subscription SKUs via API. Track App Store Connect
-- readiness separately from Google Play monetization provisioning.
ALTER TABLE elix_creator_membership_products
  ADD COLUMN IF NOT EXISTS apple_status TEXT,
  ADD COLUMN IF NOT EXISTS apple_detail TEXT,
  ADD COLUMN IF NOT EXISTS apple_activated_at TIMESTAMPTZ;

COMMIT;
