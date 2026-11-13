BEGIN;

CREATE TABLE IF NOT EXISTS knowledge_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    claim_a_id UUID NOT NULL,
    claim_b_id UUID NOT NULL,
    conflict_key TEXT NOT NULL,
    conflict_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'proposed',
    detection_reason TEXT NOT NULL,
    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    resolution_note TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT knowledge_conflicts_distinct_claims_check
        CHECK (claim_a_id <> claim_b_id),
    CONSTRAINT knowledge_conflicts_type_check
        CHECK (conflict_type IN ('value_mismatch', 'polarity_mismatch')),
    CONSTRAINT knowledge_conflicts_status_check
        CHECK (status IN ('proposed', 'confirmed', 'dismissed', 'resolved')),
    CONSTRAINT knowledge_conflicts_resolution_check
        CHECK (status <> 'resolved' OR length(btrim(COALESCE(resolution_note, ''))) > 0),
    CONSTRAINT knowledge_conflicts_claim_a_org_fkey
        FOREIGN KEY (organization_id, claim_a_id)
        REFERENCES knowledge_claims(organization_id, id) ON DELETE CASCADE,
    CONSTRAINT knowledge_conflicts_claim_b_org_fkey
        FOREIGN KEY (organization_id, claim_b_id)
        REFERENCES knowledge_claims(organization_id, id) ON DELETE CASCADE,
    CONSTRAINT knowledge_conflicts_org_id_unique UNIQUE (organization_id, id),
    CONSTRAINT knowledge_conflicts_identity_unique UNIQUE (organization_id, conflict_key)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_conflicts_status_detected
    ON knowledge_conflicts (organization_id, status, last_detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_conflicts_claim_pair
    ON knowledge_conflicts (organization_id, claim_a_id, claim_b_id);

CREATE TABLE IF NOT EXISTS knowledge_conflict_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conflict_id UUID NOT NULL,
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT knowledge_conflict_reviews_previous_status_check
        CHECK (previous_status IN ('proposed', 'confirmed', 'dismissed', 'resolved')),
    CONSTRAINT knowledge_conflict_reviews_new_status_check
        CHECK (new_status IN ('confirmed', 'dismissed', 'resolved')),
    CONSTRAINT knowledge_conflict_reviews_conflict_org_fkey
        FOREIGN KEY (organization_id, conflict_id)
        REFERENCES knowledge_conflicts(organization_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_conflict_reviews_history
    ON knowledge_conflict_reviews (organization_id, conflict_id, created_at DESC);

COMMIT;