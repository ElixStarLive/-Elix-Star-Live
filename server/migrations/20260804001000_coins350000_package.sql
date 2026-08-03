-- High-tier iOS coin pack (~£1199 App Store tier).
BEGIN;

INSERT INTO elix_coin_packages (id, coins, price, label, bonus_coins, is_popular, product_id)
VALUES ('coins_350000', 350000, 1199.0, '350K Coins', 35000, FALSE, 'coins350000')
ON CONFLICT (id) DO UPDATE
SET coins = EXCLUDED.coins,
    price = EXCLUDED.price,
    label = EXCLUDED.label,
    bonus_coins = EXCLUDED.bonus_coins,
    product_id = EXCLUDED.product_id;

COMMIT;
