/**
 * Shared test helpers, mock factories, and data fixtures for Lumorius API tests.
 * Import from this file in all *.spec.ts files to keep mocks consistent.
 */

import { QueryResult } from 'pg';

// ── Type helpers ─────────────────────────────────────────────

/** Makes every method on T a jest.Mock */
export type Mocked<T> = { [K in keyof T]: jest.Mock };

// ── QueryResult factory ───────────────────────────────────────

export function pgResult<T = Record<string, unknown>>(
  rows: T[],
): QueryResult<T> {
  return {
    rows,
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

// ── Data fixtures ─────────────────────────────────────────────

export const FIXED_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
export const FIXED_UUID_2 = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
export const FIXED_UUID_3 = 'cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa';

export function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXED_UUID,
    email: 'alice@example.com',
    name: 'Alice Tester',
    password_hash: '$2b$12$hashedpassword',
    organization_id: FIXED_UUID_2,
    role: 'owner',
    is_active: true,
    email_verified: true,
    mfa_enabled: false,
    mfa_secret: null,
    failed_login_count: 0,
    locked_until: null,
    last_login_at: null,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeOrganization(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXED_UUID_2,
    name: 'Test Corp',
    slug: 'test-corp',
    plan_id: 'starter',
    created_at: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXED_UUID,
    title: 'Write tests',
    description: 'Add comprehensive Jest tests',
    status: 'todo',
    priority: 'medium',
    organization_id: FIXED_UUID_2,
    created_by_id: FIXED_UUID,
    assignee_id: null,
    project_id: null,
    team_id: null,
    due_date: null,
    tags: [],
    completed_at: null,
    assignee_name: null,
    project_name: null,
    created_by_name: 'Alice Tester',
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXED_UUID,
    name: 'Q1 Roadmap',
    description: 'Q1 feature work',
    organization_id: FIXED_UUID_2,
    owner_id: FIXED_UUID,
    team_id: null,
    status: 'active',
    task_count: '0',
    completed_task_count: '0',
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXED_UUID,
    user_id: FIXED_UUID,
    organization_id: FIXED_UUID_2,
    type: 'task_assigned',
    title: 'New task: Write tests',
    message: 'Assigned by Alice',
    data: {},
    read_at: null,
    created_at: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXED_UUID_3,
    user_id: FIXED_UUID,
    refresh_token: 'valid-refresh-token',
    is_valid: true,
    expires_at: new Date(Date.now() + 7 * 86400000), // 7 days from now
    last_active_at: new Date(),
    created_at: new Date('2026-01-01'),
    ...overrides,
  };
}

export function makeVerificationToken(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXED_UUID_3,
    user_id: FIXED_UUID,
    token: 'valid-verify-token',
    used: false,
    expires_at: new Date(Date.now() + 86400000), // 24h from now
    ...overrides,
  };
}

export function makeResetToken(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXED_UUID_3,
    user_id: FIXED_UUID,
    token: 'valid-reset-token',
    used: false,
    expires_at: new Date(Date.now() + 3600000), // 1h from now
    ip_address: '127.0.0.1',
    ...overrides,
  };
}

export function makeMagicLink(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXED_UUID_3,
    email: 'alice@example.com',
    token: 'valid-magic-token',
    used: false,
    expires_at: new Date(Date.now() + 900000), // 15min
    ...overrides,
  };
}

// ── Mock service factories ────────────────────────────────────

export function createMockDatabaseService() {
  const mockClient = {
    query: jest.fn().mockResolvedValue(pgResult([])),
    release: jest.fn(),
  };

  return {
    query: jest.fn().mockResolvedValue(pgResult([])),
    findOne: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    transaction: jest.fn().mockImplementation(
      async (cb: (client: typeof mockClient) => Promise<unknown>) => cb(mockClient),
    ),
    healthCheck: jest.fn().mockResolvedValue(true),
    _mockClient: mockClient,
  };
}

export function createMockEmailService() {
  return {
    sendWelcome: jest.fn().mockResolvedValue(undefined),
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendMagicLink: jest.fn().mockResolvedValue(undefined),
    sendLoginAlert: jest.fn().mockResolvedValue(undefined),
    sendTeamInvitation: jest.fn().mockResolvedValue(undefined),
    sendSubscriptionConfirmation: jest.fn().mockResolvedValue(undefined),
    sendPaymentFailed: jest.fn().mockResolvedValue(undefined),
    sendApiKeyCreated: jest.fn().mockResolvedValue(undefined),
    sendTaskAssigned: jest.fn().mockResolvedValue(undefined),
    sendMeetingReady: jest.fn().mockResolvedValue(undefined),
    sendDocumentIndexed: jest.fn().mockResolvedValue(undefined),
    sendDocumentFailed: jest.fn().mockResolvedValue(undefined),
    sendGoalAchieved: jest.fn().mockResolvedValue(undefined),
    sendOverdueTasksSummary: jest.fn().mockResolvedValue(undefined),
    sendWeeklyDigest: jest.fn().mockResolvedValue(undefined),
  };
}

export function createMockJwtService() {
  return {
    sign: jest.fn().mockReturnValue('mock.jwt.access.token'),
    verify: jest.fn().mockReturnValue({ sub: FIXED_UUID }),
    decode: jest.fn().mockReturnValue({ sub: FIXED_UUID }),
  };
}

export function createMockConfigService() {
  const config: Record<string, unknown> = {
    'appUrl': 'http://localhost:3000',
    'jwt.expiresIn': '15m',
    'jwt.refreshExpiresIn': '7d',
    'email.host': null, // SMTP disabled in tests
    'email.from': 'test@lumorius.com',
  };
  return {
    get: jest.fn().mockImplementation((key: string, fallback?: unknown) => {
      return config[key] ?? fallback;
    }),
  };
}

export function createMockEventEmitter() {
  return {
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
  };
}

export function createMockNotificationsService() {
  return {
    create: jest.fn().mockResolvedValue({ id: FIXED_UUID }),
    findAll: jest.fn().mockResolvedValue([]),
    markRead: jest.fn().mockResolvedValue({ read: true }),
    markAllRead: jest.fn().mockResolvedValue({ read: true }),
    getUnreadCount: jest.fn().mockResolvedValue({ count: 0 }),
  };
}
