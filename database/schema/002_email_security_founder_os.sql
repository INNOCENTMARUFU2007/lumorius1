
-- ============================================================
-- Lumorius — Migration 002
-- Email Verification, Security, Founder OS, API Keys, Audit
-- ============================================================

-- ---- Email verification tokens ------------------------------

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evt_token
  ON email_verification_tokens(token);

CREATE INDEX IF NOT EXISTS idx_evt_user_id
  ON email_verification_tokens(user_id);


-- ---- Password-reset tokens -----------------------------------

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_token
  ON password_reset_tokens(token);

CREATE INDEX IF NOT EXISTS idx_prt_user_id
  ON password_reset_tokens(user_id);


-- ---- Login attempt tracking ----------------------------------

CREATE TABLE IF NOT EXISTS login_attempts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       VARCHAR(255) NOT NULL,
  ip_address  INET NOT NULL,
  success     BOOLEAN NOT NULL DEFAULT FALSE,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_la_email
  ON login_attempts(email);

CREATE INDEX IF NOT EXISTS idx_la_ip
  ON login_attempts(ip_address);

CREATE INDEX IF NOT EXISTS idx_la_created_at
  ON login_attempts(created_at);


-- ---- Audit logs ----------------------------------------------

-- Keep these types and delete rules aligned with the base schema.

CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  resource_type   TEXT,
  resource_id     TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_org_id
  ON audit_logs(organization_id);

CREATE INDEX IF NOT EXISTS idx_audit_user_id
  ON audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_action
  ON audit_logs(action);

CREATE INDEX IF NOT EXISTS idx_audit_created_at
  ON audit_logs(created_at);


-- ---- API Keys -------------------------------------------------

-- IMPORTANT:
-- The canonical owner column is created_by_id, not user_id.
-- This matches database/schema/001_initial.sql and the live DB.

CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  key_prefix      VARCHAR(20) NOT NULL,
  scopes          TEXT[] NOT NULL DEFAULT '{}',
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org
  ON api_keys(organization_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
  ON api_keys(key_hash);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix
  ON api_keys(key_prefix);

CREATE INDEX IF NOT EXISTS idx_api_keys_created_by_id
  ON api_keys(created_by_id);


-- ---- OKRs: Objectives ----------------------------------------

CREATE TABLE IF NOT EXISTS objectives (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  status          VARCHAR(50) NOT NULL DEFAULT 'on_track',
  progress        NUMERIC(5,2) NOT NULL DEFAULT 0,
  quarter         VARCHAR(10) NOT NULL,
  year            INTEGER NOT NULL,
  due_date        DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---- Key Results ---------------------------------------------

CREATE TABLE IF NOT EXISTS key_results (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id    UUID NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  metric_type     VARCHAR(50) NOT NULL DEFAULT 'percentage',
  current_value   NUMERIC(12,2) NOT NULL DEFAULT 0,
  target_value    NUMERIC(12,2) NOT NULL,
  start_value     NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit            VARCHAR(50),
  progress        NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN target_value = start_value THEN 0
      ELSE LEAST(
        100,
        GREATEST(
          0,
          (current_value - start_value)
            / NULLIF(target_value - start_value, 0) * 100
        )
      )
    END
  ) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_objectives_org_quarter_year
  ON objectives(organization_id, quarter, year);

CREATE INDEX IF NOT EXISTS idx_key_results_objective_id
  ON key_results(objective_id);


-- ---- KPI Snapshots -------------------------------------------

CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date   DATE NOT NULL,
  metric_key      VARCHAR(100) NOT NULL,
  metric_value    NUMERIC(20,4),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, snapshot_date, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_kpi_org_date
  ON kpi_snapshots(organization_id, snapshot_date DESC);


-- ---- Business Health Scores ----------------------------------

-- NULL means a score cannot yet be calculated from available data.
-- Do not use a fabricated zero or a default score for missing data.

CREATE TABLE IF NOT EXISTS health_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overall_score   NUMERIC(5,2),
  financial_score NUMERIC(5,2),
  growth_score    NUMERIC(5,2),
  team_score      NUMERIC(5,2),
  product_score   NUMERIC(5,2),
  ai_insights     TEXT,
  breakdown       JSONB NOT NULL DEFAULT '{}'
);

-- Also correct an existing table created by an earlier version
-- of this migration. CREATE TABLE IF NOT EXISTS alone cannot
-- change existing column constraints or defaults.

ALTER TABLE health_scores
  ALTER COLUMN overall_score DROP NOT NULL,
  ALTER COLUMN financial_score DROP NOT NULL,
  ALTER COLUMN growth_score DROP NOT NULL,
  ALTER COLUMN team_score DROP NOT NULL,
  ALTER COLUMN product_score DROP NOT NULL;

ALTER TABLE health_scores
  ALTER COLUMN overall_score DROP DEFAULT,
  ALTER COLUMN financial_score DROP DEFAULT,
  ALTER COLUMN growth_score DROP DEFAULT,
  ALTER COLUMN team_score DROP DEFAULT,
  ALTER COLUMN product_score DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_hs_org_scored
  ON health_scores(organization_id, scored_at DESC);


-- ---- Usage Metering ------------------------------------------

CREATE TABLE IF NOT EXISTS usage_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  metric          VARCHAR(100) NOT NULL,
  quantity        NUMERIC(12,4) NOT NULL DEFAULT 1,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_org_metric
  ON usage_records(organization_id, metric, created_at DESC);


-- ---- User security/profile columns ---------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'UTC';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locale VARCHAR(20) DEFAULT 'en';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
