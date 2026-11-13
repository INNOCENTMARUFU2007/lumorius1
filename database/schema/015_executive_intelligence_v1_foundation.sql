BEGIN;

CREATE TABLE executive_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_id uuid NOT NULL,
  dataset_type text NOT NULL CHECK (dataset_type IN ('transactions', 'contracts', 'pipeline')),
  status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded', 'mapping_required', 'validated', 'committed', 'failed')),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  file_sha256 char(64) NOT NULL CHECK (file_sha256 ~ '^[a-f0-9]{64}$'),
  source_headers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_headers) = 'array'),
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(column_mapping) = 'object'),
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  valid_row_count integer NOT NULL DEFAULT 0 CHECK (valid_row_count >= 0),
  invalid_row_count integer NOT NULL DEFAULT 0 CHECK (invalid_row_count >= 0),
  duplicate_row_count integer NOT NULL DEFAULT 0 CHECK (duplicate_row_count >= 0),
  validation_version integer NOT NULL DEFAULT 1 CHECK (validation_version > 0),
  validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(validation_summary) = 'object'),
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_executive_imports_org_id UNIQUE (organization_id, id),
  CONSTRAINT ck_executive_import_counts CHECK (
    valid_row_count + invalid_row_count + duplicate_row_count <= row_count
  )
);

CREATE INDEX idx_executive_imports_org_created
  ON executive_imports (organization_id, created_at DESC);
CREATE INDEX idx_executive_imports_org_status
  ON executive_imports (organization_id, status, created_at DESC);

CREATE TABLE executive_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  import_id uuid NOT NULL,
  row_number integer NOT NULL CHECK (row_number > 0),
  raw_data jsonb NOT NULL CHECK (jsonb_typeof(raw_data) = 'object'),
  normalized_data jsonb CHECK (normalized_data IS NULL OR jsonb_typeof(normalized_data) = 'object'),
  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'invalid', 'duplicate', 'committed')),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors) = 'array'),
  fingerprint char(64) CHECK (fingerprint IS NULL OR fingerprint ~ '^[a-f0-9]{64}$'),
  target_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_executive_import_rows_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_executive_import_rows_number UNIQUE (organization_id, import_id, row_number),
  CONSTRAINT fk_executive_import_rows_import FOREIGN KEY (organization_id, import_id)
    REFERENCES executive_imports (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_executive_import_rows_import_status
  ON executive_import_rows (organization_id, import_id, validation_status, row_number);
CREATE INDEX idx_executive_import_rows_fingerprint
  ON executive_import_rows (organization_id, fingerprint) WHERE fingerprint IS NOT NULL;

CREATE TABLE executive_financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_import_id uuid NOT NULL,
  source_import_row_id uuid NOT NULL,
  transaction_date date NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN (
    'revenue', 'refund', 'acquisition_cost', 'cost_of_goods_sold',
    'operating_expense', 'other_income', 'tax', 'capital_expenditure'
  )),
  amount numeric(20,6) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  customer_key text,
  external_reference text,
  description text,
  fingerprint char(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_executive_transactions_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_executive_transactions_import_row UNIQUE (organization_id, source_import_row_id),
  CONSTRAINT uq_executive_transactions_fingerprint UNIQUE (organization_id, fingerprint),
  CONSTRAINT fk_executive_transactions_import FOREIGN KEY (organization_id, source_import_id)
    REFERENCES executive_imports (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_executive_transactions_import_row FOREIGN KEY (organization_id, source_import_row_id)
    REFERENCES executive_import_rows (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_executive_transactions_org_date
  ON executive_financial_transactions (organization_id, currency, transaction_date DESC);
CREATE INDEX idx_executive_transactions_org_type_date
  ON executive_financial_transactions (organization_id, transaction_type, transaction_date DESC);
CREATE INDEX idx_executive_transactions_org_customer
  ON executive_financial_transactions (organization_id, customer_key, transaction_date DESC)
  WHERE customer_key IS NOT NULL;

CREATE TABLE executive_customer_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_import_id uuid NOT NULL,
  source_import_row_id uuid NOT NULL,
  external_contract_id text NOT NULL CHECK (length(BTRIM(external_contract_id)) BETWEEN 1 AND 200),
  customer_key text NOT NULL CHECK (length(BTRIM(customer_key)) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('trialing', 'active', 'paused', 'cancelled', 'expired')),
  recurring_amount numeric(20,6) NOT NULL CHECK (recurring_amount > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  billing_interval text NOT NULL CHECK (billing_interval IN ('weekly', 'monthly', 'quarterly', 'annual')),
  start_date date NOT NULL,
  end_date date,
  cancelled_at date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_executive_contracts_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_executive_contracts_external_id UNIQUE (organization_id, external_contract_id),
  CONSTRAINT uq_executive_contracts_import_row UNIQUE (organization_id, source_import_row_id),
  CONSTRAINT ck_executive_contract_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT ck_executive_contract_cancel_date CHECK (cancelled_at IS NULL OR cancelled_at >= start_date),
  CONSTRAINT fk_executive_contracts_import FOREIGN KEY (organization_id, source_import_id)
    REFERENCES executive_imports (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_executive_contracts_import_row FOREIGN KEY (organization_id, source_import_row_id)
    REFERENCES executive_import_rows (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_executive_contracts_org_status
  ON executive_customer_contracts (organization_id, status, currency);
CREATE INDEX idx_executive_contracts_org_customer
  ON executive_customer_contracts (organization_id, customer_key);
CREATE INDEX idx_executive_contracts_org_start_cancel
  ON executive_customer_contracts (organization_id, start_date, cancelled_at);

CREATE TABLE executive_pipeline_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_import_id uuid NOT NULL,
  source_import_row_id uuid NOT NULL,
  external_opportunity_id text NOT NULL CHECK (length(BTRIM(external_opportunity_id)) BETWEEN 1 AND 200),
  customer_key text,
  title text NOT NULL CHECK (length(BTRIM(title)) BETWEEN 1 AND 500),
  stage text NOT NULL CHECK (length(BTRIM(stage)) BETWEEN 1 AND 100),
  status text NOT NULL CHECK (status IN ('open', 'won', 'lost')),
  amount numeric(20,6) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  probability numeric(6,5) NOT NULL CHECK (probability >= 0 AND probability <= 1),
  expected_close_date date,
  closed_at date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_executive_pipeline_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_executive_pipeline_external_id UNIQUE (organization_id, external_opportunity_id),
  CONSTRAINT uq_executive_pipeline_import_row UNIQUE (organization_id, source_import_row_id),
  CONSTRAINT fk_executive_pipeline_import FOREIGN KEY (organization_id, source_import_id)
    REFERENCES executive_imports (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_executive_pipeline_import_row FOREIGN KEY (organization_id, source_import_row_id)
    REFERENCES executive_import_rows (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX idx_executive_pipeline_org_status_close
  ON executive_pipeline_opportunities (organization_id, status, expected_close_date);
CREATE INDEX idx_executive_pipeline_org_currency
  ON executive_pipeline_opportunities (organization_id, currency, status);

CREATE TABLE executive_metric_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric_key text NOT NULL CHECK (metric_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  target_value numeric(24,8) NOT NULL,
  unit text NOT NULL CHECK (length(BTRIM(unit)) BETWEEN 1 AND 40),
  currency char(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  target_period text NOT NULL CHECK (target_period IN ('monthly', 'quarterly', 'annual', 'custom')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  owner_id uuid,
  direction text NOT NULL DEFAULT 'higher_is_better'
    CHECK (direction IN ('higher_is_better', 'lower_is_better')),
  alert_threshold_pct numeric(8,3) CHECK (alert_threshold_pct IS NULL OR alert_threshold_pct BETWEEN 0 AND 1000),
  minimum_sample_size integer NOT NULL DEFAULT 1 CHECK (minimum_sample_size > 0),
  created_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_executive_metric_targets_org_id UNIQUE (organization_id, id),
  CONSTRAINT ck_executive_metric_target_dates CHECK (period_end >= period_start)
);

CREATE UNIQUE INDEX uq_executive_metric_targets_scope
  ON executive_metric_targets (
    organization_id, metric_key, target_period, period_start, period_end,
    COALESCE(currency, '')
  );
CREATE INDEX idx_executive_metric_targets_org_period
  ON executive_metric_targets (organization_id, period_start, period_end);

CREATE TABLE executive_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id uuid,
  event_type text NOT NULL CHECK (length(BTRIM(event_type)) BETWEEN 1 AND 100),
  entity_type text NOT NULL CHECK (length(BTRIM(entity_type)) BETWEEN 1 AND 100),
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_executive_audit_events_org_id UNIQUE (organization_id, id)
);

CREATE INDEX idx_executive_audit_events_org_created
  ON executive_audit_events (organization_id, created_at DESC);
CREATE INDEX idx_executive_audit_events_org_entity
  ON executive_audit_events (organization_id, entity_type, entity_id, created_at DESC);

COMMENT ON TABLE executive_imports IS
  'Tenant-scoped, staged data imports for Executive Intelligence. Files are parsed and mapped before commit.';
COMMENT ON TABLE executive_import_rows IS
  'Raw and normalized import rows with deterministic validation and duplicate outcomes.';
COMMENT ON TABLE executive_financial_transactions IS
  'Imported organisation financial facts; deliberately separate from Lumorius platform invoices and subscriptions.';
COMMENT ON TABLE executive_customer_contracts IS
  'Imported recurring customer contracts used for contract-based revenue, retention and churn calculations.';
COMMENT ON TABLE executive_pipeline_opportunities IS
  'Imported sales opportunities used for explicitly weighted pipeline metrics.';
COMMENT ON TABLE executive_metric_targets IS
  'Organisation-specific KPI targets, owners, periods, thresholds and minimum sample requirements.';
COMMENT ON TABLE executive_audit_events IS
  'Append-only audit records for Executive Intelligence imports, mappings, commits and configuration changes.';


-- EXECUTIVE INTELLIGENCE V1 TENANT HARDENING
-- PostgreSQL 15 supports column-scoped SET NULL for composite foreign keys.
-- User relationships must resolve inside the same organization.

ALTER TABLE executive_import_rows
  ADD CONSTRAINT uq_executive_import_rows_org_import_id
  UNIQUE (organization_id, import_id, id);

ALTER TABLE executive_imports
  ADD CONSTRAINT fk_executive_imports_creator_same_org
  FOREIGN KEY (organization_id, created_by_id)
  REFERENCES users (organization_id, id) ON DELETE RESTRICT;

ALTER TABLE executive_financial_transactions
  ADD CONSTRAINT fk_executive_transactions_creator_same_org
  FOREIGN KEY (organization_id, created_by_id)
  REFERENCES users (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_executive_transactions_row_same_import
  FOREIGN KEY (organization_id, source_import_id, source_import_row_id)
  REFERENCES executive_import_rows (organization_id, import_id, id) ON DELETE RESTRICT;

ALTER TABLE executive_customer_contracts
  ADD CONSTRAINT fk_executive_contracts_creator_same_org
  FOREIGN KEY (organization_id, created_by_id)
  REFERENCES users (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_executive_contracts_row_same_import
  FOREIGN KEY (organization_id, source_import_id, source_import_row_id)
  REFERENCES executive_import_rows (organization_id, import_id, id) ON DELETE RESTRICT;

ALTER TABLE executive_pipeline_opportunities
  ADD CONSTRAINT fk_executive_pipeline_creator_same_org
  FOREIGN KEY (organization_id, created_by_id)
  REFERENCES users (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_executive_pipeline_row_same_import
  FOREIGN KEY (organization_id, source_import_id, source_import_row_id)
  REFERENCES executive_import_rows (organization_id, import_id, id) ON DELETE RESTRICT;

ALTER TABLE executive_metric_targets
  ADD CONSTRAINT fk_executive_targets_creator_same_org
  FOREIGN KEY (organization_id, created_by_id)
  REFERENCES users (organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_executive_targets_owner_same_org
  FOREIGN KEY (organization_id, owner_id)
  REFERENCES users (organization_id, id) ON DELETE SET NULL (owner_id);

ALTER TABLE executive_audit_events
  ADD CONSTRAINT fk_executive_audit_actor_same_org
  FOREIGN KEY (organization_id, actor_id)
  REFERENCES users (organization_id, id) ON DELETE SET NULL (actor_id);

CREATE INDEX idx_executive_imports_org_creator
  ON executive_imports (organization_id, created_by_id);
CREATE INDEX idx_executive_transactions_org_creator
  ON executive_financial_transactions (organization_id, created_by_id);
CREATE INDEX idx_executive_contracts_org_creator
  ON executive_customer_contracts (organization_id, created_by_id);
CREATE INDEX idx_executive_pipeline_org_creator
  ON executive_pipeline_opportunities (organization_id, created_by_id);
CREATE INDEX idx_executive_targets_org_creator
  ON executive_metric_targets (organization_id, created_by_id);
CREATE INDEX idx_executive_targets_org_owner
  ON executive_metric_targets (organization_id, owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_executive_audit_org_actor
  ON executive_audit_events (organization_id, actor_id) WHERE actor_id IS NOT NULL;
COMMIT;