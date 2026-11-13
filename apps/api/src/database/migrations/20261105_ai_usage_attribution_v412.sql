BEGIN;

ALTER TABLE ai_usage
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS operation_type TEXT NOT NULL DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS audio_duration_seconds INTEGER NULL,
  ADD COLUMN IF NOT EXISTS operation_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS token_usage_reported BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ai_usage_audio_duration_nonnegative_check'
       AND conrelid = 'ai_usage'::regclass
  ) THEN
    ALTER TABLE ai_usage
      ADD CONSTRAINT ai_usage_audio_duration_nonnegative_check
      CHECK (audio_duration_seconds IS NULL OR audio_duration_seconds >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_usage_org_operation_key
  ON ai_usage (organization_id, operation_key)
  WHERE operation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_provider_model_created
  ON ai_usage (organization_id, provider, model, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_operation_created
  ON ai_usage (organization_id, operation_type, created_at DESC);

COMMIT;