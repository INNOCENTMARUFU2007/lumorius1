import { SecurityService } from './security.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
declare class CreateApiKeyDto {
    name: string;
    scopes?: string[];
    expiresAt?: string;
}
declare class AuditQueryDto {
    action?: string;
    userId?: string;
    from?: string;
    to?: string;
}
export declare class SecurityController {
    private readonly securityService;
    constructor(securityService: SecurityService);
    summary(user: JwtPayload): Promise<{
        apiKeysActive: number;
        loginsLast24h: number;
        failedLoginsLast24h: number;
        activeSessions: number;
        mfaAdoptionRate: number;
        mfaEnabledUsers: number;
        totalUsers: number;
    }>;
    auditLogs(user: JwtPayload, query: AuditQueryDto): Promise<Record<string, unknown>[]>;
    createKey(user: JwtPayload, dto: CreateApiKeyDto): Promise<{
        id: string;
        name: string;
        key: string;
        prefix: string;
        createdAt: string;
    }>;
    listKeys(user: JwtPayload): Promise<Record<string, unknown>[]>;
    revokeKey(user: JwtPayload, keyId: string): Promise<{
        revoked: boolean;
    }>;
    loginAttempts(user: JwtPayload): Promise<Record<string, unknown>[]>;
}
export {};
//# sourceMappingURL=security.controller.d.ts.map