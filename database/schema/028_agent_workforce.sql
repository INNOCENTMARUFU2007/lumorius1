BEGIN;

ALTER TABLE briefing_preferences DROP CONSTRAINT IF EXISTS briefing_preferences_cadence_check;
ALTER TABLE briefing_preferences ADD CONSTRAINT briefing_preferences_cadence_check CHECK (cadence IN ('off','daily','weekly','monthly'));

ALTER TABLE integration_connections ADD COLUMN authorization_revision uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE integration_sync_items ADD COLUMN crm_metadata jsonb;
ALTER TABLE integration_sync_items ADD COLUMN crm_authorization_revision uuid;

ALTER TABLE executive_imports DROP CONSTRAINT IF EXISTS executive_imports_dataset_type_check;
ALTER TABLE executive_imports ADD CONSTRAINT executive_imports_dataset_type_check CHECK (dataset_type IN ('transactions','contracts','pipeline','campaigns','cash'));
CREATE UNIQUE INDEX executive_campaign_committed_key ON executive_import_rows(organization_id,fingerprint)
  WHERE validation_status='committed' AND normalized_data ? 'campaign_key';

CREATE UNIQUE INDEX executive_cash_committed_key ON executive_import_rows(organization_id,fingerprint)
  WHERE validation_status='committed' AND normalized_data ? 'cash_key';

CREATE INDEX IF NOT EXISTS workflow_runs_org_started_idx ON workflow_runs(organization_id,started_at DESC);

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  initiated_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent text NOT NULL CHECK (agent IN ('chief-of-staff','integration-engineer','financial-analyst','operations-manager','sales-development')),
  mission text NOT NULL CHECK (char_length(mission) BETWEEN 8 AND 2000),
  intent text NOT NULL CHECK (intent IN ('briefing','goals','analysis','marketing')),
  market_country text CHECK (market_country IS NULL OR (intent='marketing' AND market_country ~ '^[A-Z]{2}$')),
  idempotency_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled','awaiting_approval','applied')),
  artifact jsonb,
  artifact_version integer NOT NULL DEFAULT 0,
  decision_id uuid,
  receipt jsonb,
  error_code text,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, initiated_by, idempotency_key),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, decision_id)
);

CREATE TABLE agent_run_steps (
  organization_id uuid NOT NULL,
  run_id uuid NOT NULL,
  id bigint GENERATED ALWAYS AS IDENTITY,
  stage text NOT NULL,
  status text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, run_id, id),
  FOREIGN KEY (organization_id, run_id) REFERENCES agent_runs(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX agent_runs_actor_history ON agent_runs (organization_id, initiated_by, created_at DESC, id DESC);
CREATE INDEX agent_runs_pending ON agent_runs (updated_at, id) WHERE status IN ('queued','running');
CREATE INDEX agent_runs_org_active ON agent_runs (organization_id) WHERE status IN ('queued','running');

CREATE FUNCTION lock_agent_decision_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.title,OLD.description,OLD.rationale,OLD.decision_type,OLD.priority,OLD.owner_id,OLD.team_id,OLD.expected_outcome)
     IS DISTINCT FROM ROW(NEW.title,NEW.description,NEW.rationale,NEW.decision_type,NEW.priority,NEW.owner_id,NEW.team_id,NEW.expected_outcome)
     AND EXISTS (SELECT 1 FROM agent_runs WHERE organization_id=OLD.organization_id AND decision_id=OLD.id)
  THEN
    RAISE EXCEPTION 'An agent-backed proposal cannot be edited. Withdraw it and create a new proposal.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lock_agent_decision_proposal
  BEFORE UPDATE ON knowledge_decisions FOR EACH ROW EXECUTE FUNCTION lock_agent_decision_proposal();

COMMIT;
