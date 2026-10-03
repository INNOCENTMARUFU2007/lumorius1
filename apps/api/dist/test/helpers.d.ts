import { QueryResult } from 'pg';
export type Mocked<T> = {
    [K in keyof T]: jest.Mock;
};
export declare function pgResult<T = Record<string, unknown>>(rows: T[]): QueryResult<T>;
export declare const FIXED_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
export declare const FIXED_UUID_2 = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
export declare const FIXED_UUID_3 = "cccccccc-dddd-eeee-ffff-aaaaaaaaaaaa";
export declare function makeUser(overrides?: Record<string, unknown>): {
    id: string;
    email: string;
    name: string;
    password_hash: string;
    organization_id: string;
    role: string;
    is_active: boolean;
    email_verified: boolean;
    mfa_enabled: boolean;
    mfa_secret: any;
    failed_login_count: number;
    locked_until: any;
    last_login_at: any;
    created_at: Date;
    updated_at: Date;
};
export declare function makeOrganization(overrides?: Record<string, unknown>): {
    id: string;
    name: string;
    slug: string;
    plan_id: string;
    created_at: Date;
};
export declare function makeTask(overrides?: Record<string, unknown>): {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    organization_id: string;
    created_by_id: string;
    assignee_id: any;
    project_id: any;
    team_id: any;
    due_date: any;
    tags: any[];
    completed_at: any;
    assignee_name: any;
    project_name: any;
    created_by_name: string;
    created_at: Date;
    updated_at: Date;
};
export declare function makeProject(overrides?: Record<string, unknown>): {
    id: string;
    name: string;
    description: string;
    organization_id: string;
    owner_id: string;
    team_id: any;
    status: string;
    task_count: string;
    completed_task_count: string;
    created_at: Date;
    updated_at: Date;
};
export declare function makeNotification(overrides?: Record<string, unknown>): {
    id: string;
    user_id: string;
    organization_id: string;
    type: string;
    title: string;
    message: string;
    data: {};
    read_at: any;
    created_at: Date;
};
export declare function makeSession(overrides?: Record<string, unknown>): {
    id: string;
    user_id: string;
    refresh_token: string;
    is_valid: boolean;
    expires_at: Date;
    last_active_at: Date;
    created_at: Date;
};
export declare function makeVerificationToken(overrides?: Record<string, unknown>): {
    id: string;
    user_id: string;
    token: string;
    used: boolean;
    expires_at: Date;
};
export declare function makeResetToken(overrides?: Record<string, unknown>): {
    id: string;
    user_id: string;
    token: string;
    used: boolean;
    expires_at: Date;
    ip_address: string;
};
export declare function makeMagicLink(overrides?: Record<string, unknown>): {
    id: string;
    email: string;
    token: string;
    used: boolean;
    expires_at: Date;
};
export declare function createMockDatabaseService(): {
    query: jest.Mock<any, any, any>;
    findOne: jest.Mock<any, any, any>;
    findMany: jest.Mock<any, any, any>;
    transaction: jest.Mock<any, any, any>;
    healthCheck: jest.Mock<any, any, any>;
    _mockClient: {
        query: jest.Mock<any, any, any>;
        release: jest.Mock<any, any, any>;
    };
};
export declare function createMockEmailService(): {
    sendWelcome: jest.Mock<any, any, any>;
    sendVerificationEmail: jest.Mock<any, any, any>;
    sendPasswordReset: jest.Mock<any, any, any>;
    sendMagicLink: jest.Mock<any, any, any>;
    sendLoginAlert: jest.Mock<any, any, any>;
    sendTeamInvitation: jest.Mock<any, any, any>;
    sendSubscriptionConfirmation: jest.Mock<any, any, any>;
    sendPaymentFailed: jest.Mock<any, any, any>;
    sendApiKeyCreated: jest.Mock<any, any, any>;
    sendTaskAssigned: jest.Mock<any, any, any>;
    sendMeetingReady: jest.Mock<any, any, any>;
    sendDocumentIndexed: jest.Mock<any, any, any>;
    sendDocumentFailed: jest.Mock<any, any, any>;
    sendGoalAchieved: jest.Mock<any, any, any>;
    sendOverdueTasksSummary: jest.Mock<any, any, any>;
    sendWeeklyDigest: jest.Mock<any, any, any>;
};
export declare function createMockJwtService(): {
    sign: jest.Mock<any, any, any>;
    verify: jest.Mock<any, any, any>;
    decode: jest.Mock<any, any, any>;
};
export declare function createMockConfigService(): {
    get: jest.Mock<any, any, any>;
};
export declare function createMockEventEmitter(): {
    emit: jest.Mock<any, any, any>;
    on: jest.Mock<any, any, any>;
    off: jest.Mock<any, any, any>;
    once: jest.Mock<any, any, any>;
    removeAllListeners: jest.Mock<any, any, any>;
};
export declare function createMockNotificationsService(): {
    create: jest.Mock<any, any, any>;
    findAll: jest.Mock<any, any, any>;
    markRead: jest.Mock<any, any, any>;
    markAllRead: jest.Mock<any, any, any>;
    getUnreadCount: jest.Mock<any, any, any>;
};
//# sourceMappingURL=helpers.d.ts.map