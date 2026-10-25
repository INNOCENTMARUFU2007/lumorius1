-- Run outside an explicit transaction; CONCURRENTLY reduces table-write blocking.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_active_prefix
  ON public.api_keys (key_prefix) WHERE is_active = TRUE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_org_created_id_desc
  ON public.documents (organization_id, created_at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_org_created_id_desc
  ON public.tasks (organization_id, created_at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_org_created_id_desc
  ON public.projects (organization_id, created_at DESC, id DESC);