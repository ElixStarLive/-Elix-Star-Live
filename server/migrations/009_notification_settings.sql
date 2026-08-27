-- PAGE-059: per-user notification preferences.
BEGIN;

CREATE TABLE IF NOT EXISTS user_notification_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  likes_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  comments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  follows_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  live_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER user_notification_settings_set_updated_at
  BEFORE UPDATE ON user_notification_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
