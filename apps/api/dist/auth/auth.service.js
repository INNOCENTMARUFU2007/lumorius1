"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const event_emitter_1 = require("@nestjs/event-emitter");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
const speakeasy = __importStar(require("speakeasy"));
const uuid_1 = require("uuid");
const database_service_1 = require("../database/database.service");
const email_service_1 = require("../common/email/email.service");
const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;
const VERIFY_TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_MINUTES = 60;
let AuthService = AuthService_1 = class AuthService {
    constructor(db, jwtService, configService, emailService, eventEmitter) {
        this.db = db;
        this.jwtService = jwtService;
        this.configService = configService;
        this.emailService = emailService;
        this.eventEmitter = eventEmitter;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    async register(dto) {
        const email = dto.email.toLowerCase().trim();
        const existing = await this.db.findOne('users', { email });
        if (existing)
            throw new common_1.ConflictException('Email already registered');
        const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
        const userId = (0, uuid_1.v4)();
        const orgId = (0, uuid_1.v4)();
        const name = dto.name.trim();
        await this.db.transaction(async (client) => {
            if (dto.organizationName) {
                const slug = dto.organizationName
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .substring(0, 50);
                await client.query(`INSERT INTO organizations (id, name, slug, plan_id)
           VALUES ($1, $2, $3, 'free')`, [orgId, dto.organizationName, `${slug}-${Date.now()}`]);
            }
            await client.query(`INSERT INTO users (id, email, password_hash, name, organization_id, role, password_changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`, [
                userId,
                email,
                passwordHash,
                name,
                dto.organizationName ? orgId : null,
                dto.organizationName ? 'owner' : 'member',
            ]);
        });
        const verifyToken = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO email_verification_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${VERIFY_TOKEN_TTL_HOURS} hours')`, [userId, verifyToken]);
        await this.emailService.sendVerificationEmail(email, name, verifyToken);
        await this.emailService.sendWelcome(email, name);
        const user = await this.db.findOne('users', { id: userId });
        if (!user)
            throw new Error('User creation failed');
        return this.generateTokens(user);
    }
    async verifyEmail(token) {
        const row = await this.db.findOne('email_verification_tokens', { token, used: false });
        if (!row)
            throw new common_1.BadRequestException('Invalid or already-used verification link');
        if (new Date(row.expires_at) < new Date()) {
            throw new common_1.BadRequestException('Verification link has expired — request a new one');
        }
        await this.db.transaction(async (client) => {
            await client.query('UPDATE email_verification_tokens SET used = TRUE WHERE id = $1', [row.id]);
            await client.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [row.user_id]);
        });
        return { verified: true };
    }
    async resendVerificationEmail(userId) {
        const user = await this.db.findOne('users', { id: userId });
        if (!user)
            throw new common_1.BadRequestException('User not found');
        if (user.email_verified)
            throw new common_1.BadRequestException('Email already verified');
        await this.db.query('UPDATE email_verification_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE', [userId]);
        const token = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO email_verification_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${VERIFY_TOKEN_TTL_HOURS} hours')`, [userId, token]);
        await this.emailService.sendVerificationEmail(user.email, user.name, token);
        return { sent: true };
    }
    async login(email, password, mfaCode, ip, userAgent) {
        const normalEmail = email.toLowerCase().trim();
        await this.db.query(`INSERT INTO login_attempts (email, ip_address, success, user_agent)
       VALUES ($1, $2, FALSE, $3)`, [normalEmail, ip ?? '0.0.0.0', userAgent ?? '']).catch(() => null);
        const user = await this.db.findOne('users', { email: normalEmail });
        if (!user || !user.password_hash) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const remaining = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
            throw new common_1.ForbiddenException(`Account temporarily locked. Try again in ${remaining} minute(s).`);
        }
        const passwordValid = await bcrypt.compare(password, user.password_hash);
        if (!passwordValid) {
            const failCount = (user.failed_login_count ?? 0) + 1;
            if (failCount >= MAX_FAILED_ATTEMPTS) {
                await this.db.query(`UPDATE users SET failed_login_count = $1,
             locked_until = NOW() + INTERVAL '${LOCKOUT_MINUTES} minutes'
           WHERE id = $2`, [failCount, user.id]);
                throw new common_1.ForbiddenException(`Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`);
            }
            await this.db.query('UPDATE users SET failed_login_count = $1 WHERE id = $2', [failCount, user.id]);
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (!user.is_active) {
            throw new common_1.UnauthorizedException('Account is disabled. Contact support.');
        }
        if (user.mfa_enabled) {
            if (!mfaCode)
                return { mfaRequired: true };
            const mfaValid = speakeasy.totp.verify({
                secret: user.mfa_secret,
                encoding: 'base32',
                token: mfaCode,
                window: 2,
            });
            if (!mfaValid)
                throw new common_1.UnauthorizedException('Invalid MFA code');
        }
        await this.db.query(`UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW()
       WHERE id = $1`, [user.id]);
        await this.db.query(`UPDATE login_attempts SET success = TRUE
       WHERE id = (SELECT id FROM login_attempts WHERE email = $1 ORDER BY created_at DESC LIMIT 1)`, [normalEmail]).catch(() => null);
        this.emailService
            .sendLoginAlert(user.email, user.name, ip ?? 'unknown', userAgent ?? 'unknown device')
            .catch(() => null);
        return this.generateTokens(user, undefined, undefined, { ipAddress: ip, userAgent });
    }
    async getCurrentUser(userId) {
        const user = await this.db.findOne('users', { id: userId });
        if (!user || user.is_active === false) {
            throw new common_1.UnauthorizedException('User not found or inactive');
        }
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatar_url ?? null,
            role: user.role,
            organizationId: user.organization_id ?? null,
            emailVerified: Boolean(user.email_verified),
            mfaEnabled: Boolean(user.mfa_enabled),
            onboardingCompleted: Boolean(user.onboarding_completed),
        };
    }
    async refreshTokens(refreshToken) {
        const session = await this.db.findOne('sessions', {
            refresh_token: refreshToken,
            is_valid: true,
        });
        if (!session)
            throw new common_1.UnauthorizedException('Invalid refresh token');
        if (new Date(session.expires_at) < new Date()) {
            await this.db.query('UPDATE sessions SET is_valid = FALSE WHERE id = $1', [session.id]);
            throw new common_1.UnauthorizedException('Refresh token expired. Please sign in again.');
        }
        const user = await this.db.findOne('users', {
            id: session.user_id,
        });
        if (!user || user.is_active === false) {
            await this.db.query('UPDATE sessions SET is_valid = FALSE WHERE user_id = $1', [session.user_id]);
            throw new common_1.UnauthorizedException('Account is disabled. Please contact support.');
        }
        const newRefreshToken = (0, uuid_1.v4)();
        await this.db.query(`UPDATE sessions SET refresh_token = $1, last_active_at = NOW() WHERE id = $2`, [newRefreshToken, session.id]);
        return this.generateTokens(user, newRefreshToken, String(session.id));
    }
    async logout(refreshToken) {
        await this.db.query('UPDATE sessions SET is_valid = FALSE WHERE refresh_token = $1', [refreshToken]);
    }
    async sendMagicLink(email) {
        const token = (0, uuid_1.v4)();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await this.db.query(`INSERT INTO magic_links (email, token, expires_at) VALUES ($1, $2, $3)`, [email.toLowerCase(), token, expiresAt]);
        const appUrl = this.configService.get('appUrl', 'http://localhost:3000');
        await this.emailService.sendMagicLink(email, `${appUrl}/auth/magic?token=${token}`);
        return { sent: true };
    }
    async verifyMagicLink(token) {
        const link = await this.db.findOne('magic_links', {
            token,
            used: false,
        });
        if (!link)
            throw new common_1.BadRequestException('Invalid or expired magic link');
        if (new Date(link.expires_at) < new Date()) {
            throw new common_1.BadRequestException('Magic link expired');
        }
        await this.db.query('UPDATE magic_links SET used = TRUE WHERE id = $1', [link.id]);
        let user = await this.db.findOne('users', {
            email: link.email,
        });
        if (!user) {
            const userId = (0, uuid_1.v4)();
            const name = link.email.split('@')[0];
            await this.db.query(`INSERT INTO users (id, email, name, email_verified) VALUES ($1, $2, $3, TRUE)`, [userId, link.email, name]);
            user = await this.db.findOne('users', { id: userId });
        }
        if (!user)
            throw new Error('User creation failed');
        await this.db.query('UPDATE users SET email_verified = TRUE, last_login_at = NOW() WHERE id = $1', [user.id]);
        return this.generateTokens(user);
    }
    async requestPasswordReset(email, ip) {
        const user = await this.db.findOne('users', {
            email: email.toLowerCase(),
        });
        if (!user)
            return { sent: true };
        await this.db.query('UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE', [user.id]);
        const token = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO password_reset_tokens (user_id, token, expires_at, ip_address)
       VALUES ($1, $2, NOW() + INTERVAL '${RESET_TOKEN_TTL_MINUTES} minutes', $3)`, [user.id, token, ip ?? null]);
        await this.emailService.sendPasswordReset(user.email, user.name, token, ip);
        return { sent: true };
    }
    async resetPassword(token, newPassword) {
        const row = await this.db.findOne('password_reset_tokens', {
            token,
            used: false,
        });
        if (!row)
            throw new common_1.BadRequestException('Invalid or expired reset link');
        if (new Date(row.expires_at) < new Date()) {
            throw new common_1.BadRequestException('Reset link has expired — request a new one');
        }
        const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await this.db.transaction(async (client) => {
            await client.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [row.id]);
            await client.query(`UPDATE users SET password_hash = $1, password_changed_at = NOW(),
           failed_login_count = 0, locked_until = NULL WHERE id = $2`, [hash, row.user_id]);
            await client.query('UPDATE sessions SET is_valid = FALSE WHERE user_id = $1', [row.user_id]);
        });
        return { reset: true };
    }
    async changePassword(userId, currentPassword, newPassword) {
        const user = await this.db.findOne('users', { id: userId });
        if (!user?.password_hash)
            throw new common_1.BadRequestException('No password set');
        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid)
            throw new common_1.UnauthorizedException('Current password is incorrect');
        const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await this.db.query(`UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2`, [hash, userId]);
        return { changed: true };
    }
    async setupMfa(userId) {
        const secret = speakeasy.generateSecret({ name: 'Lumorius AI', length: 32 });
        await this.db.query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret.base32, userId]);
        return {
            secret: secret.base32,
            otpauthUrl: secret.otpauth_url,
            qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(secret.otpauth_url ?? '')}`,
        };
    }
    async enableMfa(userId, code) {
        const user = await this.db.findOne('users', { id: userId });
        if (!user?.mfa_secret)
            throw new common_1.BadRequestException('MFA not set up — call /mfa/setup first');
        const valid = speakeasy.totp.verify({
            secret: user.mfa_secret,
            encoding: 'base32',
            token: code,
            window: 2,
        });
        if (!valid)
            throw new common_1.BadRequestException('Invalid MFA code');
        await this.db.query('UPDATE users SET mfa_enabled = TRUE WHERE id = $1', [userId]);
        return { enabled: true };
    }
    async disableMfa(userId, code) {
        const user = await this.db.findOne('users', { id: userId });
        if (!user?.mfa_enabled)
            throw new common_1.BadRequestException('MFA is not enabled');
        const valid = speakeasy.totp.verify({
            secret: user.mfa_secret,
            encoding: 'base32',
            token: code,
            window: 2,
        });
        if (!valid)
            throw new common_1.BadRequestException('Invalid MFA code');
        await this.db.query('UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = $1', [userId]);
        return { disabled: true };
    }
    async getSessions(userId) {
        const res = await this.db.query(`SELECT id, device_name, device_type, ip_address, user_agent, last_active_at, created_at
       FROM sessions WHERE user_id = $1 AND is_valid = TRUE ORDER BY last_active_at DESC`, [userId]);
        return res.rows;
    }
    async revokeSession(userId, sessionId) {
        const result = await this.db.query('UPDATE sessions SET is_valid = FALSE WHERE id = $1 AND user_id = $2 AND is_valid = TRUE RETURNING id', [sessionId, userId]);
        if (!result.rows?.length) {
            return { revoked: false };
        }
        await this.db.query(`INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
       SELECT organization_id, $1, 'security.session.revoked', 'session', $2, $3
       FROM users WHERE id = $1 AND organization_id IS NOT NULL`, [userId, sessionId, JSON.stringify({ source: 'security_centre' })]);
        return { revoked: true };
    }
    async revokeAllSessions(userId) {
        const result = await this.db.query('UPDATE sessions SET is_valid = FALSE WHERE user_id = $1 AND is_valid = TRUE RETURNING id', [userId]);
        const revokedCount = result.rows?.length ?? 0;
        if (revokedCount > 0) {
            await this.db.query(`INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
         SELECT organization_id, $1, 'security.sessions.revoked_all', 'session', NULL, $2
         FROM users WHERE id = $1 AND organization_id IS NOT NULL`, [userId, JSON.stringify({ revokedCount, source: 'security_centre' })]);
        }
        return { revoked: true, revokedCount };
    }
    async generateTokens(user, existingRefreshToken, existingSessionId, sessionContext = {}) {
        const payload = {
            sub: user.id,
            email: user.email,
            organizationId: user.organization_id,
            role: user.role,
            emailVerified: Boolean(user.email_verified),
            onboardingCompleted: Boolean(user.onboarding_completed),
        };
        const sessionId = existingSessionId ?? (0, uuid_1.v4)();
        const accessToken = this.jwtService.sign({ ...payload, sid: sessionId });
        const refreshToken = existingRefreshToken ?? (0, uuid_1.v4)();
        const refreshExpiresIn = this.configService.get('jwt.refreshExpiresIn', '7d');
        const expiresAt = new Date(Date.now() + this.parseDuration(refreshExpiresIn));
        if (!existingRefreshToken) {
            const sessionUserAgent = sessionContext.userAgent ?? '';
            const sessionDeviceType = /Android|iPhone|iPad|Mobile/i.test(sessionUserAgent) ? 'mobile' : 'desktop';
            const sessionBrowser = /Edg\//i.test(sessionUserAgent) ? 'Microsoft Edge'
                : /Chrome\//i.test(sessionUserAgent) ? 'Google Chrome'
                    : /Firefox\//i.test(sessionUserAgent) ? 'Firefox'
                        : /Safari\//i.test(sessionUserAgent) ? 'Safari'
                            : 'Browser';
            const sessionDeviceName = sessionUserAgent
                ? `${sessionBrowser} (${sessionDeviceType})`
                : 'Unknown device';
            await this.db.query(`INSERT INTO sessions (
           id, user_id, refresh_token, expires_at, device_name,
           device_type, ip_address, user_agent
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                sessionId,
                user.id,
                refreshToken,
                expiresAt,
                sessionDeviceName,
                sessionDeviceType,
                sessionContext.ipAddress ?? null,
                sessionUserAgent || null,
            ]);
            await this.db.query(`INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
         SELECT organization_id, $1, 'auth.session.created', 'session', $2, $3, $4, $5
         FROM users WHERE id = $1 AND organization_id IS NOT NULL`, [
                user.id,
                sessionId,
                JSON.stringify({ deviceName: sessionDeviceName, deviceType: sessionDeviceType }),
                sessionContext.ipAddress ?? null,
                sessionUserAgent || null,
            ]);
        }
        return {
            accessToken,
            refreshToken,
            expiresIn: 900,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                organizationId: user.organization_id ?? null,
                emailVerified: Boolean(user.email_verified),
                mfaEnabled: Boolean(user.mfa_enabled),
                onboardingCompleted: Boolean(user.onboarding_completed),
            },
        };
    }
    parseDuration(dur) {
        const m = dur.match(/^(\d+)([smhd])$/);
        if (!m)
            return 7 * 86400000;
        const v = parseInt(m[1], 10);
        return v * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]] ?? 1000);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        jwt_1.JwtService,
        config_1.ConfigService,
        email_service_1.EmailService,
        event_emitter_1.EventEmitter2])
], AuthService);
//# sourceMappingURL=auth.service.js.map