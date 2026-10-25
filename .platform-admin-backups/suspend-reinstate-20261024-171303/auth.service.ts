import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;
const VERIFY_TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_MINUTES = 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  // ── Registration ────────────────────────────────────────────

  async register(dto: {
    email: string;
    password: string;
    name: string;
    organizationName?: string;
  }) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.db.findOne('users', { email });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const userId = uuidv4();
    const orgId = uuidv4();
    const name = dto.name.trim();

    await this.db.transaction(async (client) => {
      if (dto.organizationName) {
        const slug = dto.organizationName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .substring(0, 50);
        await client.query(
          `INSERT INTO organizations (id, name, slug, plan_id)
           VALUES ($1, $2, $3, 'starter')`,
          [orgId, dto.organizationName, `${slug}-${Date.now()}`],
        );
      }

      await client.query(
        `INSERT INTO users (id, email, password_hash, name, organization_id, role, password_changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          userId,
          email,
          passwordHash,
          name,
          dto.organizationName ? orgId : null,
          dto.organizationName ? 'owner' : 'member',
        ],
      );
    });

    // Send verification email
    const verifyToken = uuidv4();
    await this.db.query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${VERIFY_TOKEN_TTL_HOURS} hours')`,
      [userId, verifyToken],
    );
    await this.emailService.sendVerificationEmail(email, name, verifyToken);
    await this.emailService.sendWelcome(email, name);

    const user = await this.db.findOne<Record<string, unknown>>('users', { id: userId });
    if (!user) throw new Error('User creation failed');
    return this.generateTokens(user);
  }

  // ── Email Verification ───────────────────────────────────────

  async verifyEmail(token: string) {
    const row = await this.db.findOne<Record<string, unknown>>(
      'email_verification_tokens',
      { token, used: false },
    );
    if (!row) throw new BadRequestException('Invalid or already-used verification link');
    if (new Date(row.expires_at as string) < new Date()) {
      throw new BadRequestException('Verification link has expired — request a new one');
    }

    await this.db.transaction(async (client) => {
      await client.query(
        'UPDATE email_verification_tokens SET used = TRUE WHERE id = $1',
        [row.id],
      );
      await client.query(
        'UPDATE users SET email_verified = TRUE WHERE id = $1',
        [row.user_id],
      );
    });

    return { verified: true };
  }

  async resendVerificationEmail(userId: string) {
    const user = await this.db.findOne<Record<string, unknown>>('users', { id: userId });
    if (!user) throw new BadRequestException('User not found');
    if (user.email_verified) throw new BadRequestException('Email already verified');

    // Invalidate existing tokens
    await this.db.query(
      'UPDATE email_verification_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE',
      [userId],
    );

    const token = uuidv4();
    await this.db.query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '${VERIFY_TOKEN_TTL_HOURS} hours')`,
      [userId, token],
    );
    await this.emailService.sendVerificationEmail(
      user.email as string,
      user.name as string,
      token,
    );
    return { sent: true };
  }

  // ── Login with brute-force protection ───────────────────────

  async login(email: string, password: string, mfaCode?: string, ip?: string, userAgent?: string) {
    const normalEmail = email.toLowerCase().trim();

    // Record attempt
    await this.db.query(
      `INSERT INTO login_attempts (email, ip_address, success, user_agent)
       VALUES ($1, $2, FALSE, $3)`,
      [normalEmail, ip ?? '0.0.0.0', userAgent ?? ''],
    ).catch(() => null);

    const user = await this.db.findOne<Record<string, unknown>>('users', { email: normalEmail });

    if (!user || !user.password_hash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Account lockout
    if (user.locked_until && new Date(user.locked_until as string) > new Date()) {
      const remaining = Math.ceil(
        (new Date(user.locked_until as string).getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Account temporarily locked. Try again in ${remaining} minute(s).`,
      );
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash as string);

    if (!passwordValid) {
      const failCount = (user.failed_login_count as number ?? 0) + 1;
      if (failCount >= MAX_FAILED_ATTEMPTS) {
        await this.db.query(
          `UPDATE users SET failed_login_count = $1,
             locked_until = NOW() + INTERVAL '${LOCKOUT_MINUTES} minutes'
           WHERE id = $2`,
          [failCount, user.id],
        );
        throw new ForbiddenException(
          `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
        );
      }
      await this.db.query(
        'UPDATE users SET failed_login_count = $1 WHERE id = $2',
        [failCount, user.id],
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!(user.is_active as boolean)) {
      throw new UnauthorizedException('Account is disabled. Contact support.');
    }

    // MFA check
    if (user.mfa_enabled) {
      if (!mfaCode) return { mfaRequired: true };
      const mfaValid = speakeasy.totp.verify({
        secret: user.mfa_secret as string,
        encoding: 'base32',
        token: mfaCode,
        window: 2,
      });
      if (!mfaValid) throw new UnauthorizedException('Invalid MFA code');
    }

    // Reset failed attempts
    await this.db.query(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW()
       WHERE id = $1`,
      [user.id],
    );

    // Update login attempt record
    await this.db.query(
      `UPDATE login_attempts SET success = TRUE
       WHERE id = (SELECT id FROM login_attempts WHERE email = $1 ORDER BY created_at DESC LIMIT 1)`,
      [normalEmail],
    ).catch(() => null);

    // Send login alert for new IPs (async — don't block login)
    this.emailService
      .sendLoginAlert(
        user.email as string,
        user.name as string,
        ip ?? 'unknown',
        userAgent ?? 'unknown device',
      )
      .catch(() => null);

    return this.generateTokens(user);
  }

  // ── Token refresh ────────────────────────────────────────────

  async getCurrentUser(userId: string) {
    const user = await this.db.findOne<Record<string, unknown>>(
      'users',
      { id: userId },
    );

    if (!user || user.is_active === false) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url ?? null,
      role: user.role,
      organizationId: (user.organization_id as string | null) ?? null,
      emailVerified: Boolean(user.email_verified),
      mfaEnabled: Boolean(user.mfa_enabled),
      onboardingCompleted: Boolean(user.onboarding_completed),
    };
  }
  async refreshTokens(refreshToken: string) {
    const session = await this.db.findOne<Record<string, unknown>>('sessions', {
      refresh_token: refreshToken,
      is_valid: true,
    });
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    if (new Date(session.expires_at as string) < new Date()) {
      await this.db.query(
        'UPDATE sessions SET is_valid = FALSE WHERE id = $1',
        [session.id],
      );
      throw new UnauthorizedException('Refresh token expired. Please sign in again.');
    }

    const user = await this.db.findOne<Record<string, unknown>>('users', { id: session.user_id });
    if (!user) throw new UnauthorizedException('User not found');

    const newRefreshToken = uuidv4();
    await this.db.query(
      `UPDATE sessions SET refresh_token = $1, last_active_at = NOW() WHERE id = $2`,
      [newRefreshToken, session.id],
    );
    return this.generateTokens(user, newRefreshToken);
  }

  async logout(refreshToken: string) {
    await this.db.query(
      'UPDATE sessions SET is_valid = FALSE WHERE refresh_token = $1',
      [refreshToken],
    );
  }

  // ── Magic link ───────────────────────────────────────────────

  async sendMagicLink(email: string) {
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.db.query(
      `INSERT INTO magic_links (email, token, expires_at) VALUES ($1, $2, $3)`,
      [email.toLowerCase(), token, expiresAt],
    );
    const appUrl = this.configService.get<string>('appUrl', 'http://localhost:3000');
    await this.emailService.sendMagicLink(email, `${appUrl}/auth/magic?token=${token}`);
    return { sent: true };
  }

  async verifyMagicLink(token: string) {
    const link = await this.db.findOne<Record<string, unknown>>('magic_links', {
      token,
      used: false,
    });
    if (!link) throw new BadRequestException('Invalid or expired magic link');
    if (new Date(link.expires_at as string) < new Date()) {
      throw new BadRequestException('Magic link expired');
    }

    await this.db.query('UPDATE magic_links SET used = TRUE WHERE id = $1', [link.id]);

    let user = await this.db.findOne<Record<string, unknown>>('users', {
      email: link.email,
    });

    if (!user) {
      const userId = uuidv4();
      const name = (link.email as string).split('@')[0];
      await this.db.query(
        `INSERT INTO users (id, email, name, email_verified) VALUES ($1, $2, $3, TRUE)`,
        [userId, link.email, name],
      );
      user = await this.db.findOne<Record<string, unknown>>('users', { id: userId });
    }

    if (!user) throw new Error('User creation failed');
    await this.db.query(
      'UPDATE users SET email_verified = TRUE, last_login_at = NOW() WHERE id = $1',
      [user.id],
    );
    return this.generateTokens(user);
  }

  // ── Password Reset ───────────────────────────────────────────

  async requestPasswordReset(email: string, ip?: string) {
    const user = await this.db.findOne<Record<string, unknown>>('users', {
      email: email.toLowerCase(),
    });
    // Always respond with success to prevent email enumeration
    if (!user) return { sent: true };

    await this.db.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE',
      [user.id],
    );

    const token = uuidv4();
    await this.db.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at, ip_address)
       VALUES ($1, $2, NOW() + INTERVAL '${RESET_TOKEN_TTL_MINUTES} minutes', $3)`,
      [user.id, token, ip ?? null],
    );
    await this.emailService.sendPasswordReset(
      user.email as string,
      user.name as string,
      token,
      ip,
    );
    return { sent: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const row = await this.db.findOne<Record<string, unknown>>('password_reset_tokens', {
      token,
      used: false,
    });
    if (!row) throw new BadRequestException('Invalid or expired reset link');
    if (new Date(row.expires_at as string) < new Date()) {
      throw new BadRequestException('Reset link has expired — request a new one');
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.db.transaction(async (client) => {
      await client.query(
        'UPDATE password_reset_tokens SET used = TRUE WHERE id = $1',
        [row.id],
      );
      await client.query(
        `UPDATE users SET password_hash = $1, password_changed_at = NOW(),
           failed_login_count = 0, locked_until = NULL WHERE id = $2`,
        [hash, row.user_id],
      );
      // Invalidate all sessions
      await client.query(
        'UPDATE sessions SET is_valid = FALSE WHERE user_id = $1',
        [row.user_id],
      );
    });
    return { reset: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.db.findOne<Record<string, unknown>>('users', { id: userId });
    if (!user?.password_hash) throw new BadRequestException('No password set');

    const valid = await bcrypt.compare(currentPassword, user.password_hash as string);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.db.query(
      `UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2`,
      [hash, userId],
    );
    return { changed: true };
  }

  // ── MFA ──────────────────────────────────────────────────────

  async setupMfa(userId: string) {
    const secret = speakeasy.generateSecret({ name: 'Lumorius AI', length: 32 });
    await this.db.query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret.base32, userId]);
    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(secret.otpauth_url ?? '')}`,
    };
  }

  async enableMfa(userId: string, code: string) {
    const user = await this.db.findOne<Record<string, unknown>>('users', { id: userId });
    if (!user?.mfa_secret) throw new BadRequestException('MFA not set up — call /mfa/setup first');
    const valid = speakeasy.totp.verify({
      secret: user.mfa_secret as string,
      encoding: 'base32',
      token: code,
      window: 2,
    });
    if (!valid) throw new BadRequestException('Invalid MFA code');
    await this.db.query('UPDATE users SET mfa_enabled = TRUE WHERE id = $1', [userId]);
    return { enabled: true };
  }

  async disableMfa(userId: string, code: string) {
    const user = await this.db.findOne<Record<string, unknown>>('users', { id: userId });
    if (!user?.mfa_enabled) throw new BadRequestException('MFA is not enabled');
    const valid = speakeasy.totp.verify({
      secret: user.mfa_secret as string,
      encoding: 'base32',
      token: code,
      window: 2,
    });
    if (!valid) throw new BadRequestException('Invalid MFA code');
    await this.db.query(
      'UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = $1',
      [userId],
    );
    return { disabled: true };
  }

  // ── Sessions ─────────────────────────────────────────────────

  async getSessions(userId: string) {
    const res = await this.db.query(
      `SELECT id, device_name, device_type, ip_address, user_agent, last_active_at, created_at
       FROM sessions WHERE user_id = $1 AND is_valid = TRUE ORDER BY last_active_at DESC`,
      [userId],
    );
    return res.rows;
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.db.query(
      'UPDATE sessions SET is_valid = FALSE WHERE id = $1 AND user_id = $2',
      [sessionId, userId],
    );
  }

  async revokeAllSessions(userId: string) {
    await this.db.query(
      'UPDATE sessions SET is_valid = FALSE WHERE user_id = $1',
      [userId],
    );
    return { revoked: true };
  }

  // ── Internal helpers ─────────────────────────────────────────

  private async generateTokens(
    user: Record<string, unknown>,
    existingRefreshToken?: string,
  ) {
    const payload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organization_id,
      role: user.role,
      emailVerified: Boolean(user.email_verified),
      onboardingCompleted: Boolean(user.onboarding_completed),
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = existingRefreshToken ?? uuidv4();

    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn', '7d');
    const expiresAt = new Date(Date.now() + this.parseDuration(refreshExpiresIn));

    if (!existingRefreshToken) {
      await this.db.query(
        `INSERT INTO sessions (user_id, refresh_token, expires_at) VALUES ($1, $2, $3)`,
        [user.id, refreshToken, expiresAt],
      );
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes
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

  private parseDuration(dur: string): number {
    const m = dur.match(/^(\d+)([smhd])$/);
    if (!m) return 7 * 86400000;
    const v = parseInt(m[1], 10);
    return v * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]] ?? 1000);
  }
}
