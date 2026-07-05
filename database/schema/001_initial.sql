-- ============================================================
-- Lumorius AI — Complete Database Schema
-- INMARTECH PVT LTD
-- PostgreSQL 15 + pgvector
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── ENUMS ────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('owner', 'admin', 'manager', 'member', 'viewer', 'super_admin');
CREATE TYPE plan_tier AS ENUM ('starter', 'growth', 'enterprise', 'custom');
CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete');
CREATE TYPE invoice_status AS ENUM ('draft', 'open', 'paid', 'void', 'uncollectible');
CREATE TYPE document_status AS ENUM ('uploading', 'processing', 'indexed', 'failed');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'review', 'done', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE meeting_status AS ENUM ('recording', 'processing', 'completed', 'failed');
CREATE TYPE workflow_status AS ENUM ('active', 'paused', 'draft', 'archived');
CREATE TYPE goal_status AS ENUM ('active', 'completed', 'cancelled', 'paused');
CREATE TYPE notification_type AS ENUM (
  'task_assigned', 'task_due', 'task_overdue',
  'meeting_processed', 'document_indexed', 'document_failed',
  'billing_payment_failed', 'billing_trial_ending', 'billing_plan_updated',
  'security_login_new_device', 'security_password_changed',
  'ai_report_ready', 'member_invited', 'member_joined',
  'workflow_triggered', 'goal_achieved', 'system'
);
CREATE TYPE oauth_provider AS ENUM ('google', 'github', 'microsoft', 'slack');

-- ── ORGANIZATIONS ────────────────────────────────────────────

CREATE TABLE organizations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  slug           TEXT        NOT NULL UNIQUE,
  logo_url       TEXT,
  website        TEXT,
  industry       TEXT,
  size           TEXT,
  plan_id        plan_tier   NOT NULL DEFAULT 'starter',
  trial_ends_at  TIMESTAMPTZ,
  settings       JSONB       NOT NULL DEFAULT '{}',
  metadata       JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_plan ON organizations(plan_id);

-- ── USERS ────────────────────────────────────────────────────

CREATE TABLE users (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT        NOT NULL UNIQUE,
  password_hash         TEXT,
  name                  TEXT        NOT NULL DEFAULT '',
  avatar_url            TEXT,
  role                  user_role   NOT NULL DEFAULT 'member',
  organization_id       UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  email_verified        BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  mfa_enabled           BOOLEAN     NOT NULL DEFAULT FALSE,
  mfa_secret            TEXT,
  failed_login_count    INTEGER     NOT NULL DEFAULT 0,
  locked_until          TIMESTAMPTZ,
  last_login_at         TIMESTAMPTZ,
  password_changed_at   TIMESTAMPTZ,
  preferences           JSONB       NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email           ON users(email);
CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_role            ON users(role);
CREATE INDEX idx_users_is_active       ON users(is_active);

-- ── SESSIONS ─────────────────────────────────────────────────

CREATE TABLE sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token  TEXT        NOT NULL UNIQUE,
  device_name    TEXT,
  device_type    TEXT,
  ip_address     INET,
  user_agent     TEXT,
  is_valid       BOOLEAN     NOT NULL DEFAULT TRUE,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id       ON sessions(user_id);
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX idx_sessions_is_valid      ON sessions(is_valid);
CREATE INDEX idx_sessions_expires_at    ON sessions(expires_at);

-- ── EMAIL VERIFICATION TOKENS ─────────────────────────────────

CREATE TABLE email_verification_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  used       BOOLEAN     NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evtoken_user_id ON email_verification_tokens(user_id);
CREATE INDEX idx_evtoken_token   ON email_verification_tokens(token);

-- ── MAGIC LINKS ──────────────────────────────────────────────

CREATE TABLE magic_links (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL,
  token      TEXT        NOT NULL UNIQUE,
  used       BOOLEAN     NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_magic_links_email ON magic_links(email);

-- ── PASSWORD RESET TOKENS ─────────────────────────────────────

CREATE TABLE password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  used       BOOLEAN     NOT NULL DEFAULT FALSE,
  ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prt_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_prt_token   ON password_reset_tokens(token);

-- ── LOGIN ATTEMPTS ───────────────────────────────────────────

CREATE TABLE login_attempts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        NOT NULL,
  ip_address INET,
  user_agent TEXT,
  success    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_email      ON login_attempts(email);
CREATE INDEX idx_login_attempts_created_at ON login_attempts(created_at);

-- ── OAUTH ACCOUNTS ───────────────────────────────────────────

CREATE TABLE oauth_accounts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        oauth_provider NOT NULL,
  provider_id     TEXT          NOT NULL,
  access_token    TEXT,
  refresh_token   TEXT,
  token_expires_at TIMESTAMPTZ,
  profile_data    JSONB         NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_id)
);

CREATE INDEX idx_oauth_user_id  ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_provider ON oauth_accounts(provider, provider_id);

-- ── API KEYS ─────────────────────────────────────────────────

CREATE TABLE api_keys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  key_hash        TEXT        NOT NULL UNIQUE,
  key_prefix      TEXT        NOT NULL,
  scopes          TEXT[]      NOT NULL DEFAULT '{}',
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_org_id   ON api_keys(organization_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);

-- ── AUDIT LOGS ───────────────────────────────────────────────

CREATE TABLE audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        REFERENCES organizations(id) ON DELETE SET NULL,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL,
  resource_type   TEXT,
  resource_id     TEXT,
  old_values      JSONB,
  new_values      JSONB,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org_id     ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action     ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ── DOCUMENTS ────────────────────────────────────────────────

CREATE TABLE documents (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID            NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by_id  UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT            NOT NULL,
  original_name   TEXT            NOT NULL,
  type            TEXT            NOT NULL,
  mime_type       TEXT            NOT NULL,
  size_bytes      BIGINT          NOT NULL DEFAULT 0,
  storage_key     TEXT            NOT NULL,
  status          document_status NOT NULL DEFAULT 'uploading',
  chunk_count     INTEGER         NOT NULL DEFAULT 0,
  error_message   TEXT,
  tags            TEXT[]          NOT NULL DEFAULT '{}',
  metadata        JSONB           NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_org_id     ON documents(organization_id);
CREATE INDEX idx_documents_uploader   ON documents(uploaded_by_id);
CREATE INDEX idx_documents_status     ON documents(status);
CREATE INDEX idx_documents_type       ON documents(type);
CREATE INDEX idx_documents_created_at ON documents(created_at);

-- ── DOCUMENT CHUNKS (with pgvector) ──────────────────────────

CREATE TABLE document_chunks (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID      NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content       TEXT      NOT NULL,
  chunk_index   INTEGER   NOT NULL,
  token_count   INTEGER   NOT NULL DEFAULT 0,
  embedding     vector(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_doc_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_doc_chunks_embedding   ON document_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── AI CONVERSATIONS ─────────────────────────────────────────

CREATE TABLE ai_conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL DEFAULT 'New Conversation',
  model           TEXT        NOT NULL DEFAULT 'gpt-4o',
  system_prompt   TEXT,
  token_count     INTEGER     NOT NULL DEFAULT 0,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conv_org_id  ON ai_conversations(organization_id);
CREATE INDEX idx_ai_conv_user_id ON ai_conversations(user_id);

-- ── AI MESSAGES ──────────────────────────────────────────────

CREATE TABLE ai_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT        NOT NULL,
  token_count     INTEGER     NOT NULL DEFAULT 0,
  model           TEXT,
  finish_reason   TEXT,
  sources         JSONB       NOT NULL DEFAULT '[]',
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conv_id    ON ai_messages(conversation_id);
CREATE INDEX idx_ai_messages_created_at ON ai_messages(created_at);

-- ── BILLING PLANS ────────────────────────────────────────────

CREATE TABLE billing_plans (
  id                  TEXT        PRIMARY KEY,
  name                TEXT        NOT NULL,
  tier                plan_tier   NOT NULL,
  price_monthly       NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly        NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_price_monthly TEXT,
  stripe_price_yearly  TEXT,
  features            JSONB       NOT NULL DEFAULT '{}',
  limits              JSONB       NOT NULL DEFAULT '{}',
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO billing_plans (id, name, tier, price_monthly, price_yearly, features, limits) VALUES
  ('starter',    'Starter',    'starter',    0,    0,
   '{"ai_chat":true,"documents":true,"tasks":true}',
   '{"users":3,"documents":50,"ai_tokens_monthly":100000,"storage_gb":5}'),
  ('growth',     'Growth',     'growth',     79,   758,
   '{"ai_chat":true,"documents":true,"tasks":true,"meetings":true,"analytics":true,"workflows":true}',
   '{"users":25,"documents":500,"ai_tokens_monthly":1000000,"storage_gb":50}'),
  ('enterprise', 'Enterprise', 'enterprise', 299,  2868,
   '{"ai_chat":true,"documents":true,"tasks":true,"meetings":true,"analytics":true,"workflows":true,"api_access":true,"sso":true,"custom_models":true}',
   '{"users":-1,"documents":-1,"ai_tokens_monthly":-1,"storage_gb":-1}');

-- ── SUBSCRIPTIONS ─────────────────────────────────────────────

CREATE TABLE subscriptions (
  id                      UUID                NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID                NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id                 TEXT                NOT NULL REFERENCES billing_plans(id),
  status                  subscription_status NOT NULL DEFAULT 'trialing',
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT    UNIQUE,
  stripe_price_id         TEXT,
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  trial_start             TIMESTAMPTZ,
  trial_end               TIMESTAMPTZ,
  cancel_at               TIMESTAMPTZ,
  canceled_at             TIMESTAMPTZ,
  metadata                JSONB               NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_org_id ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

-- ── INVOICES ─────────────────────────────────────────────────

CREATE TABLE invoices (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id   UUID           REFERENCES subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id TEXT           UNIQUE,
  amount_due        NUMERIC(10,2)  NOT NULL DEFAULT 0,
  amount_paid       NUMERIC(10,2)  NOT NULL DEFAULT 0,
  currency          TEXT           NOT NULL DEFAULT 'usd',
  status            invoice_status NOT NULL DEFAULT 'draft',
  invoice_pdf       TEXT,
  period_start      TIMESTAMPTZ,
  period_end        TIMESTAMPTZ,
  due_date          TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  metadata          JSONB          NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_org_id ON invoices(organization_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_stripe ON invoices(stripe_invoice_id);

-- ── TASKS ────────────────────────────────────────────────────

CREATE TABLE tasks (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id   UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignee_id     UUID          REFERENCES users(id) ON DELETE SET NULL,
  title           TEXT          NOT NULL,
  description     TEXT,
  status          task_status   NOT NULL DEFAULT 'todo',
  priority        task_priority NOT NULL DEFAULT 'medium',
  due_date        TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  project_id      UUID,
  parent_task_id  UUID          REFERENCES tasks(id) ON DELETE SET NULL,
  tags            TEXT[]        NOT NULL DEFAULT '{}',
  attachments     JSONB         NOT NULL DEFAULT '[]',
  metadata        JSONB         NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_org_id      ON tasks(organization_id);
CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX idx_tasks_status      ON tasks(status);
CREATE INDEX idx_tasks_priority    ON tasks(priority);
CREATE INDEX idx_tasks_due_date    ON tasks(due_date);
CREATE INDEX idx_tasks_created_at  ON tasks(created_at);

-- ── MEETINGS ─────────────────────────────────────────────────

CREATE TABLE meetings (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id     UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT           NOT NULL DEFAULT 'Untitled Meeting',
  description       TEXT,
  status            meeting_status NOT NULL DEFAULT 'recording',
  audio_key         TEXT,
  transcript        TEXT,
  summary           TEXT,
  action_items      JSONB          NOT NULL DEFAULT '[]',
  key_decisions     JSONB          NOT NULL DEFAULT '[]',
  sentiment         TEXT,
  duration_seconds  INTEGER,
  language          TEXT           NOT NULL DEFAULT 'en',
  participants      JSONB          NOT NULL DEFAULT '[]',
  metadata          JSONB          NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meetings_org_id     ON meetings(organization_id);
CREATE INDEX idx_meetings_creator_id ON meetings(created_by_id);
CREATE INDEX idx_meetings_status     ON meetings(status);
CREATE INDEX idx_meetings_created_at ON meetings(created_at);

-- ── KNOWLEDGE GRAPH ──────────────────────────────────────────

CREATE TABLE knowledge_nodes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label           TEXT        NOT NULL,
  type            TEXT        NOT NULL DEFAULT 'concept',
  description     TEXT,
  source_type     TEXT,
  source_id       UUID,
  properties      JSONB       NOT NULL DEFAULT '{}',
  embedding       vector(1536),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE knowledge_edges (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id       UUID        NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  target_id       UUID        NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  relationship    TEXT        NOT NULL DEFAULT 'related_to',
  weight          NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kn_org_id  ON knowledge_nodes(organization_id);
CREATE INDEX idx_kn_type    ON knowledge_nodes(type);
CREATE INDEX idx_kn_embed   ON knowledge_nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_ke_source  ON knowledge_edges(source_id);
CREATE INDEX idx_ke_target  ON knowledge_edges(target_id);
CREATE INDEX idx_ke_org_id  ON knowledge_edges(organization_id);

-- ── KPI METRICS ──────────────────────────────────────────────

CREATE TABLE kpi_metrics (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  unit            TEXT,
  target          NUMERIC(15,4),
  category        TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE kpi_values (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id   UUID        NOT NULL REFERENCES kpi_metrics(id) ON DELETE CASCADE,
  value       NUMERIC(15,4) NOT NULL,
  recorded_at DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (metric_id, recorded_at)
);

CREATE INDEX idx_kpi_metrics_org_id ON kpi_metrics(organization_id);
CREATE INDEX idx_kpi_values_metric  ON kpi_values(metric_id);
CREATE INDEX idx_kpi_values_date    ON kpi_values(recorded_at);

-- ── GOALS (OKRs) ─────────────────────────────────────────────

CREATE TABLE goals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_goal_id  UUID        REFERENCES goals(id) ON DELETE SET NULL,
  title           TEXT        NOT NULL,
  description     TEXT,
  target_value    NUMERIC(15,4),
  current_value   NUMERIC(15,4) NOT NULL DEFAULT 0,
  unit            TEXT,
  status          goal_status NOT NULL DEFAULT 'active',
  due_date        TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goals_org_id   ON goals(organization_id);
CREATE INDEX idx_goals_owner_id ON goals(owner_id);
CREATE INDEX idx_goals_status   ON goals(status);

-- ── WORKFLOWS ────────────────────────────────────────────────

CREATE TABLE workflows (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID            NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id   UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT            NOT NULL,
  description     TEXT,
  trigger_type    TEXT            NOT NULL DEFAULT 'manual',
  trigger_config  JSONB           NOT NULL DEFAULT '{}',
  steps           JSONB           NOT NULL DEFAULT '[]',
  status          workflow_status NOT NULL DEFAULT 'draft',
  last_run_at     TIMESTAMPTZ,
  run_count       INTEGER         NOT NULL DEFAULT 0,
  metadata        JSONB           NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_runs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  triggered_by_id UUID        REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT        NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),
  input_data      JSONB       NOT NULL DEFAULT '{}',
  output_data     JSONB       NOT NULL DEFAULT '{}',
  error_message   TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_workflows_org_id ON workflows(organization_id);
CREATE INDEX idx_workflow_runs_wf ON workflow_runs(workflow_id);

-- ── NOTIFICATIONS ────────────────────────────────────────────

CREATE TABLE notifications (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID              REFERENCES organizations(id) ON DELETE CASCADE,
  type            notification_type NOT NULL DEFAULT 'system',
  title           TEXT              NOT NULL,
  body            TEXT,
  action_url      TEXT,
  metadata        JSONB             NOT NULL DEFAULT '{}',
  is_read         BOOLEAN           NOT NULL DEFAULT FALSE,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id    ON notifications(user_id);
CREATE INDEX idx_notifications_is_read    ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- ── GDPR DATA EXPORT REQUESTS ────────────────────────────────

CREATE TABLE gdpr_export_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','expired')),
  storage_key TEXT,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gdpr_requests_user_id ON gdpr_export_requests(user_id);

-- ── AI USAGE TRACKING ────────────────────────────────────────

CREATE TABLE ai_usage (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
  model           TEXT        NOT NULL,
  prompt_tokens   INTEGER     NOT NULL DEFAULT 0,
  completion_tokens INTEGER   NOT NULL DEFAULT 0,
  total_tokens    INTEGER     NOT NULL DEFAULT 0,
  cost_usd        NUMERIC(10,6) NOT NULL DEFAULT 0,
  feature         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_org_id     ON ai_usage(organization_id);
CREATE INDEX idx_ai_usage_created_at ON ai_usage(created_at);

-- ── UPDATED_AT TRIGGER ───────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at     BEFORE UPDATE ON organizations     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated_at             BEFORE UPDATE ON users             FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_documents_updated_at         BEFORE UPDATE ON documents         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ai_conversations_updated_at  BEFORE UPDATE ON ai_conversations  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_subscriptions_updated_at     BEFORE UPDATE ON subscriptions     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tasks_updated_at             BEFORE UPDATE ON tasks             FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_meetings_updated_at          BEFORE UPDATE ON meetings          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_knowledge_nodes_updated_at   BEFORE UPDATE ON knowledge_nodes   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_kpi_metrics_updated_at       BEFORE UPDATE ON kpi_metrics       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_goals_updated_at             BEFORE UPDATE ON goals             FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_workflows_updated_at         BEFORE UPDATE ON workflows         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_oauth_accounts_updated_at    BEFORE UPDATE ON oauth_accounts    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
