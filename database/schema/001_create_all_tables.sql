-- ============================================================
-- Lumorius AI — Complete Database Schema
-- PostgreSQL 15+ with pgvector extension
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- BILLING PLANS
-- ============================================================
CREATE TABLE billing_plans (
  id            VARCHAR(50) PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  annual_price_cents  INTEGER NOT NULL DEFAULT 0,
  max_users     INTEGER,
  storage_gb    INTEGER,
  ai_requests_per_month INTEGER,
  stripe_price_id_monthly VARCHAR(255),
  stripe_price_id_annual  VARCHAR(255),
  features      JSONB NOT NULL DEFAULT '[]',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) NOT NULL UNIQUE,
  logo_url      TEXT,
  plan_id       VARCHAR(50) NOT NULL REFERENCES billing_plans(id) DEFAULT 'starter',
  settings      JSONB NOT NULL DEFAULT '{}',
  stripe_customer_id VARCHAR(255),
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  ai_requests_used   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_plan_id ON organizations(plan_id);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) NOT NULL UNIQUE,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash   TEXT,
  name            VARCHAR(255) NOT NULL,
  avatar_url      TEXT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  role            VARCHAR(50) NOT NULL DEFAULT 'member',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret      TEXT,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- SESSIONS
-- ============================================================
CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token   TEXT NOT NULL UNIQUE,
  device_name     VARCHAR(255),
  device_type     VARCHAR(100),
  ip_address      INET,
  user_agent      TEXT,
  is_valid        BOOLEAN NOT NULL DEFAULT TRUE,
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- ============================================================
-- MAGIC LINKS
-- ============================================================
CREATE TABLE magic_links (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       VARCHAR(255) NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_magic_links_token ON magic_links(token);

-- ============================================================
-- OAUTH ACCOUNTS
-- ============================================================
CREATE TABLE oauth_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  access_token    TEXT,
  refresh_token   TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_user_id)
);

CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts(user_id);

-- ============================================================
-- DEPARTMENTS
-- ============================================================
CREATE TABLE departments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  head_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_departments_organization_id ON departments(organization_id);

-- ============================================================
-- TEAMS
-- ============================================================
CREATE TABLE teams (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
  created_by_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teams_organization_id ON teams(organization_id);
CREATE INDEX idx_teams_department_id ON teams(department_id);

-- ============================================================
-- TEAM MEMBERS
-- ============================================================
CREATE TABLE team_members (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      VARCHAR(50) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);

-- ============================================================
-- INVITATIONS
-- ============================================================
CREATE TABLE invitations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) NOT NULL,
  role            VARCHAR(50) NOT NULL DEFAULT 'member',
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,
  invited_by_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  accepted_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitations_organization_id ON invitations(organization_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(500) NOT NULL,
  type            VARCHAR(20) NOT NULL,
  status          VARCHAR(30) NOT NULL DEFAULT 'uploading',
  size_bytes      BIGINT NOT NULL DEFAULT 0,
  storage_key     TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by_id  UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  chunk_count     INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_organization_id ON documents(organization_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_type ON documents(type);
CREATE INDEX idx_documents_team_id ON documents(team_id);
CREATE INDEX idx_documents_tags ON documents USING GIN(tags);
CREATE INDEX idx_documents_name_trgm ON documents USING GIN(name gin_trgm_ops);

-- ============================================================
-- DOCUMENT CHUNKS (with vector embeddings)
-- ============================================================
CREATE TABLE document_chunks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  chunk_index   INTEGER NOT NULL,
  token_count   INTEGER NOT NULL DEFAULT 0,
  embedding     vector(1536),
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- MEETINGS
-- ============================================================
CREATE TABLE meetings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             VARCHAR(500) NOT NULL,
  status            VARCHAR(30) NOT NULL DEFAULT 'uploading',
  media_key         TEXT,
  media_type        VARCHAR(10),
  duration_seconds  INTEGER,
  participant_count INTEGER,
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id     UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  team_id           UUID REFERENCES teams(id) ON DELETE SET NULL,
  scheduled_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meetings_organization_id ON meetings(organization_id);
CREATE INDEX idx_meetings_status ON meetings(status);
CREATE INDEX idx_meetings_created_by_id ON meetings(created_by_id);

-- ============================================================
-- MEETING TRANSCRIPTS
-- ============================================================
CREATE TABLE meeting_transcripts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id  UUID NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  segments    JSONB NOT NULL DEFAULT '[]',
  language    VARCHAR(10) NOT NULL DEFAULT 'en',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meeting_transcripts_meeting_id ON meeting_transcripts(meeting_id);
CREATE INDEX idx_meeting_transcripts_content ON meeting_transcripts USING GIN(to_tsvector('english', content));

-- ============================================================
-- MEETING ANALYSES
-- ============================================================
CREATE TABLE meeting_analyses (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id        UUID NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  summary           TEXT NOT NULL,
  action_items      JSONB NOT NULL DEFAULT '[]',
  decisions         JSONB NOT NULL DEFAULT '[]',
  key_topics        TEXT[] NOT NULL DEFAULT '{}',
  sentiment         VARCHAR(20) NOT NULL DEFAULT 'neutral',
  strategic_insights JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  status          VARCHAR(30) NOT NULL DEFAULT 'planning',
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  start_date      DATE,
  end_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_organization_id ON projects(organization_id);
CREATE INDEX idx_projects_owner_id ON projects(owner_id);
CREATE INDEX idx_projects_status ON projects(status);

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(500) NOT NULL,
  description     TEXT,
  status          VARCHAR(30) NOT NULL DEFAULT 'todo',
  priority        VARCHAR(20) NOT NULL DEFAULT 'medium',
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  assignee_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_id   UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  team_id         UUID REFERENCES teams(id) ON DELETE SET NULL,
  due_date        TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  source_type     VARCHAR(20),
  source_id       UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_organization_id ON tasks(organization_id);
CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_assignee_id ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- ============================================================
-- GOALS
-- ============================================================
CREATE TABLE goals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  target_value    NUMERIC,
  current_value   NUMERIC,
  unit            VARCHAR(50),
  due_date        DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goals_organization_id ON goals(organization_id);
CREATE INDEX idx_goals_owner_id ON goals(owner_id);

-- ============================================================
-- KPI METRICS
-- ============================================================
CREATE TABLE kpi_metrics (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  unit            VARCHAR(50),
  target          NUMERIC,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE kpi_values (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_id   UUID NOT NULL REFERENCES kpi_metrics(id) ON DELETE CASCADE,
  value       NUMERIC NOT NULL,
  recorded_at DATE NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(metric_id, recorded_at)
);

CREATE INDEX idx_kpi_values_metric_id ON kpi_values(metric_id);
CREATE INDEX idx_kpi_values_recorded_at ON kpi_values(recorded_at);

-- ============================================================
-- KNOWLEDGE NODES
-- ============================================================
CREATE TABLE knowledge_nodes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(500) NOT NULL,
  type            VARCHAR(50) NOT NULL,
  description     TEXT,
  properties      JSONB NOT NULL DEFAULT '{}',
  embedding       vector(1536),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_type     VARCHAR(50),
  source_id       UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_knowledge_nodes_organization_id ON knowledge_nodes(organization_id);
CREATE INDEX idx_knowledge_nodes_type ON knowledge_nodes(type);
CREATE INDEX idx_knowledge_nodes_embedding ON knowledge_nodes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX idx_knowledge_nodes_name_trgm ON knowledge_nodes USING GIN(name gin_trgm_ops);

-- ============================================================
-- KNOWLEDGE RELATIONS
-- ============================================================
CREATE TABLE knowledge_relations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_node_id    UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  to_node_id      UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
  relation_type   VARCHAR(100) NOT NULL,
  strength        NUMERIC NOT NULL DEFAULT 1.0 CHECK (strength >= 0 AND strength <= 1),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(from_node_id, to_node_id, relation_type)
);

CREATE INDEX idx_knowledge_relations_from_node ON knowledge_relations(from_node_id);
CREATE INDEX idx_knowledge_relations_to_node ON knowledge_relations(to_node_id);
CREATE INDEX idx_knowledge_relations_organization_id ON knowledge_relations(organization_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type            VARCHAR(100) NOT NULL,
  title           VARCHAR(500) NOT NULL,
  message         TEXT,
  data            JSONB NOT NULL DEFAULT '{}',
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read_at ON notifications(read_at);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- ============================================================
-- REPORTS
-- ============================================================
CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(255) NOT NULL,
  type            VARCHAR(50) NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  content         JSONB NOT NULL DEFAULT '{}',
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  generated_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reports_organization_id ON reports(organization_id);
CREATE INDEX idx_reports_type ON reports(type);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE TABLE subscriptions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id           UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id                   VARCHAR(50) NOT NULL REFERENCES billing_plans(id),
  status                    VARCHAR(30) NOT NULL DEFAULT 'active',
  interval                  VARCHAR(20) NOT NULL DEFAULT 'monthly',
  stripe_subscription_id    VARCHAR(255) NOT NULL UNIQUE,
  stripe_price_id           VARCHAR(255) NOT NULL,
  current_period_start      TIMESTAMPTZ NOT NULL,
  current_period_end        TIMESTAMPTZ NOT NULL,
  cancel_at_period_end      BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at              TIMESTAMPTZ,
  trial_end                 TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_organization_id ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id     UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id   VARCHAR(255) NOT NULL UNIQUE,
  amount_cents        INTEGER NOT NULL,
  currency            VARCHAR(3) NOT NULL DEFAULT 'usd',
  status              VARCHAR(30) NOT NULL,
  invoice_url         TEXT,
  pdf_url             TEXT,
  paid_at             TIMESTAMPTZ,
  due_date            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_organization_id ON invoices(organization_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(100) NOT NULL,
  resource_type   VARCHAR(100) NOT NULL,
  resource_id     UUID,
  old_value       JSONB,
  new_value       JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================
-- WORKFLOW DEFINITIONS
-- ============================================================
CREATE TABLE workflow_definitions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  trigger_type    VARCHAR(50) NOT NULL,
  trigger_config  JSONB NOT NULL DEFAULT '{}',
  steps           JSONB NOT NULL DEFAULT '[]',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_definitions_organization_id ON workflow_definitions(organization_id);
CREATE INDEX idx_workflow_definitions_trigger_type ON workflow_definitions(trigger_type);

-- ============================================================
-- WORKFLOW RUNS
-- ============================================================
CREATE TABLE workflow_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id       UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  status            VARCHAR(30) NOT NULL DEFAULT 'running',
  trigger_data      JSONB NOT NULL DEFAULT '{}',
  result            JSONB,
  error_message     TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);

-- ============================================================
-- AI CONVERSATIONS
-- ============================================================
CREATE TABLE ai_conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(500),
  type            VARCHAR(50) NOT NULL DEFAULT 'general',
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conversations_organization_id ON ai_conversations(organization_id);
CREATE INDEX idx_ai_conversations_user_id ON ai_conversations(user_id);

-- ============================================================
-- AI MESSAGES
-- ============================================================
CREATE TABLE ai_messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role              VARCHAR(20) NOT NULL,
  content           TEXT NOT NULL,
  model             VARCHAR(100),
  tokens_used       INTEGER,
  sources           JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conversation_id ON ai_messages(conversation_id);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations', 'users', 'departments', 'teams',
    'documents', 'meetings', 'projects', 'tasks', 'goals',
    'kpi_metrics', 'knowledge_nodes', 'subscriptions',
    'workflow_definitions', 'ai_conversations', 'billing_plans'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;
