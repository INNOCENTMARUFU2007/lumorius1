BEGIN;

CREATE TABLE IF NOT EXISTS executive_financial_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  source_chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  team_id UUID,
  transaction_date DATE NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'revenue', 'refund', 'acquisition_cost', 'cost_of_goods_sold',
    'operating_expense', 'other_income', 'tax', 'capital_expenditure'
  )),
  amount NUMERIC(20,6) NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
  evidence_excerpt TEXT NOT NULL CHECK (length(btrim(evidence_excerpt)) BETWEEN 1 AND 4000),
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  fingerprint CHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'committed')),
  proposed_by_id UUID,
  reviewed_by_id UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  source_import_id UUID REFERENCES executive_imports(id) ON DELETE SET NULL,
  target_record_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT executive_financial_candidates_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT executive_financial_candidates_fingerprint_unique UNIQUE (organization_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_executive_financial_candidates_review
  ON executive_financial_candidates (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_executive_financial_candidates_document
  ON executive_financial_candidates (organization_id, document_id, source_chunk_id);

COMMIT;
