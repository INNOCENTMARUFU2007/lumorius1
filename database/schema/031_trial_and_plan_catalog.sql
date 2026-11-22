-- Lumorius commercial catalogue — 2026-11-21
--
-- * No free tier. New workspaces get a 14-day trial; the 'free' row now only
--   stores the trial allowance and is hidden from the public plan list.
-- * Each paid tier is a strict superset of the one below (fixes Growth giving
--   more AI tokens than Professional).
-- * The advertised feature list matches the limits the API enforces.
--
-- Prices here are what the app DISPLAYS. The amount actually charged comes from
-- the Dodo Payments product configured in DODO_<PLAN>_<INTERVAL>_PRODUCT_ID, so
-- those products must be created with the same prices.
--
-- Annual price = 10 x monthly (two months free).

BEGIN;

UPDATE billing_plans SET
  name = 'Free trial',
  price_monthly = 0,
  price_yearly = 0,
  limits = '{"users": 5, "documents": 50, "storage_gb": 2, "storage_bytes": 2147483648, "ai_tokens_monthly": 100000}'::jsonb,
  features = '["14-day trial of Growth features", "Up to 5 team members", "50 documents", "2 GB storage", "100,000 AI tokens"]'::jsonb,
  is_active = TRUE
WHERE id = 'free';

UPDATE billing_plans SET
  name = 'Starter',
  price_monthly = 49,
  price_yearly = 490,
  limits = '{"users": 5, "documents": 200, "storage_gb": 10, "storage_bytes": 10737418240, "ai_tokens_monthly": 250000}'::jsonb,
  features = '["Up to 5 team members", "200 documents", "10 GB storage", "250,000 AI tokens per month", "2 AI agents"]'::jsonb,
  is_active = TRUE
WHERE id = 'starter';

INSERT INTO billing_plans (id, name, tier, price_monthly, price_yearly, features, limits, is_active)
VALUES ('growth', 'Growth', 'growth', 99, 990, '[]'::jsonb, '{}'::jsonb, TRUE)
ON CONFLICT (id) DO NOTHING;

UPDATE billing_plans SET
  name = 'Growth',
  price_monthly = 99,
  price_yearly = 990,
  limits = '{"users": 15, "documents": 1000, "storage_gb": 50, "storage_bytes": 53687091200, "ai_tokens_monthly": 1000000}'::jsonb,
  features = '["Up to 15 team members", "1,000 documents", "50 GB storage", "1,000,000 AI tokens per month", "4 AI agents"]'::jsonb,
  is_active = TRUE
WHERE id = 'growth';

UPDATE billing_plans SET
  name = 'Professional',
  price_monthly = 199,
  price_yearly = 1990,
  limits = '{"users": 40, "documents": 5000, "storage_gb": 200, "storage_bytes": 214748364800, "ai_tokens_monthly": 3000000}'::jsonb,
  features = '["Up to 40 team members", "5,000 documents", "200 GB storage", "3,000,000 AI tokens per month", "4 AI agents"]'::jsonb,
  is_active = TRUE
WHERE id = 'professional';

-- Existing workspaces still on the old free tier get a trial window starting
-- from their creation date (the API computes created_at + 14 days when this is NULL).

COMMIT;
