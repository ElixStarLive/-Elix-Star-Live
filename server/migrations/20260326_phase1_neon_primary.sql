BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS shop_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  category TEXT DEFAULT 'other',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shop_items_active_created
  ON shop_items(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shop_items_user_created
  ON shop_items(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user1_id TEXT NOT NULL,
  user2_id TEXT NOT NULL,
  last_message TEXT DEFAULT '',
  last_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_chat_threads_user1_last
  ON chat_threads(user1_id, last_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_threads_user2_last
  ON chat_threads(user2_id, last_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread_created
  ON messages(thread_id, created_at ASC);

COMMIT;

-- Rollback plan (manual, only if not yet in use):
-- DROP TABLE IF EXISTS messages;
-- DROP TABLE IF EXISTS chat_threads;
-- DROP TABLE IF EXISTS shop_items;
