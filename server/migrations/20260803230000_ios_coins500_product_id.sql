-- iOS App Store uses product id "coins500". Android Play keeps "coins500a".
-- Add an alias package row so Apple IAP verification can credit 500 coins.
BEGIN;

INSERT INTO elix_coin_packages (id, coins, price, label, bonus_coins, is_popular, product_id)
VALUES ('coins_500_ios', 500, 1.75, '500 Coins', 50, FALSE, 'coins500')
ON CONFLICT (id) DO UPDATE
SET coins = EXCLUDED.coins,
    product_id = EXCLUDED.product_id,
    label = EXCLUDED.label;

COMMIT;
