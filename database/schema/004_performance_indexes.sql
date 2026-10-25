-- 004_performance_indexes.sql
-- Lumorius AI — Performance Indexes and Additional Constraints
-- Run AFTER:
--   001_initial.sql
--   002_additional_tables.sql
--   002_email_security_founder_os.sql
--   003_gdpr_admin.sql
--
-- Corrected to match the current Lumorius PostgreSQL schema.
-- Index creation is idempotent where supported by IF NOT EXISTS.

BEGIN;

-- ── USERS ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_email
  ON users (email);

CREATE INDEX IF NOT EXISTS idx_users_organization_id
  ON users (organization_id);

CREATE INDEX IF NOT EXISTS idx_users_role
  ON users (role);

CREATE INDEX IF NOT EXISTS idx_users_is_active
  ON users (is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_users_email_verified
  ON users (email_verified)
  WHERE email_verified = FALSE;

CREATE INDEX IF NOT EXISTS idx_users_locked_until
  ON users (locked_until)
  WHERE locked_until IS NOT NULL;


-- ── SESSIONS ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
  ON sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token
  ON sessions (refresh_token)
  WHERE is_valid = TRUE;

CREATE INDEX IF NOT EXISTS idx_sessions_is_valid
  ON sessions (is_valid);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions (expires_at);


-- ── ORGANIZATIONS ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_organizations_slug
  ON organizations (slug);

CREATE INDEX IF NOT EXISTS idx_organizations_plan_id
  ON organizations (plan_id);


-- ── TASKS ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tasks_organization_id
  ON tasks (organization_id);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id
  ON tasks (assignee_id)
  WHERE assignee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_created_by_id
  ON tasks (created_by_id);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id
  ON tasks (project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks (status);

CREATE INDEX IF NOT EXISTS idx_tasks_priority
  ON tasks (priority);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date
  ON tasks (due_date)
  WHERE due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
  ON tasks (completed_at)
  WHERE completed_at IS NOT NULL;

-- Composite indexes for common filter patterns
CREATE INDEX IF NOT EXISTS idx_tasks_org_status
  ON tasks (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_org_assignee
  ON tasks (organization_id, assignee_id);

CREATE INDEX IF NOT EXISTS idx_tasks_org_due_date
  ON tasks (organization_id, due_date)
  WHERE due_date IS NOT NULL
    AND status != 'done';

-- Full-text search on task title and description
CREATE INDEX IF NOT EXISTS idx_tasks_fts
  ON tasks USING GIN (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(description, '')
    )
  );


-- ── PROJECTS ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projects_organization_id
  ON projects (organization_id);

CREATE INDEX IF NOT EXISTS idx_projects_owner_id
  ON projects (owner_id);

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON projects (status);


-- ── DOCUMENTS ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_documents_organization_id
  ON documents (organization_id);

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by_id
  ON documents (uploaded_by_id);

CREATE INDEX IF NOT EXISTS idx_documents_status
  ON documents (status);

-- The actual schema uses mime_type, not file_type.
CREATE INDEX IF NOT EXISTS idx_documents_mime_type
  ON documents (mime_type);

-- Full-text search on document names.
-- The documents table has name and original_name, not content_text.
CREATE INDEX IF NOT EXISTS idx_documents_fts
  ON documents USING GIN (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' || coalesce(original_name, '')
    )
  );


-- ── DOCUMENT CHUNKS ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
  ON document_chunks (document_id);

-- The document_chunks table has no organization_id column.
-- Organisation filtering should join through documents.

-- Full-text search on extracted document chunk content.
CREATE INDEX IF NOT EXISTS idx_document_chunks_fts
  ON document_chunks USING GIN (
    to_tsvector('english', coalesce(content, ''))
  );

-- The base schema already creates an IVFFlat embedding index:
-- idx_doc_chunks_embedding on document_chunks(embedding).
-- Do not create a duplicate embedding index here.


-- ── MEETINGS ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_meetings_organization_id
  ON meetings (organization_id);

-- The actual schema uses created_by_id, not owner_id.
CREATE INDEX IF NOT EXISTS idx_meetings_created_by_id
  ON meetings (created_by_id);

CREATE INDEX IF NOT EXISTS idx_meetings_status
  ON meetings (status);

-- No scheduled_at index: that column is absent from the current schema.


-- ── MEETING TRANSCRIPTS ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_meeting_transcripts_meeting_id
  ON meeting_transcripts (meeting_id);


-- ── MEETING ANALYSES ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_meeting_analyses_meeting_id
  ON meeting_analyses (meeting_id);


-- ── NOTIFICATIONS ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON notifications (user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_organization_id
  ON notifications (organization_id);

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON notifications (type);


-- ── AUDIT LOGS ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON audit_logs (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id
  ON audit_logs (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs (created_at DESC);

-- Composite index for compliance queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created_at
  ON audit_logs (organization_id, created_at DESC);


-- ── LOGIN ATTEMPTS ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_login_attempts_email
  ON login_attempts (email);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
  ON login_attempts (ip_address);

CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at
  ON login_attempts (created_at DESC);


-- ── API KEYS ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_api_keys_organization_id
  ON api_keys (organization_id);

-- The actual schema uses created_by_id, not user_id.
CREATE INDEX IF NOT EXISTS idx_api_keys_created_by_id
  ON api_keys (created_by_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash
  ON api_keys (key_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_is_active
  ON api_keys (is_active)
  WHERE is_active = TRUE;


-- ── SUBSCRIPTIONS ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_subscriptions_organization_id
  ON subscriptions (organization_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions (status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end
  ON subscriptions (current_period_end);


-- ── GOALS AND KPI METRICS ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_goals_organization_id
  ON goals (organization_id);

CREATE INDEX IF NOT EXISTS idx_goals_owner_id
  ON goals (owner_id);

CREATE INDEX IF NOT EXISTS idx_goals_status
  ON goals (status);

CREATE INDEX IF NOT EXISTS idx_kpi_metrics_organization_id
  ON kpi_metrics (organization_id);


-- ── AI CONVERSATIONS ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id
  ON ai_conversations (user_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_organization_id
  ON ai_conversations (organization_id);


-- ── EMAIL VERIFICATION TOKENS ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id
  ON email_verification_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at
  ON email_verification_tokens (expires_at)
  WHERE used = FALSE;


-- ── PASSWORD RESET TOKENS ──────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
  ON password_reset_tokens (expires_at)
  WHERE used = FALSE;


-- ── MAGIC LINKS ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_magic_links_email
  ON magic_links (email);

CREATE INDEX IF NOT EXISTS idx_magic_links_expires_at
  ON magic_links (expires_at)
  WHERE used = FALSE;


COMMIT;


-- ── VERIFICATION ──────────────────────────────────────────────

DO $$
DECLARE
  idx_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO idx_count
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname LIKE 'idx_%';

  RAISE NOTICE
    'Performance indexes applied. Total custom indexes: %',
    idx_count;
END $$;