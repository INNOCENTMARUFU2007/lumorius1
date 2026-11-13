BEGIN;

-- Immutable, effective-dated provider/model pricing. No vendor rates are seeded.
CREATE TABLE IF NOT EXISTS ai_model_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider ~ '^[a-z0-9][a-z0-9_-]{0,79}$'),
  model TEXT NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 200),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('chat', 'embedding', 'transcription')),
  input_usd_per_1m_tokens NUMERIC(20,12),
  output_usd_per_1m_tokens NUMERIC(20,12),
  audio_usd_per_minute NUMERIC(20,12),
  effective_from TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_model_pricing_nonnegative_rates_check CHECK (
    (input_usd_per_1m_tokens IS NULL OR input_usd_per_1m_tokens >= 0) AND
    (output_usd_per_1m_tokens IS NULL OR output_usd_per_1m_tokens >= 0) AND
    (audio_usd_per_minute IS NULL OR audio_usd_per_minute >= 0)
  ),
  CONSTRAINT ai_model_pricing_operation_rates_check CHECK (
    (operation_type = 'chat' AND input_usd_per_1m_tokens IS NOT NULL
      AND output_usd_per_1m_tokens IS NOT NULL AND audio_usd_per_minute IS NULL) OR
    (operation_type = 'embedding' AND input_usd_per_1m_tokens IS NOT NULL
      AND output_usd_per_1m_tokens IS NULL AND audio_usd_per_minute IS NULL) OR
    (operation_type = 'transcription' AND input_usd_per_1m_tokens IS NULL
      AND output_usd_per_1m_tokens IS NULL AND audio_usd_per_minute IS NOT NULL)
  ),
  CONSTRAINT ai_model_pricing_version_unique
    UNIQUE (provider, model, operation_type, effective_from)
);

ALTER TABLE ai_usage
  ALTER COLUMN cost_usd TYPE NUMERIC(30,12)
  USING cost_usd::numeric;

ALTER TABLE ai_usage
  ADD COLUMN IF NOT EXISTS pricing_id UUID,
  ADD COLUMN IF NOT EXISTS pricing_status TEXT NOT NULL DEFAULT 'unpriced',
  ADD COLUMN IF NOT EXISTS input_usd_per_1m_tokens NUMERIC(20,12),
  ADD COLUMN IF NOT EXISTS output_usd_per_1m_tokens NUMERIC(20,12),
  ADD COLUMN IF NOT EXISTS audio_usd_per_minute NUMERIC(20,12),
  ADD COLUMN IF NOT EXISTS input_cost_usd NUMERIC(30,12) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_cost_usd NUMERIC(30,12) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audio_cost_usd NUMERIC(30,12) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priced_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ai_usage_pricing_id_fkey'
       AND conrelid = 'ai_usage'::regclass
  ) THEN
    ALTER TABLE ai_usage
      ADD CONSTRAINT ai_usage_pricing_id_fkey
      FOREIGN KEY (pricing_id) REFERENCES ai_model_pricing(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ai_usage_pricing_status_check'
       AND conrelid = 'ai_usage'::regclass
  ) THEN
    ALTER TABLE ai_usage
      ADD CONSTRAINT ai_usage_pricing_status_check
      CHECK (pricing_status IN ('priced', 'unpriced', 'incomplete'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ai_usage_cost_components_nonnegative_check'
       AND conrelid = 'ai_usage'::regclass
  ) THEN
    ALTER TABLE ai_usage
      ADD CONSTRAINT ai_usage_cost_components_nonnegative_check
      CHECK (
        cost_usd >= 0 AND input_cost_usd >= 0 AND
        output_cost_usd >= 0 AND audio_cost_usd >= 0
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION prevent_ai_model_pricing_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AI pricing versions are immutable; create a new effective-dated version instead.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_model_pricing_immutable ON ai_model_pricing;
CREATE TRIGGER trg_ai_model_pricing_immutable
  BEFORE UPDATE OR DELETE ON ai_model_pricing
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_model_pricing_mutation();

CREATE INDEX IF NOT EXISTS idx_ai_model_pricing_lookup
  ON ai_model_pricing (provider, model, operation_type, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_pricing_status_created
  ON ai_usage (organization_id, pricing_status, created_at DESC);

COMMIT;