-- PAGE-061: coin packages and purchases.
BEGIN;

CREATE TABLE IF NOT EXISTS coin_packages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  platform TEXT NOT NULL DEFAULT 'iap',
  name TEXT NOT NULL,
  coins INTEGER NOT NULL,
  price_gbp NUMERIC(12, 2) NOT NULL,
  product_id TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coin_purchases (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id TEXT REFERENCES coin_packages(id) ON DELETE SET NULL,
  platform TEXT NOT NULL DEFAULT 'iap',
  platform_product_id TEXT NOT NULL DEFAULT '',
  receipt_token TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  coins INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coin_packages_active ON coin_packages(platform, is_active);
CREATE INDEX IF NOT EXISTS idx_coin_purchases_user ON coin_purchases(user_id);

COMMIT;
