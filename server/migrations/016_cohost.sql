-- PAGE-040: live co-host support.
BEGIN;

ALTER TABLE live_streams ADD COLUMN IF NOT EXISTS cohost_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_live_streams_cohost ON live_streams(cohost_id);

COMMIT;
