-- Lumorius Company Brain 2.0
-- Additive, tenant-safe migration. No existing document data is deleted.

BEGIN;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS team_id uuid;

-- Ensure a team reference always belongs to the same organisation as
-- its document. teams.id is already unique; this composite unique index
-- supports the composite foreign key below.
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_organization_id_id
  ON teams (organization_id, id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'documents_team_organization_fkey'
      AND conrelid = 'public.documents'::regclass
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT documents_team_organization_fkey
      FOREIGN KEY (organization_id, team_id)
      REFERENCES teams (organization_id, id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

-- Supports organisation + team + status filters in Company Brain.
CREATE INDEX IF NOT EXISTS idx_documents_org_team_status
  ON documents (organization_id, team_id, status);

-- Supports ordered chunk retrieval for document source previews.
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_chunk
  ON document_chunks (document_id, chunk_index);

-- Reuse the existing idx_document_chunks_fts GIN index on content.
-- Do not create a duplicate full-text index.

COMMENT ON COLUMN documents.team_id IS
  'Optional owning team. NULL means organisation-wide document visibility.';

COMMIT;