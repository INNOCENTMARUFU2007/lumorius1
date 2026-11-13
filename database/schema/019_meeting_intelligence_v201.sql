BEGIN;

-- Meeting Intelligence 2.0.1 foundational lifecycle, evidence and governance schema.
-- Existing meeting_status enum remains authoritative: recording/processing/completed/failed.

ALTER TABLE meetings
  -- These two columns are referenced by the existing processor but were absent
  -- from the verified live meetings table during the source audit.
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_stage TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'recording',
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS team_id UUID,
  ADD COLUMN IF NOT EXISTS consent_status TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS consent_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_captured_by UUID,
  ADD COLUMN IF NOT EXISTS recording_retention_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transcript_retention_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_meetings_organization_id_id
  ON meetings (organization_id, id);

-- Required referenced keys for organisation-scoped foreign keys below.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_organization_id_id
  ON users (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_organization_id_id
  ON projects (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_organization_id_id
  ON tasks (organization_id, id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meetings_processing_stage_check'
      AND conrelid = 'public.meetings'::regclass
  ) THEN
    ALTER TABLE meetings ADD CONSTRAINT meetings_processing_stage_check
      CHECK (processing_stage IN (
        'queued', 'transcription', 'analysis', 'indexing', 'review', 'completed', 'failed'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meetings_source_type_check'
      AND conrelid = 'public.meetings'::regclass
  ) THEN
    ALTER TABLE meetings ADD CONSTRAINT meetings_source_type_check
      CHECK (source_type IN ('recording', 'transcript', 'notes'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meetings_consent_status_check'
      AND conrelid = 'public.meetings'::regclass
  ) THEN
    ALTER TABLE meetings ADD CONSTRAINT meetings_consent_status_check
      CHECK (consent_status IN ('unverified', 'pending', 'granted', 'denied', 'withdrawn', 'not_required'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meetings_team_organization_fkey'
      AND conrelid = 'public.meetings'::regclass
  ) THEN
    ALTER TABLE meetings ADD CONSTRAINT meetings_team_organization_fkey
      FOREIGN KEY (organization_id, team_id)
      REFERENCES teams (organization_id, id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meetings_consent_actor_org_fkey'
      AND conrelid = 'public.meetings'::regclass
  ) THEN
    ALTER TABLE meetings ADD CONSTRAINT meetings_consent_actor_org_fkey
      FOREIGN KEY (organization_id, consent_captured_by)
      REFERENCES users (organization_id, id)
      ON DELETE SET NULL (consent_captured_by);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_transcripts_meeting_id_id
  ON meeting_transcripts (meeting_id, id);

ALTER TABLE meeting_analyses
  ADD COLUMN IF NOT EXISTS organization_id UUID,
  ADD COLUMN IF NOT EXISTS agenda_coverage JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS open_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS summary_revision INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS summary_updated_by UUID,
  ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMPTZ;

-- Backfill organisation ownership from the authoritative meeting row.
UPDATE meeting_analyses analysis
   SET organization_id = meeting.organization_id
  FROM meetings meeting
 WHERE meeting.id = analysis.meeting_id
   AND analysis.organization_id IS NULL;

ALTER TABLE meeting_analyses
  ALTER COLUMN organization_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meeting_analyses_review_status_check'
      AND conrelid = 'public.meeting_analyses'::regclass
  ) THEN
    ALTER TABLE meeting_analyses ADD CONSTRAINT meeting_analyses_review_status_check
      CHECK (review_status IN ('pending', 'reviewed', 'shared'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meeting_analyses_revision_check'
      AND conrelid = 'public.meeting_analyses'::regclass
  ) THEN
    ALTER TABLE meeting_analyses ADD CONSTRAINT meeting_analyses_revision_check
      CHECK (summary_revision >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meeting_analyses_meeting_org_fkey'
      AND conrelid = 'public.meeting_analyses'::regclass
  ) THEN
    ALTER TABLE meeting_analyses ADD CONSTRAINT meeting_analyses_meeting_org_fkey
      FOREIGN KEY (organization_id, meeting_id)
      REFERENCES meetings (organization_id, id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meeting_analyses_summary_editor_org_fkey'
      AND conrelid = 'public.meeting_analyses'::regclass
  ) THEN
    ALTER TABLE meeting_analyses ADD CONSTRAINT meeting_analyses_summary_editor_org_fkey
      FOREIGN KEY (organization_id, summary_updated_by)
      REFERENCES users (organization_id, id)
      ON DELETE SET NULL (summary_updated_by);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS meeting_transcript_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL,
  transcript_id UUID NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
  token_count INTEGER NOT NULL CHECK (token_count >= 0),
  start_ms BIGINT,
  end_ms BIGINT,
  speaker_label TEXT,
  speaker_confidence NUMERIC(5,4),
  embedding VECTOR(1536),
  source_hash TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meeting_transcript_chunks_time_check
    CHECK (start_ms IS NULL OR start_ms >= 0),
  CONSTRAINT meeting_transcript_chunks_time_order_check
    CHECK (end_ms IS NULL OR (start_ms IS NOT NULL AND end_ms >= start_ms)),
  CONSTRAINT meeting_transcript_chunks_speaker_confidence_check
    CHECK (speaker_confidence IS NULL OR speaker_confidence BETWEEN 0 AND 1),
  CONSTRAINT meeting_transcript_chunks_identity_unique
    UNIQUE (organization_id, meeting_id, transcript_id, chunk_index),
  CONSTRAINT meeting_transcript_chunks_meeting_org_fkey
    FOREIGN KEY (organization_id, meeting_id)
    REFERENCES meetings (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT meeting_transcript_chunks_transcript_meeting_fkey
    FOREIGN KEY (meeting_id, transcript_id)
    REFERENCES meeting_transcripts (meeting_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meeting_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL,
  transcript_id UUID NOT NULL,
  action_text TEXT NOT NULL CHECK (length(btrim(action_text)) BETWEEN 3 AND 4000),
  candidate_assignee_name TEXT,
  assignee_id UUID,
  due_at TIMESTAMPTZ,
  project_id UUID,
  priority task_priority NOT NULL DEFAULT 'medium',
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_excerpt TEXT NOT NULL CHECK (length(btrim(evidence_excerpt)) >= 8),
  source_start_ms BIGINT,
  source_end_ms BIGINT,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'task_created', 'cancelled')),
  created_task_id UUID,
  reviewed_by_id UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  action_fingerprint TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meeting_action_items_time_check
    CHECK (source_start_ms IS NULL OR source_start_ms >= 0),
  CONSTRAINT meeting_action_items_time_order_check
    CHECK (source_end_ms IS NULL OR (source_start_ms IS NOT NULL AND source_end_ms >= source_start_ms)),
  CONSTRAINT meeting_action_items_meeting_org_fkey
    FOREIGN KEY (organization_id, meeting_id)
    REFERENCES meetings (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT meeting_action_items_transcript_fkey
    FOREIGN KEY (meeting_id, transcript_id)
    REFERENCES meeting_transcripts (meeting_id, id) ON DELETE CASCADE,
  CONSTRAINT meeting_action_items_fingerprint_unique
    UNIQUE (organization_id, meeting_id, action_fingerprint),
  CONSTRAINT meeting_action_items_assignee_org_fkey
    FOREIGN KEY (organization_id, assignee_id)
    REFERENCES users (organization_id, id)
    ON DELETE SET NULL (assignee_id),
  CONSTRAINT meeting_action_items_project_org_fkey
    FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id)
    ON DELETE SET NULL (project_id),
  CONSTRAINT meeting_action_items_task_org_fkey
    FOREIGN KEY (organization_id, created_task_id)
    REFERENCES tasks (organization_id, id)
    ON DELETE SET NULL (created_task_id),
  CONSTRAINT meeting_action_items_reviewer_org_fkey
    FOREIGN KEY (organization_id, reviewed_by_id)
    REFERENCES users (organization_id, id)
    ON DELETE SET NULL (reviewed_by_id)
);

CREATE TABLE IF NOT EXISTS meeting_decision_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL,
  transcript_id UUID NOT NULL,
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 3 AND 8000),
  decision_maker_candidate TEXT,
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_excerpt TEXT NOT NULL CHECK (length(btrim(evidence_excerpt)) >= 8),
  source_start_ms BIGINT,
  source_end_ms BIGINT,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'linked')),
  knowledge_decision_id UUID,
  reviewed_by_id UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  decision_fingerprint TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meeting_decision_candidates_meeting_org_fkey
    FOREIGN KEY (organization_id, meeting_id)
    REFERENCES meetings (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT meeting_decision_candidates_transcript_fkey
    FOREIGN KEY (meeting_id, transcript_id)
    REFERENCES meeting_transcripts (meeting_id, id) ON DELETE CASCADE,
  CONSTRAINT meeting_decision_candidates_fingerprint_unique
    UNIQUE (organization_id, meeting_id, decision_fingerprint),
  CONSTRAINT meeting_decision_candidates_time_check
    CHECK (source_start_ms IS NULL OR source_start_ms >= 0),
  CONSTRAINT meeting_decision_candidates_time_order_check
    CHECK (source_end_ms IS NULL OR (source_start_ms IS NOT NULL AND source_end_ms >= source_start_ms)),
  CONSTRAINT meeting_decision_candidates_decision_org_fkey
    FOREIGN KEY (organization_id, knowledge_decision_id)
    REFERENCES knowledge_decisions (organization_id, id)
    ON DELETE SET NULL (knowledge_decision_id),
  CONSTRAINT meeting_decision_candidates_reviewer_org_fkey
    FOREIGN KEY (organization_id, reviewed_by_id)
    REFERENCES users (organization_id, id)
    ON DELETE SET NULL (reviewed_by_id)
);

CREATE TABLE IF NOT EXISTS meeting_intelligence_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL,
  actor_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'summary_edited', 'action_approved', 'action_rejected',
    'decision_approved', 'decision_rejected', 'meeting_shared',
    'consent_recorded', 'retention_updated', 'transcript_deleted'
  )),
  entity_type TEXT,
  entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- meeting_id is an opaque historical reference, intentionally not a FK.
  -- This preserves minimal audit metadata after meeting/transcript deletion.
  -- Never store transcript excerpts, recording keys or sensitive content in details.
  CONSTRAINT meeting_intelligence_review_events_actor_org_fkey
    FOREIGN KEY (organization_id, actor_id)
    REFERENCES users (organization_id, id)
    ON DELETE SET NULL (actor_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_chunks_org_meeting
  ON meeting_transcript_chunks (organization_id, meeting_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_meeting_chunks_fts
  ON meeting_transcript_chunks USING GIN (to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_meeting_chunks_embedding
  ON meeting_transcript_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS idx_meeting_actions_review
  ON meeting_action_items (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_actions_assignee
  ON meeting_action_items (organization_id, assignee_id, status)
  WHERE assignee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meeting_decision_candidates_review
  ON meeting_decision_candidates (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_review_events_history
  ON meeting_intelligence_review_events (organization_id, meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_team_created
  ON meetings (organization_id, team_id, created_at DESC);

COMMIT;
