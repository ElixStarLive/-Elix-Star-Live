-- What registration creates beyond the account itself: the recorded consent,
-- and the starter balance a new account opens with.

-- Proof that a person accepted a specific version of the terms at a specific
-- time. Versioned rather than a boolean flag, because "did they agree" is not
-- answerable later unless it records *what* they agreed to.
CREATE TABLE user_consents (
  user_id               uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  consent_type          text        NOT NULL,
  version               text        NOT NULL,
  age_confirmed_13_plus boolean     NOT NULL,
  accepted_at           timestamptz NOT NULL DEFAULT now(),
  -- Retained as evidence of the acceptance, not for tracking.
  ip_address            inet,
  user_agent            text        NOT NULL DEFAULT '',

  PRIMARY KEY (user_id, consent_type, version)
);

-- Starter coins are a promotional balance with a real monetary value of zero.
-- They are held in their own tables, never mixed into a wallet that holds
-- purchased coins, so a starter balance can never be spent as, converted into,
-- or paid out as money. Anything derived from these tables must settle at £0.
CREATE TABLE starter_coin_balances (
  user_id          uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  balance          bigint      NOT NULL,
  lifetime_granted bigint      NOT NULL,
  lifetime_spent   bigint      NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- A balance cannot go negative, whatever a caller believes it computed.
  CONSTRAINT starter_balance_non_negative  CHECK (balance >= 0),
  CONSTRAINT starter_granted_non_negative  CHECK (lifetime_granted >= 0),
  CONSTRAINT starter_spent_non_negative    CHECK (lifetime_spent >= 0),
  -- The balance must always be explainable by what was granted and spent.
  CONSTRAINT starter_balance_reconciles    CHECK (balance = lifetime_granted - lifetime_spent)
);

CREATE TABLE starter_coin_transactions (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind           text        NOT NULL,
  amount_delta   bigint      NOT NULL,
  balance_after  bigint      NOT NULL,
  -- Makes every write replay-safe: a retried request collides here instead of
  -- granting or spending twice.
  idempotency_key text       NOT NULL UNIQUE,
  reason         text        NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT starter_tx_kind          CHECK (kind IN ('onboarding_grant', 'gift_debit', 'admin_adjustment')),
  CONSTRAINT starter_tx_after_valid   CHECK (balance_after >= 0),
  -- A grant adds, a debit subtracts. Encoded so a sign error cannot be stored.
  CONSTRAINT starter_tx_sign_matches  CHECK (
    (kind = 'onboarding_grant' AND amount_delta > 0) OR
    (kind = 'gift_debit'       AND amount_delta < 0) OR
    (kind = 'admin_adjustment')
  )
);

CREATE INDEX starter_coin_transactions_user_idx
  ON starter_coin_transactions (user_id, created_at DESC);

CREATE TABLE user_progression (
  user_id       uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  total_xp      bigint      NOT NULL DEFAULT 0,
  current_level integer     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT progression_xp_non_negative    CHECK (total_xp >= 0),
  CONSTRAINT progression_level_non_negative CHECK (current_level >= 0)
);

CREATE TRIGGER starter_coin_balances_set_updated_at
  BEFORE UPDATE ON starter_coin_balances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER user_progression_set_updated_at
  BEFORE UPDATE ON user_progression
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
