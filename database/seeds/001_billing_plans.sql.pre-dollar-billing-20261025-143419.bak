-- Lumorius billing plans (USD).
-- Prices are stored as decimal dollars, not cents.
-- Do not execute this seed against an existing database without reviewing
-- the intended effects of ON CONFLICT updates.

INSERT INTO billing_plans
  (id, name, tier, price_monthly, price_yearly, features, limits, is_active)
VALUES
  ('free', 'Free', 'free', 0.00, 0.00,
   '{"ai_chat":true,"documents":true,"tasks":true}',
   '{"users":1,"documents":10,"ai_tokens_monthly":25000,"storage_gb":1}', TRUE),
  ('starter', 'Starter', 'starter', 149.00, 1490.00,
   '{"ai_chat":true,"documents":true,"tasks":true,"meetings":true}',
   '{"users":3,"documents":50,"ai_tokens_monthly":100000,"storage_gb":5}', TRUE),
  ('professional', 'Professional', 'professional', 499.00, 4990.00,
   '{"ai_chat":true,"documents":true,"tasks":true,"meetings":true,"analytics":true,"workflows":true,"founder_os":true}',
   '{"users":25,"documents":500,"ai_tokens_monthly":1000000,"storage_gb":50}', TRUE),
  ('enterprise', 'Enterprise', 'enterprise', 1499.00, 14990.00,
   '{"ai_chat":true,"documents":true,"tasks":true,"meetings":true,"analytics":true,"workflows":true,"founder_os":true,"api_access":true,"sso":true,"custom_models":true}',
   '{"users":-1,"documents":-1,"ai_tokens_monthly":-1,"storage_gb":-1}', TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  tier = EXCLUDED.tier,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits,
  is_active = EXCLUDED.is_active;