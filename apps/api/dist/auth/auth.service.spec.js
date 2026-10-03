"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const helpers_1 = require("../test/helpers");
jest.mock('bcrypt', () => ({
    hash: jest.fn().mockResolvedValue('$2b$12$hashed'),
    compare: jest.fn().mockResolvedValue(true),
}));
jest.mock('speakeasy', () => ({
    generateSecret: jest.fn().mockReturnValue({
        base32: 'JBSWY3DPEHPK3PXP',
        otpauth_url: 'otpauth://totp/Lumorius%20AI?secret=JBSWY3DPEHPK3PXP',
    }),
    totp: {
        verify: jest.fn().mockReturnValue(true),
    },
}));
jest.mock('uuid', () => ({
    v4: jest.fn().mockReturnValue(helpers_1.FIXED_UUID),
}));
describe('AuthService', () => {
    let service;
    let db;
    let emailService;
    let jwtService;
    let configService;
    beforeEach(async () => {
        db = (0, helpers_1.createMockDatabaseService)();
        emailService = (0, helpers_1.createMockEmailService)();
        jwtService = (0, helpers_1.createMockJwtService)();
        configService = (0, helpers_1.createMockConfigService)();
        const module = await testing_1.Test.createTestingModule({
            providers: [
                auth_service_1.AuthService,
                { provide: 'DatabaseService', useValue: db },
                { provide: 'JwtService', useValue: jwtService },
                { provide: 'ConfigService', useValue: configService },
                { provide: 'EmailService', useValue: emailService },
            ],
        })
            .overrideProvider(auth_service_1.AuthService)
            .useFactory({
            factory: () => new auth_service_1.AuthService(db, jwtService, configService, emailService),
        })
            .compile();
        service = module.get(auth_service_1.AuthService);
        jest.clearAllMocks();
        jwtService.sign.mockReturnValue('mock.jwt.access.token');
        configService.get.mockImplementation((key, fallback) => {
            const vals = {
                appUrl: 'http://localhost:3000',
                'jwt.refreshExpiresIn': '7d',
            };
            return vals[key] ?? fallback;
        });
    });
    describe('register()', () => {
        const dto = {
            email: 'new@example.com',
            password: 'Password123!',
            name: 'New User',
            organizationName: 'New Corp',
        };
        it('creates user, org, sends emails, returns tokens', async () => {
            const createdUser = (0, helpers_1.makeUser)({ id: helpers_1.FIXED_UUID, email: 'new@example.com', name: 'New User' });
            db.findOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(createdUser);
            const result = await service.register(dto);
            expect(db.findOne).toHaveBeenCalledWith('users', { email: 'new@example.com' });
            expect(db.transaction).toHaveBeenCalledTimes(1);
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO email_verification_tokens'), expect.any(Array));
            expect(emailService.sendVerificationEmail).toHaveBeenCalledWith('new@example.com', 'New User', helpers_1.FIXED_UUID);
            expect(emailService.sendWelcome).toHaveBeenCalledWith('new@example.com', 'New User');
            expect(result).toMatchObject({
                accessToken: 'mock.jwt.access.token',
                refreshToken: expect.any(String),
                expiresIn: 900,
            });
        });
        it('normalises email to lowercase', async () => {
            const upperDto = { ...dto, email: 'UPPER@EXAMPLE.COM' };
            const createdUser = (0, helpers_1.makeUser)({ email: 'upper@example.com' });
            db.findOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(createdUser);
            await service.register(upperDto);
            expect(db.findOne).toHaveBeenCalledWith('users', { email: 'upper@example.com' });
        });
        it('throws ConflictException when email already exists', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeUser)());
            await expect(service.register(dto)).rejects.toThrow(common_1.ConflictException);
            expect(db.transaction).not.toHaveBeenCalled();
        });
        it('registers without organisation when organizationName is omitted', async () => {
            const noOrgDto = { email: 'solo@example.com', password: 'Pass123!', name: 'Solo User' };
            const user = (0, helpers_1.makeUser)({ email: 'solo@example.com', organization_id: null, role: 'member' });
            db.findOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(user);
            const result = await service.register(noOrgDto);
            expect(result.user.role).toBe('member');
        });
    });
    describe('login()', () => {
        const bcrypt = require('bcrypt');
        it('returns tokens on valid credentials', async () => {
            const user = (0, helpers_1.makeUser)();
            db.findOne.mockResolvedValue(user);
            bcrypt.compare.mockResolvedValue(true);
            const result = await service.login('innocent@example.com', 'correctpassword');
            expect(result).toMatchObject({
                accessToken: 'mock.jwt.access.token',
                refreshToken: expect.any(String),
            });
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining("failed_login_count = 0"), expect.any(Array));
        });
        it('throws UnauthorizedException when user not found', async () => {
            db.findOne.mockResolvedValue(null);
            await expect(service.login('nobody@example.com', 'pw')).rejects.toThrow(common_1.UnauthorizedException);
        });
        it('throws UnauthorizedException on wrong password', async () => {
            db.findOne.mockResolvedValue((0, helpers_1.makeUser)({ failed_login_count: 0 }));
            bcrypt.compare.mockResolvedValue(false);
            await expect(service.login('innocent@example.com', 'wrongpassword')).rejects.toThrow(common_1.UnauthorizedException);
        });
        it('increments failed_login_count on wrong password', async () => {
            db.findOne.mockResolvedValue((0, helpers_1.makeUser)({ failed_login_count: 2 }));
            bcrypt.compare.mockResolvedValue(false);
            await expect(service.login('innocent@example.com', 'wrong')).rejects.toThrow(common_1.UnauthorizedException);
            expect(db.query).toHaveBeenCalledWith('UPDATE users SET failed_login_count = $1 WHERE id = $2', [3, helpers_1.FIXED_UUID]);
        });
        it('locks account after 5 failed attempts', async () => {
            db.findOne.mockResolvedValue((0, helpers_1.makeUser)({ failed_login_count: 4 }));
            bcrypt.compare.mockResolvedValue(false);
            await expect(service.login('innocent@example.com', 'wrong')).rejects.toThrow(common_1.ForbiddenException);
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('locked_until'), expect.arrayContaining([5, helpers_1.FIXED_UUID]));
        });
        it('throws ForbiddenException when account is locked', async () => {
            const futureDate = new Date(Date.now() + 1800000);
            db.findOne.mockResolvedValue((0, helpers_1.makeUser)({ locked_until: futureDate.toISOString() }));
            await expect(service.login('innocent@example.com', 'anything')).rejects.toThrow(common_1.ForbiddenException);
        });
        it('throws UnauthorizedException when account is disabled', async () => {
            db.findOne.mockResolvedValue((0, helpers_1.makeUser)({ is_active: false }));
            bcrypt.compare.mockResolvedValue(true);
            await expect(service.login('innocent@example.com', 'pw')).rejects.toThrow(common_1.UnauthorizedException);
        });
        it('returns { mfaRequired: true } when MFA enabled and no code provided', async () => {
            db.findOne.mockResolvedValue((0, helpers_1.makeUser)({ mfa_enabled: true, mfa_secret: 'SECRET' }));
            bcrypt.compare.mockResolvedValue(true);
            const result = await service.login('innocent@example.com', 'correctpw');
            expect(result).toEqual({ mfaRequired: true });
        });
        it('returns tokens when valid MFA code is provided', async () => {
            const speakeasy = require('speakeasy');
            db.findOne.mockResolvedValue((0, helpers_1.makeUser)({ mfa_enabled: true, mfa_secret: 'SECRET' }));
            bcrypt.compare.mockResolvedValue(true);
            speakeasy.totp.verify.mockReturnValue(true);
            const result = await service.login('innocent@example.com', 'pw', '123456');
            expect(result).toMatchObject({ accessToken: 'mock.jwt.access.token' });
        });
        it('throws UnauthorizedException on invalid MFA code', async () => {
            const speakeasy = require('speakeasy');
            db.findOne.mockResolvedValue((0, helpers_1.makeUser)({ mfa_enabled: true, mfa_secret: 'SECRET' }));
            bcrypt.compare.mockResolvedValue(true);
            speakeasy.totp.verify.mockReturnValue(false);
            await expect(service.login('innocent@example.com', 'pw', '000000')).rejects.toThrow(common_1.UnauthorizedException);
        });
        it('sends login alert email (non-blocking)', async () => {
            db.findOne.mockResolvedValue((0, helpers_1.makeUser)());
            bcrypt.compare.mockResolvedValue(true);
            await service.login('innocent@example.com', 'pw', undefined, '1.2.3.4', 'Chrome/120');
            expect(emailService.sendLoginAlert).toHaveBeenCalledWith('innocent@example.com', 'Innocent Tester', '1.2.3.4', 'Chrome/120');
        });
    });
    describe('refreshTokens()', () => {
        it('returns new tokens for a valid refresh token', async () => {
            const session = (0, helpers_1.makeSession)();
            const user = (0, helpers_1.makeUser)();
            db.findOne
                .mockResolvedValueOnce(session)
                .mockResolvedValueOnce(user);
            const result = await service.refreshTokens('valid-refresh-token');
            expect(result).toMatchObject({ accessToken: 'mock.jwt.access.token' });
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE sessions SET refresh_token'), expect.any(Array));
        });
        it('throws UnauthorizedException for invalid refresh token', async () => {
            db.findOne.mockResolvedValue(null);
            await expect(service.refreshTokens('invalid-token')).rejects.toThrow(common_1.UnauthorizedException);
        });
        it('throws UnauthorizedException and invalidates expired session', async () => {
            const expiredSession = (0, helpers_1.makeSession)({
                expires_at: new Date(Date.now() - 1000),
            });
            db.findOne.mockResolvedValueOnce(expiredSession);
            await expect(service.refreshTokens('expired-token')).rejects.toThrow(common_1.UnauthorizedException);
            expect(db.query).toHaveBeenCalledWith('UPDATE sessions SET is_valid = FALSE WHERE id = $1', [expiredSession.id]);
        });
    });
    describe('logout()', () => {
        it('invalidates the session for the given refresh token', async () => {
            await service.logout('some-refresh-token');
            expect(db.query).toHaveBeenCalledWith('UPDATE sessions SET is_valid = FALSE WHERE refresh_token = $1', ['some-refresh-token']);
        });
    });
    describe('verifyEmail()', () => {
        it('marks email as verified and token as used', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeVerificationToken)());
            const result = await service.verifyEmail('valid-verify-token');
            expect(result).toEqual({ verified: true });
            expect(db.transaction).toHaveBeenCalledTimes(1);
        });
        it('throws BadRequestException for unknown token', async () => {
            db.findOne.mockResolvedValueOnce(null);
            await expect(service.verifyEmail('bad-token')).rejects.toThrow(common_1.BadRequestException);
        });
        it('throws BadRequestException for expired token', async () => {
            const expired = (0, helpers_1.makeVerificationToken)({
                expires_at: new Date(Date.now() - 1000),
            });
            db.findOne.mockResolvedValueOnce(expired);
            await expect(service.verifyEmail('expired-token')).rejects.toThrow(common_1.BadRequestException);
        });
    });
    describe('requestPasswordReset()', () => {
        it('sends reset email when user exists', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeUser)());
            const result = await service.requestPasswordReset('innocent@example.com', '10.0.0.1');
            expect(result).toEqual({ sent: true });
            expect(emailService.sendPasswordReset).toHaveBeenCalledWith('innocent@example.com', 'Innocent Tester', helpers_1.FIXED_UUID, '10.0.0.1');
        });
        it('returns { sent: true } without email when user not found (prevents enumeration)', async () => {
            db.findOne.mockResolvedValueOnce(null);
            const result = await service.requestPasswordReset('nobody@example.com');
            expect(result).toEqual({ sent: true });
            expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
        });
    });
    describe('resetPassword()', () => {
        it('updates password hash and invalidates sessions', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeResetToken)());
            const result = await service.resetPassword('valid-reset-token', 'NewPass123!');
            expect(result).toEqual({ reset: true });
            expect(db.transaction).toHaveBeenCalledTimes(1);
        });
        it('throws BadRequestException for invalid token', async () => {
            db.findOne.mockResolvedValueOnce(null);
            await expect(service.resetPassword('bad-token', 'NewPass123!')).rejects.toThrow(common_1.BadRequestException);
        });
        it('throws BadRequestException for expired token', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeResetToken)({ expires_at: new Date(Date.now() - 1000) }));
            await expect(service.resetPassword('expired', 'NewPass123!')).rejects.toThrow(common_1.BadRequestException);
        });
    });
    describe('changePassword()', () => {
        const bcrypt = require('bcrypt');
        it('updates password when current password is correct', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeUser)());
            bcrypt.compare.mockResolvedValue(true);
            const result = await service.changePassword(helpers_1.FIXED_UUID, 'OldPass!', 'NewPass!');
            expect(result).toEqual({ changed: true });
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET password_hash'), expect.any(Array));
        });
        it('throws UnauthorizedException when current password is wrong', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeUser)());
            bcrypt.compare.mockResolvedValue(false);
            await expect(service.changePassword(helpers_1.FIXED_UUID, 'WrongPass!', 'NewPass!')).rejects.toThrow(common_1.UnauthorizedException);
        });
        it('throws BadRequestException when user has no password (OAuth-only account)', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeUser)({ password_hash: null }));
            await expect(service.changePassword(helpers_1.FIXED_UUID, 'old', 'new')).rejects.toThrow(common_1.BadRequestException);
        });
    });
    describe('setupMfa()', () => {
        it('generates TOTP secret and stores it', async () => {
            const result = await service.setupMfa(helpers_1.FIXED_UUID);
            expect(result).toMatchObject({
                secret: 'JBSWY3DPEHPK3PXP',
                otpauthUrl: expect.stringContaining('otpauth://'),
                qrCodeUrl: expect.stringContaining('qrserver.com'),
            });
            expect(db.query).toHaveBeenCalledWith('UPDATE users SET mfa_secret = $1 WHERE id = $2', ['JBSWY3DPEHPK3PXP', helpers_1.FIXED_UUID]);
        });
    });
    describe('enableMfa()', () => {
        const speakeasy = require('speakeasy');
        it('enables MFA when code is valid', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeUser)({ mfa_secret: 'JBSWY3DPEHPK3PXP' }));
            speakeasy.totp.verify.mockReturnValue(true);
            const result = await service.enableMfa(helpers_1.FIXED_UUID, '123456');
            expect(result).toEqual({ enabled: true });
            expect(db.query).toHaveBeenCalledWith('UPDATE users SET mfa_enabled = TRUE WHERE id = $1', [helpers_1.FIXED_UUID]);
        });
        it('throws BadRequestException when MFA not set up', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeUser)({ mfa_secret: null }));
            await expect(service.enableMfa(helpers_1.FIXED_UUID, '123456')).rejects.toThrow(common_1.BadRequestException);
        });
        it('throws BadRequestException on invalid code', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeUser)({ mfa_secret: 'SECRET' }));
            speakeasy.totp.verify.mockReturnValue(false);
            await expect(service.enableMfa(helpers_1.FIXED_UUID, '000000')).rejects.toThrow(common_1.BadRequestException);
        });
    });
    describe('disableMfa()', () => {
        const speakeasy = require('speakeasy');
        it('disables MFA when code is valid', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeUser)({ mfa_enabled: true, mfa_secret: 'SECRET' }));
            speakeasy.totp.verify.mockReturnValue(true);
            const result = await service.disableMfa(helpers_1.FIXED_UUID, '123456');
            expect(result).toEqual({ disabled: true });
            expect(db.query).toHaveBeenCalledWith('UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL WHERE id = $1', [helpers_1.FIXED_UUID]);
        });
        it('throws BadRequestException when MFA is not enabled', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeUser)({ mfa_enabled: false }));
            await expect(service.disableMfa(helpers_1.FIXED_UUID, '123456')).rejects.toThrow(common_1.BadRequestException);
        });
    });
    describe('sendMagicLink()', () => {
        it('inserts a magic link and sends email', async () => {
            await service.sendMagicLink('innocent@example.com');
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO magic_links'), expect.any(Array));
            expect(emailService.sendMagicLink).toHaveBeenCalledWith('innocent@example.com', expect.stringContaining('/auth/magic?token='));
        });
    });
    describe('verifyMagicLink()', () => {
        it('signs in existing user via magic link', async () => {
            const user = (0, helpers_1.makeUser)();
            db.findOne
                .mockResolvedValueOnce((0, helpers_1.makeMagicLink)())
                .mockResolvedValueOnce(user)
                .mockResolvedValueOnce(user);
            const result = await service.verifyMagicLink('valid-magic-token');
            expect(result).toMatchObject({ accessToken: 'mock.jwt.access.token' });
            expect(db.query).toHaveBeenCalledWith('UPDATE magic_links SET used = TRUE WHERE id = $1', [(0, helpers_1.makeMagicLink)().id]);
        });
        it('creates new user when email not found', async () => {
            const newUser = (0, helpers_1.makeUser)({ email: 'brand-new@example.com' });
            db.findOne
                .mockResolvedValueOnce((0, helpers_1.makeMagicLink)({ email: 'brand-new@example.com' }))
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(newUser)
                .mockResolvedValueOnce(newUser);
            const result = await service.verifyMagicLink('valid-magic-token');
            expect(result.user.email).toBe('brand-new@example.com');
        });
        it('throws BadRequestException for invalid magic link', async () => {
            db.findOne.mockResolvedValueOnce(null);
            await expect(service.verifyMagicLink('bad-token')).rejects.toThrow(common_1.BadRequestException);
        });
        it('throws BadRequestException for expired magic link', async () => {
            db.findOne.mockResolvedValueOnce((0, helpers_1.makeMagicLink)({ expires_at: new Date(Date.now() - 1000) }));
            await expect(service.verifyMagicLink('expired-token')).rejects.toThrow(common_1.BadRequestException);
        });
    });
    describe('revokeAllSessions()', () => {
        it('invalidates all sessions for the user', async () => {
            const result = await service.revokeAllSessions(helpers_1.FIXED_UUID);
            expect(result).toEqual({ revoked: true });
            expect(db.query).toHaveBeenCalledWith('UPDATE sessions SET is_valid = FALSE WHERE user_id = $1', [helpers_1.FIXED_UUID]);
        });
    });
});
//# sourceMappingURL=auth.service.spec.js.map