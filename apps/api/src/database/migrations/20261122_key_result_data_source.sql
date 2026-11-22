-- Key results can track a live organisation metric instead of a manually typed value.
-- data_source: 'manual', 'ei:<metric>' (Executive Intelligence) or 'workspace:<metric>'.
BEGIN;

ALTER TABLE key_results
  ADD COLUMN IF NOT EXISTS data_source varchar(60) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_currency char(3),
  ADD COLUMN IF NOT EXISTS synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_available boolean;

ALTER TABLE key_results DROP CONSTRAINT IF EXISTS key_results_data_source_check;
ALTER TABLE key_results ADD CONSTRAINT key_results_data_source_check
  CHECK (data_source ~ '^(manual|ei:[a-z_]{2,40}|workspace:[a-z_]{2,40})$');

ALTER TABLE key_results DROP CONSTRAINT IF EXISTS key_results_source_currency_check;
ALTER TABLE key_results ADD CONSTRAINT key_results_source_currency_check
  CHECK (source_currency IS NULL OR source_currency ~ '^[A-Z]{3}$');

CREATE INDEX IF NOT EXISTS idx_key_results_linked ON key_results (objective_id) WHERE data_source <> 'manual';

COMMIT;
