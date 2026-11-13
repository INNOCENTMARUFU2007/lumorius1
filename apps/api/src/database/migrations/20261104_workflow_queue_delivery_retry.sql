-- V4.12: efficiently locate workflow runs whose Redis/Bull enqueue handoff failed.
-- Retry classification is stored in workflow_runs.error_message by WorkflowsService.
CREATE INDEX IF NOT EXISTS idx_workflow_runs_queue_recovery
  ON workflow_runs (completed_at ASC NULLS FIRST, started_at ASC, id ASC)
  WHERE status = 'failed';