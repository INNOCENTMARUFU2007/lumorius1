-- 002_demo_data.sql
-- Lumorius AI — Demo / Development Seed Data
-- WARNING: DO NOT RUN IN PRODUCTION.
-- Creates demo organisation, users, project, tasks, AI conversation,
-- goals and notifications.
-- Demo password for all three users: Demo@123456

BEGIN;

-- ── ORGANISATION ──────────────────────────────────────────────

INSERT INTO organizations (
  id,
  name,
  slug,
  plan_id
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'INMARTECH LLC (Demo)',
  'inmartech-llc-demo',
  'growth'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  plan_id = EXCLUDED.plan_id;

-- ── USERS ─────────────────────────────────────────────────────
-- Demo password: Demo@123456
-- pgcrypto generates bcrypt-compatible password hashes.

INSERT INTO users (
  id,
  email,
  password_hash,
  name,
  organization_id,
  role,
  email_verified,
  is_active,
  password_changed_at
)
VALUES
(
  '00000000-0000-0000-0000-000000000010',
  'owner@demo.lumorius.com',
  crypt('Demo@123456', gen_salt('bf', 12)),
  'INNOCENT Owner',
  '00000000-0000-0000-0000-000000000001',
  'owner',
  TRUE,
  TRUE,
  NOW()
),
(
  '00000000-0000-0000-0000-000000000011',
  'admin@demo.lumorius.com',
  crypt('Demo@123456', gen_salt('bf', 12)),
  'Innocent Admin',
  '00000000-0000-0000-0000-000000000001',
  'admin',
  TRUE,
  TRUE,
  NOW()
),
(
  '00000000-0000-0000-0000-000000000012',
  'member@demo.lumorius.com',
  crypt('Demo@123456', gen_salt('bf', 12)),
  'CHRIS Member',
  '00000000-0000-0000-0000-000000000001',
  'member',
  TRUE,
  TRUE,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  organization_id = EXCLUDED.organization_id,
  role = EXCLUDED.role,
  email_verified = TRUE,
  is_active = TRUE,
  password_changed_at = NOW();


-- ── PROJECT ───────────────────────────────────────────────────

INSERT INTO projects (
  id,
  name,
  description,
  organization_id,
  owner_id,
  status
)
VALUES (
  '00000000-0000-0000-0000-000000000020',
  'Q3 Product Roadmap',
  'All Q3 feature work and infrastructure improvements',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'active'
)
ON CONFLICT (id) DO NOTHING;


-- ── TASKS ─────────────────────────────────────────────────────

INSERT INTO tasks (
  id,
  title,
  description,
  status,
  priority,
  organization_id,
  created_by_id,
  assignee_id,
  project_id,
  due_date
)
VALUES
(
  '00000000-0000-0000-0000-000000000030',
  'Set up CI/CD pipeline',
  'Configure GitHub Actions for automated testing and deployment to Kubernetes',
  'done',
  'urgent',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000020',
  NOW() - INTERVAL '5 days'
),
(
  '00000000-0000-0000-0000-000000000031',
  'Implement real-time notifications',
  'Add WebSocket-based and email notifications for task assignments and meeting completions',
  'done',
  'high',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000020',
  NOW() - INTERVAL '2 days'
),
(
  '00000000-0000-0000-0000-000000000032',
  'Write comprehensive test suite',
  'Add Jest unit tests, E2E tests, and load tests for the NestJS API',
  'in_progress',
  'high',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000020',
  NOW() + INTERVAL '3 days'
),
(
  '00000000-0000-0000-0000-000000000033',
  'SOC 2 Type I preparation',
  'Complete risk register, internal audit programme, and formal ISMS adoption',
  'todo',
  'medium',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000020',
  NOW() + INTERVAL '90 days'
),
(
  '00000000-0000-0000-0000-000000000034',
  'Implement WebAuthn / Passkeys',
  'Replace password authentication with FIDO2 passkeys for enhanced security',
  'todo',
  'medium',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000011',
  NULL,
  '00000000-0000-0000-0000-000000000020',
  NOW() + INTERVAL '120 days'
)
ON CONFLICT (id) DO NOTHING;

UPDATE tasks
SET completed_at = NOW() - INTERVAL '1 day'
WHERE id IN (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000031'
)
AND completed_at IS NULL;


-- ── AI CONVERSATION ───────────────────────────────────────────

INSERT INTO ai_conversations (
  id,
  user_id,
  organization_id,
  title,
  model
)
VALUES (
  '00000000-0000-0000-0000-000000000040',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Q3 Strategy Review',
  'gpt-4o'
)
ON CONFLICT (id) DO NOTHING;


-- ── AI MESSAGES ───────────────────────────────────────────────
-- Messages belong in ai_messages, not a messages column
-- on ai_conversations.

INSERT INTO ai_messages (
  id,
  conversation_id,
  role,
  content,
  model
)
VALUES
(
  '00000000-0000-0000-0000-000000000041',
  '00000000-0000-0000-0000-000000000040',
  'user',
  'Summarize our Q3 priorities based on the uploaded roadmap document.',
  'gpt-4o'
),
(
  '00000000-0000-0000-0000-000000000042',
  '00000000-0000-0000-0000-000000000040',
  'assistant',
  'Based on the Q3 Roadmap document, your top priorities are: 1) Complete the CI/CD pipeline, 2) Launch real-time notifications, 3) Achieve SOC 2 Type I readiness.',
  'gpt-4o'
)
ON CONFLICT (id) DO NOTHING;


-- ── GOALS ─────────────────────────────────────────────────────

INSERT INTO goals (
  id,
  organization_id,
  owner_id,
  title,
  description,
  target_value,
  current_value,
  unit,
  status,
  due_date
)
VALUES
(
  '00000000-0000-0000-0000-000000000050',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'Reach $500K ARR',
  'Grow annual recurring revenue to $500,000 by end of year',
  500000,
  127000,
  'USD',
  'active',
  (
    DATE_TRUNC('year', NOW()) +
    INTERVAL '1 year' -
    INTERVAL '1 day'
  )::date
),
(
  '00000000-0000-0000-0000-000000000051',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'SOC 2 Type I Certification',
  'Achieve SOC 2 Type I certification',
  1,
  0,
  'certification',
  'active',
  (
    DATE_TRUNC('year', NOW()) +
    INTERVAL '6 months'
  )::date
)
ON CONFLICT (id) DO NOTHING;


-- ── NOTIFICATIONS ─────────────────────────────────────────────

INSERT INTO notifications (
  id,
  user_id,
  organization_id,
  type,
  title,
  message,
  data
)
VALUES
(
  '00000000-0000-0000-0000-000000000060',
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000001',
  'task_assigned',
  'New task: Write comprehensive test suite',
  'Assigned by Innocent Admin',
  '{"taskId":"00000000-0000-0000-0000-000000000032"}'::jsonb
),
(
  '00000000-0000-0000-0000-000000000061',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'system',
  'Welcome to Lumorius AI',
  'Your workspace is ready. Start by uploading documents or scheduling a meeting.',
  '{}'::jsonb
)
ON CONFLICT (id) DO NOTHING;


-- ── COMPLETION NOTICE ─────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE 'Demo data seeded successfully.';
  RAISE NOTICE 'Demo login: owner@demo.lumorius.com / Demo@123456';
END $$;

COMMIT;