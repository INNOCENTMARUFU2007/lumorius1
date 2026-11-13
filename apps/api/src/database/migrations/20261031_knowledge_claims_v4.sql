BEGIN;

ALTER TABLE knowledge_extraction_runs
  ADD COLUMN IF NOT EXISTS claim_count INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_nodes_org_id
  ON knowledge_nodes (organization_id, id);

CREATE TABLE IF NOT EXISTS knowledge_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subject_node_id UUID NULL,
  subject_text TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  predicate TEXT NOT NULL,
  predicate_key TEXT NOT NULL,
  object_text TEXT NOT NULL,
  object_key TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'text',
  is_negated BOOLEAN NOT NULL DEFAULT FALSE,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.7,
  status TEXT NOT NULL DEFAULT 'active',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT knowledge_claims_subject_node_org_fkey
    FOREIGN KEY (organization_id, subject_node_id)
    REFERENCES knowledge_nodes (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT knowledge_claims_subject_check CHECK (length(btrim(subject_text)) > 0),
  CONSTRAINT knowledge_claims_subject_key_check CHECK (length(btrim(subject_key)) > 0),
  CONSTRAINT knowledge_claims_predicate_check CHECK (length(btrim(predicate_key)) > 0),
  CONSTRAINT knowledge_claims_object_check CHECK (length(btrim(object_text)) > 0),
  CONSTRAINT knowledge_claims_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT knowledge_claims_value_type_check CHECK (
    value_type IN ('text', 'number', 'currency', 'date', 'boolean', 'percentage', 'status')
  ),
  CONSTRAINT knowledge_claims_status_check CHECK (
    status IN ('active', 'superseded', 'archived')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_claims_org_id
  ON knowledge_claims (organization_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_claim_identity
  ON knowledge_claims (
    organization_id,
    subject_key,
    predicate_key,
    object_key,
    value_type,
    is_negated
  );

CREATE INDEX IF NOT EXISTS idx_knowledge_claims_subject
  ON knowledge_claims (organization_id, subject_key);

CREATE INDEX IF NOT EXISTS idx_knowledge_claims_subject_node
  ON knowledge_claims (organization_id, subject_node_id)
  WHERE subject_node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_claims_predicate
  ON knowledge_claims (organization_id, predicate_key);

CREATE INDEX IF NOT EXISTS idx_knowledge_claims_status_seen
  ON knowledge_claims (organization_id, status, last_seen_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_organization_id
  ON documents (organization_id, id);

CREATE TABLE IF NOT EXISTS knowledge_claim_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  claim_id UUID NOT NULL,
  document_id UUID NOT NULL,
  source_chunk_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  evidence_quote TEXT NOT NULL,
  stance TEXT NOT NULL DEFAULT 'supports',
  evidence_hash TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.7,
  extraction_version INTEGER NOT NULL DEFAULT 3,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT knowledge_claim_evidence_stance_check CHECK (
    stance IN ('supports', 'refutes', 'contextual')
  ),
  CONSTRAINT knowledge_claim_evidence_confidence_check CHECK (
    confidence >= 0 AND confidence <= 1
  ),
  CONSTRAINT knowledge_claim_evidence_version_check CHECK (extraction_version > 0),
  CONSTRAINT knowledge_claim_evidence_quote_check CHECK (length(btrim(evidence_quote)) >= 8),
  CONSTRAINT knowledge_claim_evidence_chunks_check CHECK (cardinality(source_chunk_ids) > 0),
  CONSTRAINT knowledge_claim_evidence_claim_org_fkey
    FOREIGN KEY (organization_id, claim_id)
    REFERENCES knowledge_claims (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT knowledge_claim_evidence_document_org_fkey
    FOREIGN KEY (organization_id, document_id)
    REFERENCES documents (organization_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_claim_evidence_identity
  ON knowledge_claim_evidence (
    organization_id,
    claim_id,
    document_id,
    stance,
    evidence_hash
  );

CREATE INDEX IF NOT EXISTS idx_knowledge_claim_evidence_claim
  ON knowledge_claim_evidence (organization_id, claim_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_claim_evidence_document
  ON knowledge_claim_evidence (organization_id, document_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_claim_evidence_chunks
  ON knowledge_claim_evidence USING GIN (source_chunk_ids);

COMMIT;