-- Normalize store product IDs to a plain alphanumeric form ("coins<amount>", e.g.
-- coins100, coins500 ... coins200000) with no dots, underscores, or hyphens, so the
-- value is valid in every Google Play / App Store product-ID field and matches the
-- app's IAP_PRODUCTS keys exactly. Only the product_id mapping changes; coin amounts,
-- prices, and wallet logic are untouched.
BEGIN;

-- Ensure the high tiers exist before normalizing (idempotent).
INSERT INTO elix_coin_packages (id, coins, price, label, bonus_coins, is_popular, product_id) VALUES
  ('coins_150000', 150000, 525.0, '150K Coins', 15000, FALSE, 'coins150000'),
  ('coins_200000', 200000, 700.0, '200K Coins', 20000, FALSE, 'coins200000')
ON CONFLICT (id) DO NOTHING;

UPDATE elix_coin_packages SET product_id = 'coins' || coins::text;

COMMIT;
