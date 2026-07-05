-- ============================================================
-- Lumorius AI — Billing Plans Seed (USD)
-- INMARTECH PVT LTD
-- ============================================================
INSERT INTO billing_plans
  (id, name, description, monthly_price_cents, annual_price_cents,
   max_users, storage_gb, ai_requests_per_month, features, is_active)
VALUES
  (
    'starter', 'Starter', 'Perfect for solo founders and small teams.',
    4900, 49980, 5, 10, 500,
    '["5 team members","10 GB storage","500 AI requests/month","Company Brain (RAG)","Meeting transcription","Founder OS basics","Email support"]',
    TRUE
  ),
  (
    'growth', 'Growth', 'For growing teams that need more power.',
    14900, 152880, 25, 50, 2000,
    '["25 team members","50 GB storage","2,000 AI requests/month","Full Founder OS (OKRs, KPIs, health score)","Advanced Knowledge Graph","Workflow automation","API access","Priority support"]',
    TRUE
  ),
  (
    'professional', 'Professional', 'Full power for scaling businesses.',
    49900, 508980, 100, 200, 10000,
    '["100 team members","200 GB storage","10,000 AI requests/month","All Growth features","Advanced security & audit logs","API keys management","SSO / SAML","Custom AI models","Dedicated Slack support","SLA 99.9%"]',
    TRUE
  ),
  (
    'enterprise', 'Enterprise', 'Tailored for large organisations.',
    149900, 1499880, NULL, NULL, NULL,
    '["Unlimited team members","Unlimited storage","Unlimited AI requests","Custom on-premise / VPC deployment","AI model fine-tuning","Dedicated account manager","24/7 phone support","Custom SLA","Compliance & security audit","White-label options"]',
    TRUE
  )
ON CONFLICT (id) DO UPDATE
  SET name                  = EXCLUDED.name,
      description           = EXCLUDED.description,
      monthly_price_cents   = EXCLUDED.monthly_price_cents,
      annual_price_cents    = EXCLUDED.annual_price_cents,
      max_users             = EXCLUDED.max_users,
      storage_gb            = EXCLUDED.storage_gb,
      ai_requests_per_month = EXCLUDED.ai_requests_per_month,
      features              = EXCLUDED.features,
      updated_at            = NOW();
