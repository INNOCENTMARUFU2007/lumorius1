import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';
export declare class AuthService {
    private readonly db;
    private readonly jwtService;
    private readonly configService;
    private readonly emailService;
    private readonly eventEmitter;
    private readonly logger;
    constructor(db: DatabaseService, jwtService: JwtService, configService: ConfigService, emailService: EmailService, eventEmitter: EventEmitter2);
    register(dto: {
        email: string;
        password: string;
        name: string;
        organizationName?: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: unknown;
            email: unknown;
            name: unknown;
            role: unknown;
            organizationId: unknown;
            emailVerified: boolean;
            mfaEnabled: boolean;
            onboardingCompleted: boolean;
        };
    }>;
    verifyEmail(token: string): Promise<{
        verified: boolean;
    }>;
    resendVerificationEmail(userId: string): Promise<{
        sent: boolean;
    }>;
    login(email: string, password: string, mfaCode?: string, ip?: string, userAgent?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: unknown;
            email: unknown;
            name: unknown;
            role: unknown;
            organizationId: unknown;
            emailVerified: boolean;
            mfaEnabled: boolean;
            onboardingCompleted: boolean;
        };
    } | {
        mfaRequired: boolean;
    }>;
    getCurrentUser(userId: string): Promise<{
        id: unknown;
        email: unknown;
        name: unknown;
        avatarUrl: unknown;
        role: unknown;
        organizationId: string;
        emailVerified: boolean;
        mfaEnabled: boolean;
        onboardingCompleted: boolean;
    }>;
    refreshTokens(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: unknown;
            email: unknown;
            name: unknown;
            role: unknown;
            organizationId: unknown;
            emailVerified: boolean;
            mfaEnabled: boolean;
            onboardingCompleted: boolean;
        };
    }>;
    logout(refreshToken: string): Promise<void>;
    sendMagicLink(email: string): Promise<{
        sent: boolean;
    }>;
    verifyMagicLink(token: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: unknown;
            email: unknown;
            name: unknown;
            role: unknown;
            organizationId: unknown;
            emailVerified: boolean;
            mfaEnabled: boolean;
            onboardingCompleted: boolean;
        };
    }>;
    requestPasswordReset(email: string, ip?: string): Promise<{
        sent: boolean;
    }>;
    resetPassword(token: string, newPassword: string): Promise<{
        reset: boolean;
    }>;
    changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{
        changed: boolean;
    }>;
    setupMfa(userId: string): Promise<{
        secret: string;
        otpauthUrl: string;
        qrCodeUrl: string;
    }>;
    enableMfa(userId: string, code: string): Promise<{
        enabled: boolean;
    }>;
    disableMfa(userId: string, code: string): Promise<{
        disabled: boolean;
    }>;
    getSessions(userId: string): Promise<Record<string, unknown>[]>;
    revokeSession(userId: string, sessionId: string): Promise<{
        revoked: boolean;
    }>;
    revokeAllSessions(userId: string): Promise<{
        revoked: boolean;
        revokedCount: number;
    }>;
    private generateTokens;
    private parseDuration;
}
//# sourceMappingURL=auth.service.d.ts.map