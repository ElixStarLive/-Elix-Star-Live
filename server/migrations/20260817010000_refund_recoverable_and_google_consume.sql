-- Recoverable creator GBP debt when a store refund cannot claw withdrawn funds.
-- Google Play consume retry state after durable IAP credit.

ALTER TABLE elix_creator_wallet_gbp
  ADD COLUMN IF NOT EXISTS recoverable_pence INT NOT NULL DEFAULT 0;

ALTER TABLE elix_platform_wallet_gbp
  ADD COLUMN IF NOT EXISTS recoverable_pence INT NOT NULL DEFAULT 0;

ALTER TABLE elix_processed_purchases
  ADD COLUMN IF NOT EXISTS google_purchase_token TEXT,
  ADD COLUMN IF NOT EXISTS google_consumed_at TIMESTAMPTZ;
