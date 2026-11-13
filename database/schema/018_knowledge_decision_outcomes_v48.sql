BEGIN;

ALTER TABLE knowledge_decisions
  ADD COLUMN IF NOT EXISTS outcome_assessment TEXT;

ALTER TABLE knowledge_decision_reviews
  ADD COLUMN IF NOT EXISTS outcome_assessment TEXT;

DO $v48$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'knowledge_decisions_outcome_assessment_check'
       AND conrelid = 'knowledge_decisions'::regclass
  ) THEN
    ALTER TABLE knowledge_decisions
      ADD CONSTRAINT knowledge_decisions_outcome_assessment_check
      CHECK (outcome_assessment IS NULL OR outcome_assessment IN (
        'achieved', 'partially_achieved', 'not_achieved', 'inconclusive'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'knowledge_decision_reviews_outcome_assessment_check'
       AND conrelid = 'knowledge_decision_reviews'::regclass
  ) THEN
    ALTER TABLE knowledge_decision_reviews
      ADD CONSTRAINT knowledge_decision_reviews_outcome_assessment_check
      CHECK (outcome_assessment IS NULL OR outcome_assessment IN (
        'achieved', 'partially_achieved', 'not_achieved', 'inconclusive'
      ));
  END IF;
END;
$v48$;

CREATE INDEX IF NOT EXISTS idx_knowledge_decisions_org_outcome_assessment
  ON knowledge_decisions (organization_id, outcome_assessment)
  WHERE outcome_assessment IS NOT NULL;

COMMIT;