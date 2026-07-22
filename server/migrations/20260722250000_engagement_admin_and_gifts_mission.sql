-- Additive: gifts_sent mission seed + admin audit table for engagement config.
-- Non-destructive. Safe to re-run.

INSERT INTO engagement_missions (
  id, scope, title, description, goal_count,
  reward_xp, reward_promo_coins, reward_energy, metric_key, enabled, sort_order
) VALUES (
  'daily_send_gifts',
  'daily',
  'Send 10 gifts',
  'Send gifts during LIVE today',
  10,
  50,
  5,
  0,
  'gifts_sent',
  TRUE,
  15
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS engagement_admin_audit (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_admin_audit_created
  ON engagement_admin_audit (created_at DESC);

-- Ensure battle energy caps key exists with code-aligned defaults.
INSERT INTO engagement_settings (key, value_json)
VALUES (
  'battle_energy_caps',
  '{"watch_amount":5,"comment_amount":2,"share_amount":20,"watch_cap":300,"comment_cap":20,"share_cap":1}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
