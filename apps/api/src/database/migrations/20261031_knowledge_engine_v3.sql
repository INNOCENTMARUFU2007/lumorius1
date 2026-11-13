BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Canonical entity identity

ALTER TABLE knowledge_nodes
ADD COLUMN IF NOT EXISTS canonical_key TEXT;

UPDATE knowledge_nodes
SET canonical_key = lower(
    regexp_replace(btrim(label), '\s+', ' ', 'g')
)
WHERE canonical_key IS NULL
  AND type <> 'document'
  AND btrim(COALESCE(label, '')) <> '';

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_canonical
ON knowledge_nodes (organization_id, type, canonical_key);

-- 2. Persistent aliases

CREATE TABLE IF NOT EXISTS knowledge_entity_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    entity_type TEXT NOT NULL,
    node_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    alias TEXT NOT NULL,
    alias_key TEXT NOT NULL,
    is_canonical BOOLEAN NOT NULL DEFAULT FALSE,
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT knowledge_alias_confidence_check
        CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_alias_identity
ON knowledge_entity_aliases (
    organization_id,
    entity_type,
    alias_key
);

CREATE INDEX IF NOT EXISTS idx_knowledge_alias_node
ON knowledge_entity_aliases (organization_id, node_id);

-- Seed canonical labels. Duplicate legacy nodes resolve to
-- the oldest node for their normalized label and entity type.

WITH ranked AS (
    SELECT
        id,
        organization_id,
        type,
        label,
        source_type,
        source_id,
        row_number() OVER (
            PARTITION BY
                organization_id,
                type,
                lower(regexp_replace(btrim(label), '\s+', ' ', 'g'))
            ORDER BY created_at ASC, id ASC
        ) AS position
    FROM knowledge_nodes
    WHERE type <> 'document'
      AND btrim(COALESCE(label, '')) <> ''
)
INSERT INTO knowledge_entity_aliases (
    organization_id,
    entity_type,
    node_id,
    alias,
    alias_key,
    is_canonical,
    source_document_id
)
SELECT
    organization_id,
    type,
    id,
    label,
    lower(regexp_replace(btrim(label), '\s+', ' ', 'g')),
    TRUE,
    CASE
        WHEN source_type = 'document_entity' THEN source_id
        ELSE NULL
    END
FROM ranked
WHERE position = 1
ON CONFLICT (organization_id, entity_type, alias_key)
DO NOTHING;

-- Seed aliases recorded in existing entity properties.

WITH ranked AS (
    SELECT
        id,
        organization_id,
        type,
        properties,
        row_number() OVER (
            PARTITION BY
                organization_id,
                type,
                lower(regexp_replace(btrim(label), '\s+', ' ', 'g'))
            ORDER BY created_at ASC, id ASC
        ) AS position
    FROM knowledge_nodes
    WHERE type <> 'document'
      AND btrim(COALESCE(label, '')) <> ''
)
INSERT INTO knowledge_entity_aliases (
    organization_id,
    entity_type,
    node_id,
    alias,
    alias_key,
    is_canonical
)
SELECT
    ranked.organization_id,
    ranked.type,
    ranked.id,
    btrim(alias_value.value),
    lower(regexp_replace(btrim(alias_value.value), '\s+', ' ', 'g')),
    FALSE
FROM ranked
CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
        WHEN jsonb_typeof(ranked.properties->'aliases') = 'array'
        THEN ranked.properties->'aliases'
        ELSE '[]'::jsonb
    END
) AS alias_value(value)
WHERE ranked.position = 1
  AND btrim(alias_value.value) <> ''
ON CONFLICT (organization_id, entity_type, alias_key)
DO NOTHING;

-- 3. Persistent evidence and temporal provenance

CREATE TABLE IF NOT EXISTS knowledge_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    node_id UUID REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    edge_id UUID REFERENCES knowledge_edges(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    evidence_type TEXT NOT NULL,
    source_chunk_ids UUID[] NOT NULL DEFAULT '{}',
    confidence NUMERIC(5,4) NOT NULL DEFAULT 0.7,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'active',
    superseded_at TIMESTAMPTZ,
    superseded_by UUID REFERENCES knowledge_evidence(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT knowledge_evidence_target_check
        CHECK (num_nonnulls(node_id, edge_id) = 1),

    CONSTRAINT knowledge_evidence_confidence_check
        CHECK (confidence >= 0 AND confidence <= 1),

    CONSTRAINT knowledge_evidence_status_check
        CHECK (status IN ('active', 'superseded', 'disputed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_node_evidence
ON knowledge_evidence (
    organization_id,
    node_id,
    document_id,
    evidence_type
)
WHERE node_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_edge_evidence
ON knowledge_evidence (
    organization_id,
    edge_id,
    document_id,
    evidence_type
)
WHERE edge_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_evidence_document
ON knowledge_evidence (organization_id, document_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_evidence_node
ON knowledge_evidence (organization_id, node_id)
WHERE node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_evidence_edge
ON knowledge_evidence (organization_id, edge_id)
WHERE edge_id IS NOT NULL;

-- Seed entity evidence from existing CONTAINS edges.

INSERT INTO knowledge_evidence (
    organization_id,
    node_id,
    document_id,
    evidence_type,
    source_chunk_ids,
    confidence,
    metadata
)
SELECT
    edge.organization_id,
    edge.target_id,
    document_node.source_id,
    'document_extraction',
    ARRAY(
        SELECT chunk_value.value::uuid
        FROM jsonb_array_elements_text(
            CASE
                WHEN jsonb_typeof(edge.metadata->'sourceChunkIds') = 'array'
                THEN edge.metadata->'sourceChunkIds'
                ELSE '[]'::jsonb
            END
        ) AS chunk_value(value)
        WHERE chunk_value.value ~*
            '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
    LEAST(1.0, GREATEST(0.0, edge.weight)),
    COALESCE(edge.metadata, '{}'::jsonb)
FROM knowledge_edges edge
JOIN knowledge_nodes document_node
  ON document_node.id = edge.source_id
 AND document_node.organization_id = edge.organization_id
 AND document_node.type = 'document'
JOIN documents document
  ON document.id = document_node.source_id
 AND document.organization_id = edge.organization_id
WHERE edge.relationship = 'CONTAINS'
ON CONFLICT (
    organization_id, node_id, document_id, evidence_type
)
WHERE node_id IS NOT NULL
DO UPDATE SET
    source_chunk_ids = ARRAY(
        SELECT DISTINCT chunk_id
        FROM unnest(
            knowledge_evidence.source_chunk_ids ||
            EXCLUDED.source_chunk_ids
        ) AS chunks(chunk_id)
    ),
    confidence = GREATEST(
        knowledge_evidence.confidence,
        EXCLUDED.confidence
    ),
    last_seen_at = NOW(),
    metadata = knowledge_evidence.metadata || EXCLUDED.metadata,
    updated_at = NOW();

-- Seed relationship evidence from extraction metadata.

INSERT INTO knowledge_evidence (
    organization_id,
    edge_id,
    document_id,
    evidence_type,
    source_chunk_ids,
    confidence,
    metadata
)
SELECT
    edge.organization_id,
    edge.id,
    document.id,
    COALESCE(
        NULLIF(edge.metadata->>'evidenceType', ''),
        'legacy_relationship'
    ),
    ARRAY(
        SELECT chunk_value.value::uuid
        FROM jsonb_array_elements_text(
            CASE
                WHEN jsonb_typeof(edge.metadata->'sourceChunkIds') = 'array'
                THEN edge.metadata->'sourceChunkIds'
                ELSE '[]'::jsonb
            END
        ) AS chunk_value(value)
        WHERE chunk_value.value ~*
            '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
    LEAST(1.0, GREATEST(0.0, edge.weight)),
    COALESCE(edge.metadata, '{}'::jsonb)
FROM knowledge_edges edge
LEFT JOIN knowledge_nodes document_node
  ON document_node.id = edge.source_id
 AND document_node.organization_id = edge.organization_id
 AND document_node.type = 'document'
JOIN documents document
  ON document.organization_id = edge.organization_id
 AND document.id = CASE
    WHEN edge.metadata->>'sourceDocumentId' ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (edge.metadata->>'sourceDocumentId')::uuid
    ELSE document_node.source_id
 END
WHERE edge.relationship <> 'CONTAINS'
ON CONFLICT (
    organization_id, edge_id, document_id, evidence_type
)
WHERE edge_id IS NOT NULL
DO UPDATE SET
    source_chunk_ids = ARRAY(
        SELECT DISTINCT chunk_id
        FROM unnest(
            knowledge_evidence.source_chunk_ids ||
            EXCLUDED.source_chunk_ids
        ) AS chunks(chunk_id)
    ),
    confidence = GREATEST(
        knowledge_evidence.confidence,
        EXCLUDED.confidence
    ),
    last_seen_at = NOW(),
    metadata = knowledge_evidence.metadata || EXCLUDED.metadata,
    updated_at = NOW();

-- 4. Durable extraction run state and worker leases

CREATE TABLE IF NOT EXISTS knowledge_extraction_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    extraction_version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,
    worker_id TEXT,
    entity_count INTEGER NOT NULL DEFAULT 0,
    relationship_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT knowledge_extraction_run_status_check
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

    CONSTRAINT knowledge_extraction_version_check
        CHECK (extraction_version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_extraction_document_version
ON knowledge_extraction_runs (
    organization_id,
    document_id,
    extraction_version
);

CREATE INDEX IF NOT EXISTS idx_knowledge_extraction_pending
ON knowledge_extraction_runs (status, lease_expires_at);

-- 5. Consolidate duplicate relationships while retaining evidence.

CREATE TEMP TABLE _knowledge_edge_dedupe
ON COMMIT DROP AS
WITH ranked AS (
    SELECT
        id,
        organization_id,
        first_value(id) OVER (
            PARTITION BY organization_id, source_id, target_id, relationship
            ORDER BY created_at ASC, id ASC
        ) AS survivor_id,
        row_number() OVER (
            PARTITION BY organization_id, source_id, target_id, relationship
            ORDER BY created_at ASC, id ASC
        ) AS position
    FROM knowledge_edges
)
SELECT
    id AS duplicate_id,
    organization_id,
    survivor_id
FROM ranked
WHERE position > 1;

-- Merge evidence from duplicate edges into the surviving edge.

INSERT INTO knowledge_evidence (
    organization_id,
    edge_id,
    document_id,
    evidence_type,
    source_chunk_ids,
    confidence,
    first_seen_at,
    last_seen_at,
    status,
    metadata
)
SELECT
    evidence.organization_id,
    mapping.survivor_id,
    evidence.document_id,
    evidence.evidence_type,
    evidence.source_chunk_ids,
    evidence.confidence,
    evidence.first_seen_at,
    evidence.last_seen_at,
    evidence.status,
    evidence.metadata
FROM knowledge_evidence evidence
JOIN _knowledge_edge_dedupe mapping
  ON mapping.duplicate_id = evidence.edge_id
ON CONFLICT (
    organization_id, edge_id, document_id, evidence_type
)
WHERE edge_id IS NOT NULL
DO UPDATE SET
    source_chunk_ids = ARRAY(
        SELECT DISTINCT chunk_id
        FROM unnest(
            knowledge_evidence.source_chunk_ids ||
            EXCLUDED.source_chunk_ids
        ) AS chunks(chunk_id)
    ),
    confidence = GREATEST(
        knowledge_evidence.confidence,
        EXCLUDED.confidence
    ),
    first_seen_at = LEAST(
        knowledge_evidence.first_seen_at,
        EXCLUDED.first_seen_at
    ),
    last_seen_at = GREATEST(
        knowledge_evidence.last_seen_at,
        EXCLUDED.last_seen_at
    ),
    metadata = knowledge_evidence.metadata || EXCLUDED.metadata,
    updated_at = NOW();

DELETE FROM knowledge_evidence evidence
USING _knowledge_edge_dedupe mapping
WHERE evidence.edge_id = mapping.duplicate_id;

DELETE FROM knowledge_edges edge
USING _knowledge_edge_dedupe mapping
WHERE edge.id = mapping.duplicate_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_edges_identity
ON knowledge_edges (
    organization_id,
    source_id,
    target_id,
    relationship
);

COMMIT;