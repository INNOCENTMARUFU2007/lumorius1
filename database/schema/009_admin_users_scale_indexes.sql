-- Lumorius admin user-list performance indexes.
-- These indexes support organisation-grouped keyset pagination and substring search.
-- Run with psql in autocommit mode; CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_org_created_id
  ON public.users (organization_id ASC NULLS FIRST, created_at DESC, id ASC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_trgm
  ON public.users USING GIN (email gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_name_trgm
  ON public.users USING GIN (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_name_trgm
  ON public.organizations USING GIN (name gin_trgm_ops);