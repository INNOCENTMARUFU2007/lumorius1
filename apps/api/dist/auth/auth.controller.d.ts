import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MagicLinkDto } from './dto/magic-link.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { EnableMfaDto } from './dto/enable-mfa.dto';
import { JwtPayload } from '../common/decorators/current-user.decorator';
declare class VerifyEmailDto {
    token: string;
}
declare class ResetRequestDto {
    email: string;
}
declare class ResetPasswordDto {
    token: string;
    newPassword: string;
}
declare class ChangePasswordDto {
    currentPassword: string;
    newPassword: string;
}
declare class DisableMfaDto {
    code: string;
}
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: unknown;
            email: unknown;
            name: unknown;
            role: unknown;
            organizationId: unknown;
            emailVerified: unknown;
            mfaEnabled: unknown;
        };
    }>;
    login(dto: LoginDto, req?: Request, ip?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: unknown;
            email: unknown;
            name: unknown;
            role: unknown;
            organizationId: unknown;
            emailVerified: unknown;
            mfaEnabled: unknown;
        };
    } | {
        mfaRequired: boolean;
    }>;
    refresh(dto: RefreshTokenDto): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: unknown;
            email: unknown;
            name: unknown;
            role: unknown;
            organizationId: unknown;
            emailVerified: unknown;
            mfaEnabled: unknown;
        };
    }>;
    refreshTokens(dto: RefreshTokenDto): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: unknown;
            email: unknown;
            name: unknown;
            role: unknown;
            organizationId: unknown;
            emailVerified: unknown;
            mfaEnabled: unknown;
        };
    }>;
    logout(dto: RefreshTokenDto, _user?: JwtPayload): Promise<void>;
    verifyEmail(dto: VerifyEmailDto): Promise<{
        verified: boolean;
    }>;
    resendVerification(user: JwtPayload): Promise<{
        sent: boolean;
    }>;
    forgotPassword(dto: ResetRequestDto, ip: string): Promise<{
        sent: boolean;
    }>;
    requestPasswordReset(dto: ResetRequestDto): Promise<{
        sent: boolean;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        reset: boolean;
    }>;
    changePassword(user: JwtPayload, dto: ChangePasswordDto): Promise<{
        changed: boolean;
    }>;
    sendMagicLink(dto: MagicLinkDto): Promise<{
        sent: boolean;
    }>;
    verifyMagicLink(dto: {
        token: string;
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
            emailVerified: unknown;
            mfaEnabled: unknown;
        };
    }>;
    setupMfa(user: JwtPayload): Promise<{
        secret: string;
        otpauthUrl: string;
        qrCodeUrl: string;
    }>;
    enableMfa(user: JwtPayload, dto: EnableMfaDto): Promise<{
        enabled: boolean;
    }>;
    disableMfa(user: JwtPayload, dto: DisableMfaDto): Promise<{
        disabled: boolean;
    }>;
    getSessions(user: JwtPayload, _unused?: unknown): Promise<Record<string, unknown>[]>;
    revokeAll(user: JwtPayload): Promise<{
        revoked: boolean;
    }>;
    revokeAllSessions(user: JwtPayload): Promise<{
        revoked: boolean;
    }>;
    revokeSession(user: JwtPayload, sessionId: string): Promise<void>;
    googleAuth(): Promise<void>;
    googleCallback(req: Request): Promise<Express.User>;
    me(user: JwtPayload): Promise<JwtPayload>;
    getProfile(user: JwtPayload): Promise<JwtPayload>;
}
export {};
//# sourceMappingURL=auth.controller.d.ts.map