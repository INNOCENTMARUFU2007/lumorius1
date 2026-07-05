-- ============================================================
-- Lumorius AI — Migration 003: GDPR + Admin Fields
-- ============================================================

-- GDPR deletion tracking fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled
  ON users (deletion_scheduled_at)
  WHERE deletion_scheduled_at IS NOT NULL;

-- Admin roles
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider         VARCHAR(100) NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'connected'
                   CHECK (status IN ('connected', 'disconnected', 'error')),
  config           JSONB NOT NULL DEFAULT '{}',
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  expires_at       TIMESTAMPTZ,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integrations_org ON integrations (organization_id);

-- Notifications table (full)
CREATE TABLE IF NOT EXISTS notifications (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  UUID REFERENCES organizations(id) ON DELETE CASCADE,
  type             VARCHAR(50) NOT NULL DEFAULT 'info'
                   CHECK (type IN ('info','success','warning','error','billing','security','ai')),
  title            VARCHAR(255) NOT NULL,
  body             TEXT,
  action_url       TEXT,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user     ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread   ON notifications (user_id) WHERE read_at IS NULL;

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(255) PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('003_gdpr_admin')
  ON CONFLICT (version) DO NOTHING;
