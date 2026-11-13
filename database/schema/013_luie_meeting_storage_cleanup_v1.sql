BEGIN;

ALTER TABLE public.document_storage_cleanup_outbox
  ALTER COLUMN document_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS meeting_id UUID;

DO $meeting_cleanup_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.document_storage_cleanup_outbox'::regclass
       AND conname = 'storage_cleanup_source_check'
  ) THEN
    ALTER TABLE public.document_storage_cleanup_outbox
      ADD CONSTRAINT storage_cleanup_source_check
      CHECK (
        (document_id IS NOT NULL AND meeting_id IS NULL)
        OR
        (document_id IS NULL AND meeting_id IS NOT NULL)
      );
  END IF;
END;
$meeting_cleanup_constraint$;

COMMENT ON TABLE public.document_storage_cleanup_outbox IS
  'Durable cleanup queue for document and meeting objects in external storage.';

COMMIT;
