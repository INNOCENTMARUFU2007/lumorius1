BEGIN;

CREATE TABLE IF NOT EXISTS knowledge_decision_approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  decision_type TEXT NOT NULL DEFAULT 'all',
  priority TEXT NOT NULL DEFAULT 'all',
  required_approver_role TEXT NOT NULL,
  approval_due_hours INTEGER NOT NULL,
  allow_delegation BOOLEAN NOT NULL DEFAULT TRUE,
  escalation_repeat_hours INTEGER NOT NULL DEFAULT 24,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT knowledge_decision_approval_policies_org_type_priority_unique
    UNIQUE (organization_id, decision_type, priority),
  CONSTRAINT knowledge_decision_approval_policies_type_check
    CHECK (decision_type IN ('all','strategic','operational','product','technical','financial','customer','people','compliance','other')),
  CONSTRAINT knowledge_decision_approval_policies_priority_check
    CHECK (priority IN ('all','low','medium','high','critical')),
  CONSTRAINT knowledge_decision_approval_policies_role_check
    CHECK (required_approver_role IN ('manager','admin','owner')),
  CONSTRAINT knowledge_decision_approval_policies_due_hours_check
    CHECK (approval_due_hours BETWEEN 1 AND 8760),
  CONSTRAINT knowledge_decision_approval_policies_escalation_hours_check
    CHECK (escalation_repeat_hours BETWEEN 1 AND 720)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_decision_approval_policies_org_active
  ON knowledge_decision_approval_policies (organization_id, is_active, decision_type, priority);

CREATE TABLE IF NOT EXISTS knowledge_decision_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  principal_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delegate_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision_type TEXT NOT NULL DEFAULT 'all',
  priority TEXT NOT NULL DEFAULT 'all',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL,
  granted_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  revoked_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT knowledge_decision_delegations_not_self_check
    CHECK (principal_user_id <> delegate_user_id),
  CONSTRAINT knowledge_decision_delegations_scope_type_check
    CHECK (decision_type IN ('all','strategic','operational','product','technical','financial','customer','people','compliance','other')),
  CONSTRAINT knowledge_decision_delegations_scope_priority_check
    CHECK (priority IN ('all','low','medium','high','critical')),
  CONSTRAINT knowledge_decision_delegations_dates_check
    CHECK (valid_until > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_decision_delegations_delegate_active
  ON knowledge_decision_delegations (organization_id, delegate_user_id, valid_from, valid_until)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_decision_delegations_principal
  ON knowledge_decision_delegations (organization_id, principal_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_decision_governance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision_id UUID REFERENCES knowledge_decisions(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES knowledge_decision_approval_policies(id) ON DELETE SET NULL,
  delegation_id UUID REFERENCES knowledge_decision_delegations(id) ON DELETE SET NULL,
  represented_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT knowledge_decision_governance_events_type_check
    CHECK (event_type IN (
      'approval_policy_created',
      'approval_policy_updated',
      'approval_policy_deactivated',
      'approval_policy_snapshotted',
      'approval_delegation_granted',
      'approval_delegation_revoked',
      'approval_granted',
      'approval_rejected',
      'approval_escalated'
    ))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_decision_governance_events_org_created
  ON knowledge_decision_governance_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_decision_governance_events_decision
  ON knowledge_decision_governance_events (organization_id, decision_id, created_at DESC)
  WHERE decision_id IS NOT NULL;

ALTER TABLE knowledge_decisions
  ADD COLUMN IF NOT EXISTS approval_policy_id UUID,
  ADD COLUMN IF NOT EXISTS approval_required_role TEXT,
  ADD COLUMN IF NOT EXISTS approval_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_delegation_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approval_escalation_repeat_hours INTEGER,
  ADD COLUMN IF NOT EXISTS approval_escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_escalation_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE knowledge_decision_reviews
  ADD COLUMN IF NOT EXISTS delegated_for_id UUID,
  ADD COLUMN IF NOT EXISTS delegation_id UUID;

DO $v410$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'knowledge_decisions_approval_policy_id_fkey'
       AND conrelid = 'knowledge_decisions'::regclass
  ) THEN
    ALTER TABLE knowledge_decisions
      ADD CONSTRAINT knowledge_decisions_approval_policy_id_fkey
      FOREIGN KEY (approval_policy_id)
      REFERENCES knowledge_decision_approval_policies(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'knowledge_decision_reviews_delegated_for_id_fkey'
       AND conrelid = 'knowledge_decision_reviews'::regclass
  ) THEN
    ALTER TABLE knowledge_decision_reviews
      ADD CONSTRAINT knowledge_decision_reviews_delegated_for_id_fkey
      FOREIGN KEY (delegated_for_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'knowledge_decision_reviews_delegation_id_fkey'
       AND conrelid = 'knowledge_decision_reviews'::regclass
  ) THEN
    ALTER TABLE knowledge_decision_reviews
      ADD CONSTRAINT knowledge_decision_reviews_delegation_id_fkey
      FOREIGN KEY (delegation_id) REFERENCES knowledge_decision_delegations(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'knowledge_decisions_approval_required_role_check'
       AND conrelid = 'knowledge_decisions'::regclass
  ) THEN
    ALTER TABLE knowledge_decisions
      ADD CONSTRAINT knowledge_decisions_approval_required_role_check
      CHECK (approval_required_role IS NULL OR approval_required_role IN ('manager','admin','owner'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'knowledge_decisions_approval_escalation_repeat_hours_check'
       AND conrelid = 'knowledge_decisions'::regclass
  ) THEN
    ALTER TABLE knowledge_decisions
      ADD CONSTRAINT knowledge_decisions_approval_escalation_repeat_hours_check
      CHECK (approval_escalation_repeat_hours IS NULL OR approval_escalation_repeat_hours BETWEEN 1 AND 720);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'knowledge_decisions_approval_escalation_count_check'
       AND conrelid = 'knowledge_decisions'::regclass
  ) THEN
    ALTER TABLE knowledge_decisions
      ADD CONSTRAINT knowledge_decisions_approval_escalation_count_check
      CHECK (approval_escalation_count >= 0);
  END IF;
END;
$v410$;

CREATE INDEX IF NOT EXISTS idx_knowledge_decisions_org_approval_due
  ON knowledge_decisions (organization_id, approval_due_at)
  WHERE status = 'proposed' AND approval_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_decision_reviews_delegation
  ON knowledge_decision_reviews (delegation_id)
  WHERE delegation_id IS NOT NULL;

COMMIT;