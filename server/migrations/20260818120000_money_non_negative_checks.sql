-- Non-negative guarantees for the GBP wallets and the coin-denominated creator
-- balances.
--
-- Withdrawals (`amount_pence > 0`) and paid coin lots (`coins_remaining >= 0`)
-- already carry these checks; the two GBP wallet tables and
-- elix_creator_balances carried none, so a balance column could only be kept
-- non-negative by whichever query happened to touch it. Every debit path today
-- either clamps with GREATEST or reads FOR UPDATE first, which is why no row is
-- negative in production — this makes that a property of the schema instead of
-- a property of the current call sites.
--
-- Constraint names are dropped first so re-running the file is safe.

ALTER TABLE elix_creator_wallet_gbp
  DROP CONSTRAINT IF EXISTS elix_creator_wallet_gbp_non_negative;
ALTER TABLE elix_creator_wallet_gbp
  ADD CONSTRAINT elix_creator_wallet_gbp_non_negative CHECK (
    pending_pence >= 0
    AND available_pence >= 0
    AND withdrawn_pence >= 0
    AND reversed_pence >= 0
    AND held_pence >= 0
    AND recoverable_pence >= 0
  );

ALTER TABLE elix_platform_wallet_gbp
  DROP CONSTRAINT IF EXISTS elix_platform_wallet_gbp_non_negative;
ALTER TABLE elix_platform_wallet_gbp
  ADD CONSTRAINT elix_platform_wallet_gbp_non_negative CHECK (
    pending_pence >= 0
    AND available_pence >= 0
    AND reversed_pence >= 0
    AND recoverable_pence >= 0
  );

ALTER TABLE elix_creator_balances
  DROP CONSTRAINT IF EXISTS elix_creator_balances_non_negative;
ALTER TABLE elix_creator_balances
  ADD CONSTRAINT elix_creator_balances_non_negative CHECK (
    pending_coins >= 0
    AND available_coins >= 0
    AND locked_coins >= 0
    AND total_earned >= 0
    AND total_withdrawn >= 0
  );
