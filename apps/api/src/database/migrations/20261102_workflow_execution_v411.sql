BEGIN;

ALTER TABLE workflow_runs
  ADD COLUMN IF NOT EXISTS trigger_event TEXT,
  ADD COLUMN IF NOT EXISTS event_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_runs_event_dedupe
  ON workflow_runs (workflow_id, event_key)
  WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_org_started
  ON workflow_runs (organization_id, started_at DESC);

CREATE TABLE IF NOT EXISTS workflow_step_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL CHECK (step_index >= 0),
  step_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT workflow_step_runs_run_step_unique UNIQUE (workflow_run_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_org_created
  ON workflow_step_runs (organization_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_run
  ON workflow_step_runs (workflow_run_id, step_index);

COMMIT;