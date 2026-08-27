-- PAGE-048–049: inbox messages and alert tables.
BEGIN;

CREATE TABLE IF NOT EXISTS message_threads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
});

CREATE TABLE IF NOT EXISTS thread_participants (
  thread_id TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_participants_user ON thread_participants(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  thread_id TEXT NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_alerts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  reference_id TEXT,
  reference_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_alerts_user ON user_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_alerts_unread ON user_alerts(user_id, is_read) WHERE is_read = FALSE;

COMMIT;
