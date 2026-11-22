ALTER TABLE organization_deletion_requests
  ADD COLUMN IF NOT EXISTS organization_id_snapshot UUID;
UPDATE organization_deletion_requests SET organization_id_snapshot = organization_id
WHERE organization_id_snapshot IS NULL AND organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS briefing_preferences (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cadence TEXT NOT NULL CHECK (cadence IN ('off', 'daily', 'weekly')),
  hour_utc SMALLINT NOT NULL CHECK (hour_utc BETWEEN 0 AND 23),
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  next_delivery_at TIMESTAMPTZ,
  last_delivered_at TIMESTAMPTZ,
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_briefing_delivery_due
  ON briefing_preferences (next_delivery_at)
  WHERE next_delivery_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS briefing_feedback (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('dismissed', 'useful')),
  PRIMARY KEY (organization_id, user_id, item_key)
);

CREATE TABLE IF NOT EXISTS briefing_workflow_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  requested_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_briefing_workflow_request_pending
  ON briefing_workflow_requests (organization_id, workflow_id, requested_by_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_briefing_workflow_request_recent
  ON briefing_workflow_requests (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS objective_progress_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  objective_id UUID NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  progress NUMERIC NOT NULL,
  status TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_objective_progress_events_recent
  ON objective_progress_events (objective_id, recorded_at DESC, id DESC);

CREATE OR REPLACE FUNCTION record_objective_progress() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.progress IS DISTINCT FROM OLD.progress OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO objective_progress_events (objective_id, progress, status)
    VALUES (NEW.id, COALESCE(NEW.progress, 0), NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS objective_progress_event ON objectives;
CREATE TRIGGER objective_progress_event
  AFTER INSERT OR UPDATE OF progress, status ON objectives
  FOR EACH ROW EXECUTE FUNCTION record_objective_progress();

INSERT INTO objective_progress_events (objective_id, progress, status)
SELECT o.id, COALESCE(o.progress, 0), o.status FROM objectives o
WHERE NOT EXISTS (SELECT 1 FROM objective_progress_events e WHERE e.objective_id = o.id);

CREATE INDEX IF NOT EXISTS idx_tasks_briefing_source
  ON tasks (organization_id, created_by_id, (metadata ->> 'briefingItemKey'))
  WHERE (metadata ->> 'briefingItemKey') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_audit_recent ON audit_logs (organization_id, created_at DESC, id DESC);
