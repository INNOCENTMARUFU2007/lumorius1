import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';
export interface AuditLogEntry {
    organizationId?: string;
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
}
export declare class SecurityService {
    private readonly db;
    private readonly emailService;
    private readonly logger;
    constructor(db: DatabaseService, emailService: EmailService);
    logAudit(entry: AuditLogEntry): Promise<void>;
    getAuditLogs(organizationId: string, filters: {
        action?: string;
        userId?: string;
        from?: string;
        to?: string;
        limit?: number;
    }): Promise<Record<string, unknown>[]>;
    createApiKey(organizationId: string, userId: string, dto: {
        name: string;
        scopes?: string[];
        expiresAt?: string;
    }): Promise<{
        id: string;
        name: string;
        key: string;
        prefix: string;
        createdAt: string;
    }>;
    listApiKeys(organizationId: string): Promise<Record<string, unknown>[]>;
    revokeApiKey(organizationId: string, keyId: string): Promise<{
        revoked: boolean;
    }>;
    validateApiKey(rawKey: string): Promise<Record<string, unknown> | null>;
    getLoginAttempts(organizationId: string, limit?: number): Promise<Record<string, unknown>[]>;
    getSecuritySummary(organizationId: string): Promise<{
        apiKeysActive: number;
        loginsLast24h: number;
        failedLoginsLast24h: number;
        activeSessions: number;
        mfaAdoptionRate: number;
        mfaEnabledUsers: number;
        totalUsers: number;
    }>;
}
//# sourceMappingURL=security.service.d.ts.map