BEGIN;

CREATE TABLE IF NOT EXISTS luie_domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  actor_id UUID,
  team_id UUID,
  source_version INTEGER NOT NULL DEFAULT 1,
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT luie_domain_events_event_key_check
    CHECK (length(btrim(event_key)) BETWEEN 1 AND 250),
  CONSTRAINT luie_domain_events_type_check
    CHECK (event_type ~ '^[a-z][a-z0-9]*(\.[a-z0-9_-]+)+$'),
  CONSTRAINT luie_domain_events_aggregate_type_check
    CHECK (aggregate_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  CONSTRAINT luie_domain_events_source_version_check
    CHECK (source_version > 0),
  CONSTRAINT luie_domain_events_schema_version_check
    CHECK (schema_version > 0),
  CONSTRAINT luie_domain_events_payload_object_check
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT uq_luie_domain_events_org_event_key
    UNIQUE (organization_id, event_key),
  CONSTRAINT uq_luie_domain_events_org_id
    UNIQUE (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_luie_domain_events_org_created
  ON luie_domain_events (organization_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_luie_domain_events_aggregate
  ON luie_domain_events (organization_id, aggregate_type, aggregate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_luie_domain_events_type_created
  ON luie_domain_events (organization_id, event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS luie_event_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES luie_domain_events(id) ON DELETE CASCADE,
  consumer_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ,
  worker_id TEXT,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT luie_event_deliveries_consumer_check
    CHECK (consumer_name ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  CONSTRAINT luie_event_deliveries_status_check
    CHECK (status IN ('pending', 'processing', 'retry', 'delivered', 'dead_letter')),
  CONSTRAINT luie_event_deliveries_attempts_check
    CHECK (attempt_count >= 0),
  CONSTRAINT luie_event_deliveries_lease_check
    CHECK (
      (status = 'processing' AND lease_expires_at IS NOT NULL AND worker_id IS NOT NULL)
      OR
      (status <> 'processing' AND lease_expires_at IS NULL AND worker_id IS NULL)
    ),
  CONSTRAINT luie_event_deliveries_delivered_check
    CHECK ((status = 'delivered' AND delivered_at IS NOT NULL) OR status <> 'delivered'),
  CONSTRAINT uq_luie_event_deliveries_event_consumer
    UNIQUE (event_id, consumer_name)
);

CREATE INDEX IF NOT EXISTS idx_luie_event_deliveries_ready
  ON luie_event_deliveries (consumer_name, next_attempt_at, created_at, id)
  WHERE status IN ('pending', 'retry');
CREATE INDEX IF NOT EXISTS idx_luie_event_deliveries_expired_lease
  ON luie_event_deliveries (lease_expires_at, id)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_luie_event_deliveries_dead_letter
  ON luie_event_deliveries (updated_at DESC, id)
  WHERE status = 'dead_letter';

COMMENT ON TABLE luie_domain_events IS
  'Durable tenant-scoped domain event envelope. Source mutations and event inserts must share one database transaction.';
COMMENT ON TABLE luie_event_deliveries IS
  'Independent at-least-once delivery state for each named LUIE consumer. Consumers must be idempotent.';
COMMENT ON COLUMN luie_domain_events.payload IS
  'Minimal structured metadata only. Do not store document bodies, transcripts, credentials, secrets or full financial records.';
COMMENT ON COLUMN luie_domain_events.actor_id IS
  'Opaque historical actor reference; deliberately not an FK so event history survives user deletion.';
COMMENT ON COLUMN luie_domain_events.team_id IS
  'Opaque historical team reference; source adapters must re-check current access before returning source data.';

COMMIT;
