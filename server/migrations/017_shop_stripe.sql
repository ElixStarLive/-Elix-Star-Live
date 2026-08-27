-- Add Stripe session tracking to shop orders.
BEGIN;

ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS stripe_session_id TEXT NOT NULL DEFAULT '';

COMMIT;
