-- Support newest-first cursor paging for workspace and participant audit views.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_decision_gov_events_org_seek
  ON knowledge_decision_governance_events (organization_id, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_decision_gov_events_actor_seek
  ON knowledge_decision_governance_events (organization_id, actor_id, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_decision_gov_events_represented_seek
  ON knowledge_decision_governance_events (organization_id, represented_user_id, created_at DESC, id DESC)
  WHERE represented_user_id IS NOT NULL;
