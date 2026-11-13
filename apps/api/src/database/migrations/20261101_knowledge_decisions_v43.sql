BEGIN;

CREATE TABLE IF NOT EXISTS knowledge_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    rationale TEXT,
    decision_type TEXT NOT NULL DEFAULT 'operational',
    status TEXT NOT NULL DEFAULT 'draft',
    priority TEXT NOT NULL DEFAULT 'medium',
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    approved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    expected_outcome TEXT,
    actual_outcome TEXT,
    rejection_reason TEXT,
    decision_at TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    review_due_at TIMESTAMPTZ,
    implemented_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT knowledge_decisions_title_check CHECK (length(btrim(title)) > 0),
    CONSTRAINT knowledge_decisions_type_check CHECK (
      decision_type IN ('strategic','operational','product','technical','financial','customer','people','compliance','other')
    ),
    CONSTRAINT knowledge_decisions_status_check CHECK (
      status IN ('draft','proposed','approved','rejected','implemented','reviewed','withdrawn')
    ),
    CONSTRAINT knowledge_decisions_priority_check CHECK (
      priority IN ('low','medium','high','critical')
    ),
    CONSTRAINT knowledge_decisions_org_id_unique UNIQUE (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_decisions_org_status_updated
    ON knowledge_decisions (organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_decisions_org_owner
    ON knowledge_decisions (organization_id, owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_decisions_org_team
    ON knowledge_decisions (organization_id, team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_decisions_org_due
    ON knowledge_decisions (organization_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_decisions_search
    ON knowledge_decisions USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(rationale,'')));

CREATE TABLE IF NOT EXISTS knowledge_decision_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    decision_id UUID NOT NULL,
    link_type TEXT NOT NULL,
    linked_id UUID NOT NULL,
    link_label TEXT NOT NULL,
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT knowledge_decision_links_type_check CHECK (
      link_type IN ('claim','conflict','goal','objective','project','task','document')
    ),
    CONSTRAINT knowledge_decision_links_decision_org_fkey
      FOREIGN KEY (organization_id, decision_id)
      REFERENCES knowledge_decisions(organization_id, id) ON DELETE CASCADE,
    CONSTRAINT knowledge_decision_links_identity_unique
      UNIQUE (organization_id, decision_id, link_type, linked_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_decision_links_decision
    ON knowledge_decision_links (organization_id, decision_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_decision_links_target
    ON knowledge_decision_links (organization_id, link_type, linked_id);

CREATE TABLE IF NOT EXISTS knowledge_decision_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    decision_id UUID NOT NULL,
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT knowledge_decision_reviews_decision_org_fkey
      FOREIGN KEY (organization_id, decision_id)
      REFERENCES knowledge_decisions(organization_id, id) ON DELETE CASCADE,
    CONSTRAINT knowledge_decision_reviews_previous_status_check CHECK (
      previous_status IN ('draft','proposed','approved','rejected','implemented','reviewed','withdrawn')
    ),
    CONSTRAINT knowledge_decision_reviews_new_status_check CHECK (
      new_status IN ('draft','proposed','approved','rejected','implemented','reviewed','withdrawn')
    )
);

CREATE INDEX IF NOT EXISTS idx_knowledge_decision_reviews_history
    ON knowledge_decision_reviews (organization_id, decision_id, created_at DESC);

COMMIT;