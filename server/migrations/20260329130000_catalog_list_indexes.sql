-- Catalog and list endpoints: align indexes with ORDER BY / filters (avoid seq scans under load).
BEGIN;

CREATE INDEX IF NOT EXISTS idx_elix_gifts_active_coin_cost
  ON elix_gifts (is_active, coin_cost ASC)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_elix_coin_packages_coins
  ON elix_coin_packages (coins ASC);

COMMIT;
