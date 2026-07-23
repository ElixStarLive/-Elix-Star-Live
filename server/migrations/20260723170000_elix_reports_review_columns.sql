-- Report review metadata used by admin report resolution.
-- Previously added via runtime ALTER on every admin request — move to migrate.

ALTER TABLE elix_reports
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

ALTER TABLE elix_reports
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

ALTER TABLE elix_reports
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_elix_reports_status_created
  ON elix_reports (status, created_at DESC);
