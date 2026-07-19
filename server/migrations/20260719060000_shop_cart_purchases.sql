-- Basket checkout: one Stripe session can now contain several shop items. The
-- purchases table was unique per session (one item per session), so record each
-- item with a composite unique on (stripe_session_id, item_id). Existing rows are
-- unaffected (each old session appears once). No data is deleted.
BEGIN;

-- Drop the single-column UNIQUE on stripe_session_id (whatever its name is) so a
-- session can carry multiple item rows.
DO $$
DECLARE cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  WHERE con.conrelid = 'elix_shop_purchases'::regclass
    AND con.contype = 'u'
    AND array_length(con.conkey, 1) = 1
    AND con.conkey[1] = (
      SELECT att.attnum FROM pg_attribute att
      WHERE att.attrelid = 'elix_shop_purchases'::regclass
        AND att.attname = 'stripe_session_id'
    );
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE elix_shop_purchases DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- Add the composite unique used by the webhook's idempotent INSERT ... ON CONFLICT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'elix_shop_purchases_session_item_key'
  ) THEN
    ALTER TABLE elix_shop_purchases
      ADD CONSTRAINT elix_shop_purchases_session_item_key UNIQUE (stripe_session_id, item_id);
  END IF;
END $$;

COMMIT;
