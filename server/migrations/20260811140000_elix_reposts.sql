-- Profile → Reposts: durable user-owned reposts (Live first; video-capable).
-- Unique (user_id, target_type, target_id) prevents duplicate taps creating duplicate rows.

CREATE TABLE IF NOT EXISTS elix_reposts (
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, target_type, target_id),
  CONSTRAINT elix_reposts_target_type_chk CHECK (target_type IN ('live', 'video'))
);

CREATE INDEX IF NOT EXISTS idx_elix_reposts_user_created
  ON elix_reposts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_elix_reposts_target
  ON elix_reposts (target_type, target_id);
