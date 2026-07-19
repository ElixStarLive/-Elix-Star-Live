-- The Google Play product ID "coins500" was deleted in Play Console and can never be
-- reused, so the 500-coin package uses "coins500a" instead. Override just that row's
-- product_id (the generic normalize migration would otherwise set it to "coins500").
-- Coin amount, price, and wallet logic are untouched.
BEGIN;

UPDATE elix_coin_packages SET product_id = 'coins500a' WHERE coins = 500;

COMMIT;
