BEGIN;

-- Tracks Google Play monetization provisioning for dynamic creator
-- subscription products (elix.creator.<hash> + base plan "monthly").
CREATE TABLE IF NOT EXISTS elix_creator_membership_products (
  creator_id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL UNIQUE,
  base_plan_id TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending | active | error
  play_state TEXT,
  last_error TEXT,
  price_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_creator_membership_products_status
  ON elix_creator_membership_products (status, updated_at DESC);

COMMIT;
