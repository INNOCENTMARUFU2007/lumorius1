-- 004_performance_indexes.sql
-- Lumorius AI — Performance Indexes and Additional Constraints
-- Run AFTER 001_initial.sql, 002_additional_tables.sql, 003_gdpr_admin.sql
-- All indexes are created with IF NOT EXISTS; safe to re-run.

BEGIN;

-- ── users ─────────────────────────────────────────────────────

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

-- ── sessions ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
  ON sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token
  ON sessions (refresh_token)
  WHERE is_valid = TRUE;

CREATE INDEX IF NOT EXISTS idx_sessions_is_valid
  ON sessions (is_valid);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions (expires_at);

-- ── organizations ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_organizations_slug
  ON organizations (slug);

CREATE INDEX IF NOT EXISTS idx_organizations_plan_id
  ON organizations (plan_id);

-- ── tasks ─────────────────────────────────────────────────────

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

-- Composite for common filter patterns
CREATE INDEX IF NOT EXISTS idx_tasks_org_status
  ON tasks (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_org_assignee
  ON tasks (organization_id, assignee_id);

CREATE INDEX IF NOT EXISTS idx_tasks_org_due_date
  ON tasks (organization_id, due_date)
  WHERE due_date IS NOT NULL AND status != 'done';

-- Full-text search on task title + description
CREATE INDEX IF NOT EXISTS idx_tasks_fts
  ON tasks USING GIN (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- ── projects ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projects_organization_id
  ON projects (organization_id);

CREATE INDEX IF NOT EXISTS idx_projects_owner_id
  ON projects (owner_id);

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON projects (status);

-- ── documents ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_documents_organization_id
  ON documents (organization_id);

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by_id
  ON documents (uploaded_by_id);

CREATE INDEX IF NOT EXISTS idx_documents_status
  ON documents (status);

CREATE INDEX IF NOT EXISTS idx_documents_file_type
  ON documents (file_type);

-- Full-text search on document name + content
CREATE INDEX IF NOT EXISTS idx_documents_fts
  ON documents USING GIN (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(content_text, '')));

-- ── document_chunks ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
  ON document_chunks (document_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_organization_id
  ON document_chunks (organization_id);

-- pgvector index for cosine similarity search (IVFFlat)
-- Note: Requires at least a few hundred rows to be effective.
-- For production, use HNSW for better recall: method = hnsw
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_cosine
  ON document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── meetings ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_meetings_organization_id
  ON meetings (organization_id);

CREATE INDEX IF NOT EXISTS idx_meetings_owner_id
  ON meetings (owner_id);

CREATE INDEX IF NOT EXISTS idx_meetings_status
  ON meetings (status);

CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at
  ON meetings (scheduled_at);

-- ── meeting_transcripts ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_meeting_transcripts_meeting_id
  ON meeting_transcripts (meeting_id);

-- ── meeting_analyses ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_meeting_analyses_meeting_id
  ON meeting_analyses (meeting_id);

-- ── notifications ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON notifications (user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_organization_id
  ON notifications (organization_id);

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON notifications (type);

-- ── audit_logs ────────────────────────────────────────────────

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

-- Composite for compliance queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created_at
  ON audit_logs (organization_id, created_at DESC);

-- ── login_attempts ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_login_attempts_email
  ON login_attempts (email);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
  ON login_attempts (ip_address);

CREATE INDEX IF NOT EXISTS idx_login_attempts_created_at
  ON login_attempts (created_at DESC);

-- ── api_keys ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_api_keys_organization_id
  ON api_keys (organization_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id
  ON api_keys (user_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash
  ON api_keys (key_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_is_active
  ON api_keys (is_active)
  WHERE is_active = TRUE;

-- ── subscriptions ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_subscriptions_organization_id
  ON subscriptions (organization_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON subscriptions (status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_current_period_end
  ON subscriptions (current_period_end);

-- ── goals / kpis ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_goals_organization_id
  ON goals (organization_id);

CREATE INDEX IF NOT EXISTS idx_goals_owner_id
  ON goals (owner_id);

CREATE INDEX IF NOT EXISTS idx_goals_status
  ON goals (status);

CREATE INDEX IF NOT EXISTS idx_kpi_metrics_organization_id
  ON kpi_metrics (organization_id);

-- ── ai_conversations ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id
  ON ai_conversations (user_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_organization_id
  ON ai_conversations (organization_id);

-- ── Verification tokens (TTL cleanup) ────────────────────────

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_id
  ON email_verification_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at
  ON email_verification_tokens (expires_at)
  WHERE used = FALSE;

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
  ON password_reset_tokens (expires_at)
  WHERE used = FALSE;

CREATE INDEX IF NOT EXISTS idx_magic_links_email
  ON magic_links (email);

CREATE INDEX IF NOT EXISTS idx_magic_links_expires_at
  ON magic_links (expires_at)
  WHERE used = FALSE;

COMMIT;

-- Verify index creation
DO $$
DECLARE
  idx_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO idx_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%';

  RAISE NOTICE 'Performance indexes applied. Total custom indexes: %', idx_count;
END $$;
