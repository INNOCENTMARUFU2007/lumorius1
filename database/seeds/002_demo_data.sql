-- 002_demo_data.sql
-- Lumorius AI — Demo / Development Seed Data
-- ⚠️  DO NOT RUN IN PRODUCTION
-- Creates: 1 org, 3 users, sample tasks, sample documents, sample meetings

BEGIN;

-- ── Organization ──────────────────────────────────────────────
INSERT INTO organizations (id, name, slug, plan_id, max_users, max_documents, max_meetings_per_month)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'INMARTECH LLC (Demo)', 'inmartech-llc-demo', 'professional', 25, 1000, 100)
ON CONFLICT (id) DO NOTHING;

-- ── Users ─────────────────────────────────────────────────────
-- Password for all demo users: Demo@123456 (bcrypt hash, rounds=12)
INSERT INTO users (id, email, password_hash, name, organization_id, role, email_verified, is_active, password_changed_at)
VALUES
  ('00000000-0000-0000-0000-000000000010',
   'owner@demo.lumorius.com',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2lSc8sUNVi',
   'INNOCENT Owner',
   '00000000-0000-0000-0000-000000000001',
   'owner', TRUE, TRUE, NOW()),

  ('00000000-0000-0000-0000-000000000011',
   'admin@demo.lumorius.com',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2lSc8sUNVi',
   'Innocent Admin',
   '00000000-0000-0000-0000-000000000001',
   'admin', TRUE, TRUE, NOW()),

  ('00000000-0000-0000-0000-000000000012',
   'member@demo.lumorius.com',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBpj2lSc8sUNVi',
   'CHRIS Member',
   '00000000-0000-0000-0000-000000000001',
   'member', TRUE, TRUE, NOW())
ON CONFLICT (id) DO NOTHING;

-- ── Project ───────────────────────────────────────────────────
INSERT INTO projects (id, name, description, organization_id, owner_id, status)
VALUES
  ('00000000-0000-0000-0000-000000000020',
   'Q3 Product Roadmap',
   'All Q3 feature work and infrastructure improvements',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000010',
   'active')
ON CONFLICT (id) DO NOTHING;

-- ── Tasks ─────────────────────────────────────────────────────
INSERT INTO tasks (id, title, description, status, priority, organization_id, created_by_id, assignee_id, project_id, due_date)
VALUES
  ('00000000-0000-0000-0000-000000000030',
   'Set up CI/CD pipeline',
   'Configure GitHub Actions for automated testing and deployment to Kubernetes',
   'done', 'urgent',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000020',
   NOW() - INTERVAL '5 days'),

  ('00000000-0000-0000-0000-000000000031',
   'Implement real-time notifications',
   'Add WebSocket-based and email notifications for task assignments and meeting completions',
   'done', 'high',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000012',
   '00000000-0000-0000-0000-000000000020',
   NOW() - INTERVAL '2 days'),

  ('00000000-0000-0000-0000-000000000032',
   'Write comprehensive test suite',
   'Add Jest unit tests, E2E tests, and load tests for the NestJS API',
   'in_progress', 'high',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000012',
   '00000000-0000-0000-0000-000000000020',
   NOW() + INTERVAL '3 days'),

  ('00000000-0000-0000-0000-000000000033',
   'SOC 2 Type I preparation',
   'Complete risk register, internal audit programme, and formal ISMS adoption',
   'todo', 'medium',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000020',
   NOW() + INTERVAL '90 days'),

  ('00000000-0000-0000-0000-000000000034',
   'Implement WebAuthn / Passkeys',
   'Replace password authentication with FIDO2 passkeys for enhanced security',
   'todo', 'medium',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011',
   NULL,
   '00000000-0000-0000-0000-000000000020',
   NOW() + INTERVAL '120 days')
ON CONFLICT (id) DO NOTHING;

-- Update completed_at for done tasks
UPDATE tasks
SET completed_at = NOW() - INTERVAL '1 day'
WHERE id IN (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000031'
) AND completed_at IS NULL;

-- ── AI Conversations ──────────────────────────────────────────
INSERT INTO ai_conversations (id, user_id, organization_id, title, messages, model)
VALUES
  ('00000000-0000-0000-0000-000000000040',
   '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000001',
   'Q3 Strategy Review',
   '[{"role":"user","content":"Summarize our Q3 priorities based on the uploaded roadmap document."},{"role":"assistant","content":"Based on the Q3 Roadmap document, your top priorities are: 1) Complete the CI/CD pipeline, 2) Launch real-time notifications, 3) Achieve SOC 2 Type I readiness. The team has 3 members assigned across 5 active tasks with 2 already completed."}]'::jsonb,
   'gpt-4o')
ON CONFLICT (id) DO NOTHING;

-- ── Goals ─────────────────────────────────────────────────────
INSERT INTO goals (id, organization_id, owner_id, title, description, target_value, current_value, unit, status, due_date)
VALUES
  ('00000000-0000-0000-0000-000000000050',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000010',
   'Reach $500K ARR',
   'Grow annual recurring revenue to $500,000 by end of year',
   500000, 127000, 'USD', 'active',
   DATE_TRUNC('year', NOW()) + INTERVAL '1 year - 1 day'),

  ('00000000-0000-0000-0000-000000000051',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000010',
   'SOC 2 Type I Certification',
   'Achieve SOC 2 Type I certification by Q4 2026',
   1, 0, 'certification', 'active',
   DATE_TRUNC('year', NOW()) + INTERVAL '6 months')
ON CONFLICT (id) DO NOTHING;

-- ── Notifications ─────────────────────────────────────────────
INSERT INTO notifications (id, user_id, organization_id, type, title, message, data)
VALUES
  ('00000000-0000-0000-0000-000000000060',
   '00000000-0000-0000-0000-000000000012',
   '00000000-0000-0000-0000-000000000001',
   'task_assigned',
   'New task: Write comprehensive test suite',
   'Assigned by Innocent Admin',
   '{"taskId":"00000000-0000-0000-0000-000000000032"}'::jsonb),

  ('00000000-0000-0000-0000-000000000061',
   '00000000-0000-0000-0000-000000000010',
   '00000000-0000-0000-0000-000000000001',
   'system',
   'Welcome to Lumorius AI',
   'Your workspace is ready. Start by uploading documents or scheduling a meeting.',
   '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMIT;

RAISE NOTICE 'Demo data seeded successfully.';
RAISE NOTICE 'Demo login: owner@demo.lumorius.com / Demo@123456';
