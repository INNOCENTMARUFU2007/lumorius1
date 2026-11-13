BEGIN;

-- The prior creator FK checked only users.id. Replace it with a tenant-scoped FK.
ALTER TABLE meetings
  DROP CONSTRAINT IF EXISTS meetings_created_by_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'meetings_created_by_org_fkey'
      AND conrelid = 'public.meetings'::regclass
  ) THEN
    ALTER TABLE meetings
      ADD CONSTRAINT meetings_created_by_org_fkey
      FOREIGN KEY (organization_id, created_by_id)
      REFERENCES users (organization_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- MI 2.0.1 created this ANN index while the table was empty. Defer vector
-- indexing until a representative corpus exists and recall can be evaluated.
DROP INDEX IF EXISTS idx_meeting_chunks_embedding;

COMMIT;