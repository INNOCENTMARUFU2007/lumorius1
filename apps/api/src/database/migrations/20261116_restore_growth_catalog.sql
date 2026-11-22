INSERT INTO billing_plans (id, name, tier, price_monthly, price_yearly, features, limits, is_active)
VALUES (
  'growth', 'Growth', 'growth', 79, 758,
  '{"tasks": true, "ai_chat": true, "meetings": true, "analytics": true, "documents": true, "workflows": true}'::jsonb,
  '{"users": 25, "documents": 500, "storage_gb": 50, "ai_tokens_monthly": 1000000}'::jsonb,
  TRUE
)
ON CONFLICT (id) DO UPDATE SET is_active = TRUE
WHERE billing_plans.is_active IS DISTINCT FROM TRUE;
