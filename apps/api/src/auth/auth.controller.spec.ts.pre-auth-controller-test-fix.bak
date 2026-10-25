import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// ── Mock service ──────────────────────────────────────────────

const createMockAuthService = () => ({
  register:             jest.fn(),
  login:                jest.fn(),
  refreshTokens:        jest.fn(),
  logout:               jest.fn(),
  verifyEmail:          jest.fn(),
  requestPasswordReset: jest.fn(),
  resetPassword:        jest.fn(),
  changePassword:       jest.fn(),
  setupMfa:             jest.fn(),
  enableMfa:            jest.fn(),
  disableMfa:           jest.fn(),
  sendMagicLink:        jest.fn(),
  verifyMagicLink:      jest.fn(),
  revokeAllSessions:    jest.fn(),
  getSessions:          jest.fn(),
  getProfile:           jest.fn(),
});

const mockUser = {
  id:           'user-1',
  email:        'innocent@lumorius.com',
  name:         'INNOCENT',
  role:         'admin',
  organization_id: 'org-1',
};

const mockTokens = {
  accessToken:  'mock-access-token',
  refreshToken: 'mock-refresh-token',
  user:         mockUser,
};

// ── Tests ─────────────────────────────────────────────────────

describe('AuthController', () => {
  let controller: AuthController;
  let authService: ReturnType<typeof createMockAuthService>;

  beforeEach(async () => {
    authService = createMockAuthService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  // ── register ─────────────────────────────────────────────────

  describe('register()', () => {
    it('delegates to authService.register and returns result', async () => {
      authService.register.mockResolvedValue(mockTokens);
      const dto = { email: 'innocent@lumorius.com', password: 'Pass123!', name: 'INNOCENT' };
      const result = await controller.register(dto as any);
      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockTokens);
    });

    it('propagates ConflictException from service', async () => {
      authService.register.mockRejectedValue(
        new HttpException('Email already registered', HttpStatus.CONFLICT),
      );
      await expect(controller.register({ email: 'dupe@test.com' } as any))
        .rejects.toThrow(HttpException);
    });
  });

  // ── login ─────────────────────────────────────────────────────

  describe('login()', () => {
    it('returns tokens on successful login', async () => {
      authService.login.mockResolvedValue(mockTokens);
      const result = await controller.login(
        { email: mockUser.email, password: 'Pass123!' } as any,
      );
      expect(result).toEqual(mockTokens);
    });

    it('propagates UnauthorizedException from service', async () => {
      authService.login.mockRejectedValue(
        new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED),
      );
      await expect(
        controller.login({ email: 'x@x.com', password: 'wrong' } as any),
      ).rejects.toThrow(HttpException);
    });
  });

  // ── refresh ───────────────────────────────────────────────────

  describe('refreshTokens()', () => {
    it('returns new token pair', async () => {
      authService.refreshTokens.mockResolvedValue(mockTokens);
      const result = await controller.refreshTokens({ refreshToken: 'old-token' });
      expect(authService.refreshTokens).toHaveBeenCalledWith('old-token');
      expect(result).toEqual(mockTokens);
    });
  });

  // ── logout ────────────────────────────────────────────────────

  describe('logout()', () => {
    it('calls authService.logout and returns success', async () => {
      authService.logout.mockResolvedValue({ success: true });
      const result = await controller.logout(
        { refreshToken: 'rt-token' },
        mockUser as any,
      );
      expect(authService.logout).toHaveBeenCalledWith(mockUser.id, 'rt-token');
      expect(result).toEqual({ success: true });
    });
  });

  // ── me ────────────────────────────────────────────────────────

  describe('getProfile()', () => {
    it('returns current user profile', async () => {
      authService.getProfile.mockResolvedValue(mockUser);
      const result = await controller.getProfile(mockUser as any);
      expect(authService.getProfile).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(mockUser);
    });
  });

  // ── verifyEmail ───────────────────────────────────────────────

  describe('verifyEmail()', () => {
    it('calls authService.verifyEmail with token', async () => {
      authService.verifyEmail.mockResolvedValue({ verified: true });
      const result = await controller.verifyEmail({ token: 'abc123' });
      expect(authService.verifyEmail).toHaveBeenCalledWith('abc123');
      expect(result).toEqual({ verified: true });
    });
  });

  // ── password reset ────────────────────────────────────────────

  describe('requestPasswordReset()', () => {
    it('always returns sent:true (no enumeration)', async () => {
      authService.requestPasswordReset.mockResolvedValue({ sent: true });
      const result = await controller.requestPasswordReset({ email: 'any@test.com' });
      expect(result).toEqual({ sent: true });
    });
  });

  // ── MFA ───────────────────────────────────────────────────────

  describe('setupMfa()', () => {
    it('returns TOTP secret and QR url', async () => {
      authService.setupMfa.mockResolvedValue({
        secret: 'BASE32SECRET',
        qrCodeUrl: 'otpauth://totp/...',
      });
      const result = await controller.setupMfa(mockUser as any);
      expect(authService.setupMfa).toHaveBeenCalledWith(mockUser.id);
      expect(result.secret).toBe('BASE32SECRET');
    });
  });

  // ── revokeAllSessions ─────────────────────────────────────────

  describe('revokeAllSessions()', () => {
    it('calls service and returns count', async () => {
      authService.revokeAllSessions.mockResolvedValue({ revoked: 3 });
      const result = await controller.revokeAllSessions(mockUser as any);
      expect(authService.revokeAllSessions).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual({ revoked: 3 });
    });
  });
});
