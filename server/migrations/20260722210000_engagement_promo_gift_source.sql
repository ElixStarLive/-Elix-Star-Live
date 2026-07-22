-- Allow promotional_coins on elix_gift_transactions (Phase 1 promo gifts).
-- Promo gifts never create Diamonds; gift_source is the money gate.

ALTER TABLE elix_gift_transactions
  DROP CONSTRAINT IF EXISTS elix_gift_transactions_gift_source_check;

ALTER TABLE elix_gift_transactions
  ADD CONSTRAINT elix_gift_transactions_gift_source_check
  CHECK (gift_source IN ('starter_coins', 'paid_coins', 'promotional_coins'));
