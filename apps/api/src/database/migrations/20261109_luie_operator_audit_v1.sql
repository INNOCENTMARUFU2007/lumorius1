BEGIN;

CREATE TABLE IF NOT EXISTS luie_operator_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL,
  action TEXT NOT NULL,
  delivery_id UUID,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT luie_operator_audit_action_check
    CHECK (action IN ('delivery.retry')),
  CONSTRAINT luie_operator_audit_reason_check
    CHECK (length(btrim(reason)) BETWEEN 8 AND 1000),
  CONSTRAINT luie_operator_audit_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_luie_operator_audit_org_created
  ON luie_operator_audit (organization_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_luie_operator_audit_delivery
  ON luie_operator_audit (organization_id, delivery_id, created_at DESC)
  WHERE delivery_id IS NOT NULL;

COMMENT ON TABLE luie_operator_audit IS
  'Tenant-scoped audit trail for privileged LUIE operations. Delivery references are intentionally not foreign keys so audit history survives event retention.';
COMMENT ON COLUMN luie_operator_audit.actor_id IS
  'Opaque actor identifier captured at the time of the operator action.';

COMMIT;