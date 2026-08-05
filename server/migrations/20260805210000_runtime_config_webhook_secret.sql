-- Runtime config for production ops values that must sync without Coolify UI access.
-- Used for STRIPE_WEBHOOK_SECRET_TEST fallback when env var is unset on the host.
CREATE TABLE IF NOT EXISTS elix_runtime_config (
  key TEXT PRIMARY KEY,
  value_ciphertext TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

COMMENT ON TABLE elix_runtime_config IS
  'Non-UI runtime config. Webhook secrets fall back here when Coolify env is missing.';
