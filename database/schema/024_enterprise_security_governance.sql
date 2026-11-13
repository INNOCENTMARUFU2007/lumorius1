ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deletion_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS deletion_failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS deletion_completed_at TIMESTAMPTZ;

UPDATE users
SET deletion_status = 'requested'
WHERE deletion_scheduled_at IS NOT NULL
  AND deletion_status = 'none';

DO $$
BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_deletion_status_check
    CHECK (deletion_status IN ('none', 'requested', 'processing', 'failed', 'completed', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_deletion_status_due
  ON users (deletion_status, deletion_scheduled_at)
  WHERE deletion_scheduled_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS organization_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  organization_name_snapshot TEXT NOT NULL,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'processing', 'completed', 'failed', 'cancelled')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ,
  failure_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_deletion_requests_one_pending
  ON organization_deletion_requests (organization_id)
  WHERE organization_id IS NOT NULL
    AND status IN ('requested', 'processing');
CREATE INDEX IF NOT EXISTS idx_org_deletion_requests_due
  ON organization_deletion_requests (scheduled_at)
  WHERE status = 'requested';

CREATE TABLE IF NOT EXISTS organization_retention_policies (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL
    CHECK (resource_type IN ('audit_logs', 'meeting_transcripts')),
  retention_days INTEGER NOT NULL
    CHECK (retention_days BETWEEN 1 AND 3650),
  updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, resource_type)
);
