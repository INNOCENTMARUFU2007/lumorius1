"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIXED_UUID_3 = exports.FIXED_UUID_2 = exports.FIXED_UUID = void 0;
exports.pgResult = pgResult;
exports.makeUser = makeUser;
exports.makeOrganization = makeOrganization;
exports.makeTask = makeTask;
exports.makeProject = makeProject;
exports.makeNotification = makeNotification;
exports.makeSession = makeSession;
exports.makeVerificationToken = makeVerificationToken;
exports.makeResetToken = makeResetToken;
exports.makeMagicLink = makeMagicLink;
exports.createMockDatabaseService = createMockDatabaseService;
exports.createMockEmailService = createMockEmailService;
exports.createMockJwtService = createMockJwtService;
exports.createMockConfigService = createMockConfigService;
exports.createMockEventEmitter = createMockEventEmitter;
exports.createMockNotificationsService = createMockNotificationsService;
function pgResult(rows) {
    return {
        rows,
        rowCount: rows.length,
        command: 'SELECT',
        oid: 0,
        fields: [],
    };
}
exports.FIXED_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
exports.FIXED_UUID_2 = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
exports.FIXED_UUID_3 = 'cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa';
function makeUser(overrides = {}) {
    return {
        id: exports.FIXED_UUID,
        email: 'innocent@example.com',
        name: 'Innocent Tester',
        password_hash: '$2b$12$hashedpassword',
        organization_id: exports.FIXED_UUID_2,
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
function makeOrganization(overrides = {}) {
    return {
        id: exports.FIXED_UUID_2,
        name: 'Test Corp',
        slug: 'test-corp',
        plan_id: 'starter',
        created_at: new Date('2026-01-01'),
        ...overrides,
    };
}
function makeTask(overrides = {}) {
    return {
        id: exports.FIXED_UUID,
        title: 'Write tests',
        description: 'Add comprehensive Jest tests',
        status: 'todo',
        priority: 'medium',
        organization_id: exports.FIXED_UUID_2,
        created_by_id: exports.FIXED_UUID,
        assignee_id: null,
        project_id: null,
        team_id: null,
        due_date: null,
        tags: [],
        completed_at: null,
        assignee_name: null,
        project_name: null,
        created_by_name: 'Innocent Tester',
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
        ...overrides,
    };
}
function makeProject(overrides = {}) {
    return {
        id: exports.FIXED_UUID,
        name: 'Q1 Roadmap',
        description: 'Q1 feature work',
        organization_id: exports.FIXED_UUID_2,
        owner_id: exports.FIXED_UUID,
        team_id: null,
        status: 'active',
        task_count: '0',
        completed_task_count: '0',
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
        ...overrides,
    };
}
function makeNotification(overrides = {}) {
    return {
        id: exports.FIXED_UUID,
        user_id: exports.FIXED_UUID,
        organization_id: exports.FIXED_UUID_2,
        type: 'task_assigned',
        title: 'New task: Write tests',
        message: 'Assigned by Innocent',
        data: {},
        read_at: null,
        created_at: new Date('2026-01-01'),
        ...overrides,
    };
}
function makeSession(overrides = {}) {
    return {
        id: exports.FIXED_UUID_3,
        user_id: exports.FIXED_UUID,
        refresh_token: 'valid-refresh-token',
        is_valid: true,
        expires_at: new Date(Date.now() + 7 * 86400000),
        last_active_at: new Date(),
        created_at: new Date('2026-01-01'),
        ...overrides,
    };
}
function makeVerificationToken(overrides = {}) {
    return {
        id: exports.FIXED_UUID_3,
        user_id: exports.FIXED_UUID,
        token: 'valid-verify-token',
        used: false,
        expires_at: new Date(Date.now() + 86400000),
        ...overrides,
    };
}
function makeResetToken(overrides = {}) {
    return {
        id: exports.FIXED_UUID_3,
        user_id: exports.FIXED_UUID,
        token: 'valid-reset-token',
        used: false,
        expires_at: new Date(Date.now() + 3600000),
        ip_address: '127.0.0.1',
        ...overrides,
    };
}
function makeMagicLink(overrides = {}) {
    return {
        id: exports.FIXED_UUID_3,
        email: 'innocent@example.com',
        token: 'valid-magic-token',
        used: false,
        expires_at: new Date(Date.now() + 900000),
        ...overrides,
    };
}
function createMockDatabaseService() {
    const mockClient = {
        query: jest.fn().mockResolvedValue(pgResult([])),
        release: jest.fn(),
    };
    return {
        query: jest.fn().mockResolvedValue(pgResult([])),
        findOne: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        transaction: jest.fn().mockImplementation(async (cb) => cb(mockClient)),
        healthCheck: jest.fn().mockResolvedValue(true),
        _mockClient: mockClient,
    };
}
function createMockEmailService() {
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
function createMockJwtService() {
    return {
        sign: jest.fn().mockReturnValue('mock.jwt.access.token'),
        verify: jest.fn().mockReturnValue({ sub: exports.FIXED_UUID }),
        decode: jest.fn().mockReturnValue({ sub: exports.FIXED_UUID }),
    };
}
function createMockConfigService() {
    const config = {
        'appUrl': 'http://localhost:3000',
        'jwt.expiresIn': '15m',
        'jwt.refreshExpiresIn': '7d',
        'email.host': null,
        'email.from': 'test@lumorius.com',
    };
    return {
        get: jest.fn().mockImplementation((key, fallback) => {
            return config[key] ?? fallback;
        }),
    };
}
function createMockEventEmitter() {
    return {
        emit: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        once: jest.fn(),
        removeAllListeners: jest.fn(),
    };
}
function createMockNotificationsService() {
    return {
        create: jest.fn().mockResolvedValue({ id: exports.FIXED_UUID }),
        findAll: jest.fn().mockResolvedValue([]),
        markRead: jest.fn().mockResolvedValue({ read: true }),
        markAllRead: jest.fn().mockResolvedValue({ read: true }),
        getUnreadCount: jest.fn().mockResolvedValue({ count: 0 }),
    };
}
//# sourceMappingURL=helpers.js.map