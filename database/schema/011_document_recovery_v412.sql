BEGIN;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS queue_recovery_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queue_next_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_documents_queue_recovery
  ON public.documents (queue_next_attempt_at ASC, updated_at ASC, id ASC)
  WHERE status = 'failed'
    AND error_message LIKE 'Document processing queue submission failed after 3 attempts:%';

CREATE TABLE IF NOT EXISTS public.document_storage_cleanup_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  document_id UUID NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_storage_cleanup_status_check
    CHECK (status IN ('pending', 'processing')),
  CONSTRAINT document_storage_cleanup_attempts_check
    CHECK (attempts >= 0),
  CONSTRAINT document_storage_cleanup_key_check
    CHECK (length(btrim(storage_key)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_document_storage_cleanup_due
  ON public.document_storage_cleanup_outbox (next_attempt_at ASC, created_at ASC, id ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_document_storage_cleanup_expired_lease
  ON public.document_storage_cleanup_outbox (lease_expires_at ASC, id ASC)
  WHERE status = 'processing';

COMMIT;
