UPDATE billing_plans
SET price_monthly = CASE id WHEN 'starter' THEN 49 WHEN 'professional' THEN 149 ELSE price_monthly END,
    price_yearly = CASE id WHEN 'starter' THEN 490 WHEN 'professional' THEN 1490 ELSE price_yearly END,
    limits = limits || jsonb_build_object(
      'ai_tokens_monthly', CASE id WHEN 'free' THEN 15000 WHEN 'starter' THEN 150000 ELSE 750000 END
    )
WHERE id IN ('free', 'starter', 'professional');

UPDATE billing_plans
SET limits = limits || jsonb_build_object('storage_bytes', 500000000, 'storage_gb', 500000000::numeric / 1073741824)
WHERE id = 'free';

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS audio_size_bytes BIGINT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT;

UPDATE organizations o
SET storage_used_bytes = COALESCE((SELECT SUM(d.size_bytes) FROM documents d WHERE d.organization_id = o.id), 0)
    + COALESCE((SELECT SUM(m.audio_size_bytes) FROM meetings m WHERE m.organization_id = o.id), 0)
WHERE o.storage_used_bytes IS NULL;

ALTER TABLE organizations ALTER COLUMN storage_used_bytes SET DEFAULT 0,
  ALTER COLUMN storage_used_bytes SET NOT NULL;

CREATE TABLE IF NOT EXISTS ai_token_reservations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tokens INTEGER NOT NULL CHECK (tokens >= 0),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '12 minutes')
);
CREATE INDEX IF NOT EXISTS idx_ai_token_reservation_org ON ai_token_reservations (organization_id, expires_at);

CREATE OR REPLACE FUNCTION reserve_lumorius_ai_tokens(
  workspace_id UUID, reservation_id UUID, input_estimate INTEGER, wanted_output INTEGER
) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  quota BIGINT;
  plan TEXT;
  usage_tokens BIGINT;
  output_budget INTEGER;
  available BIGINT;
BEGIN
  SELECT o.plan_id::text, COALESCE((p.limits->>'ai_tokens_monthly')::bigint, 0)
    INTO plan, quota
    FROM organizations o JOIN billing_plans p ON p.id = o.plan_id::text
    WHERE o.id = workspace_id FOR UPDATE OF o;
  IF NOT FOUND THEN RETURN -2; END IF;
  IF quota < 0 THEN RETURN -1; END IF;

  DELETE FROM ai_token_reservations WHERE organization_id = workspace_id AND expires_at <= NOW();
  SELECT
    COALESCE((SELECT SUM(u.total_tokens) FROM ai_usage u WHERE u.organization_id = workspace_id
      AND u.created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0)
    + COALESCE((SELECT SUM(r.tokens) FROM ai_token_reservations r WHERE r.organization_id = workspace_id), 0)
    INTO usage_tokens;
  available := quota - usage_tokens - input_estimate;
  IF available < (CASE WHEN wanted_output > 0 THEN 128 ELSE 0 END) THEN RETURN 0; END IF;
  output_budget := LEAST(wanted_output, available, CASE WHEN plan = 'free' THEN 768 ELSE wanted_output END);
  INSERT INTO ai_token_reservations (id, organization_id, tokens)
    VALUES (reservation_id, workspace_id, input_estimate + output_budget);
  RETURN GREATEST(1, output_budget);
END;
$$;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS dodo_customer_id TEXT;

CREATE TABLE IF NOT EXISTS dodo_checkout_attempts (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  product_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  checkout_url TEXT,
  provider_subscription_id TEXT UNIQUE,
  lease_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '25 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dodo_checkout_org ON dodo_checkout_attempts (organization_id, lease_expires_at DESC);

CREATE TABLE IF NOT EXISTS dodo_webhook_events (
  id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, mode)
);
