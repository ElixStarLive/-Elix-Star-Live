-- Align coin package product IDs with the Google Play / App Store product IDs
-- that are actually configured in the store consoles (no "com." prefix).
-- Only the mapping key changes; coin amounts, prices, and wallet logic are untouched.
UPDATE elix_coin_packages
SET product_id = REPLACE(product_id, 'com.elixstarlive.coins_', 'elixstarlive.coins_')
WHERE product_id LIKE 'com.elixstarlive.coins\_%';
