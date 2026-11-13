BEGIN;

-- Meeting action -> task: durable, tenant-scoped idempotency.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source_meeting_action_item_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_action_items_org_id
  ON meeting_action_items (organization_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_org_meeting_action
  ON tasks (organization_id, source_meeting_action_item_id)
  WHERE source_meeting_action_item_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tasks_source_meeting_action_item_org_fkey'
      AND conrelid = 'tasks'::regclass
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_source_meeting_action_item_org_fkey
      FOREIGN KEY (organization_id, source_meeting_action_item_id)
      REFERENCES meeting_action_items (organization_id, id)
      ON DELETE SET NULL (source_meeting_action_item_id);
  END IF;
END $$;

-- Meeting decision candidate -> governance decision: durable idempotency.
ALTER TABLE knowledge_decisions
  ADD COLUMN IF NOT EXISTS source_meeting_decision_candidate_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_decision_candidates_org_id
  ON meeting_decision_candidates (organization_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_decisions_source_meeting_candidate
  ON knowledge_decisions (organization_id, source_meeting_decision_candidate_id)
  WHERE source_meeting_decision_candidate_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'knowledge_decisions_source_meeting_candidate_org_fkey'
      AND conrelid = 'knowledge_decisions'::regclass
  ) THEN
    ALTER TABLE knowledge_decisions
      ADD CONSTRAINT knowledge_decisions_source_meeting_candidate_org_fkey
      FOREIGN KEY (organization_id, source_meeting_decision_candidate_id)
      REFERENCES meeting_decision_candidates (organization_id, id)
      ON DELETE SET NULL (source_meeting_decision_candidate_id);
  END IF;
END $$;

-- Extend the canonical decision-link registry with meeting records.
ALTER TABLE knowledge_decision_links
  DROP CONSTRAINT IF EXISTS knowledge_decision_links_type_check;

ALTER TABLE knowledge_decision_links
  ADD CONSTRAINT knowledge_decision_links_type_check
  CHECK (link_type IN (
    'claim', 'conflict', 'goal', 'objective', 'project', 'task', 'document', 'meeting'
  ));

-- Record task execution separately from the approval event.
ALTER TABLE meeting_intelligence_review_events
  DROP CONSTRAINT IF EXISTS meeting_intelligence_review_events_event_type_check;

ALTER TABLE meeting_intelligence_review_events
  ADD CONSTRAINT meeting_intelligence_review_events_event_type_check
  CHECK (event_type IN (
    'summary_edited', 'action_approved', 'action_rejected', 'action_task_created',
    'decision_approved', 'decision_rejected', 'meeting_shared',
    'consent_recorded', 'retention_updated', 'transcript_deleted'
  ));

-- Immutable snapshots of each reviewed summary revision.
CREATE TABLE IF NOT EXISTS meeting_summary_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  summary TEXT NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 50000),
  edited_by_id UUID,
  source TEXT NOT NULL DEFAULT 'human' CHECK (source IN ('ai', 'human')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meeting_summary_revisions_meeting_org_fkey
    FOREIGN KEY (organization_id, meeting_id)
    REFERENCES meetings (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT meeting_summary_revisions_editor_org_fkey
    FOREIGN KEY (organization_id, edited_by_id)
    REFERENCES users (organization_id, id)
    ON DELETE SET NULL (edited_by_id),
  CONSTRAINT meeting_summary_revisions_revision_unique
    UNIQUE (organization_id, meeting_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_meeting_summary_revisions_history
  ON meeting_summary_revisions (organization_id, meeting_id, revision DESC);

COMMIT;
