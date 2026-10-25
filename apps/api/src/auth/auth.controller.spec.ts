import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

// â”€â”€ Mock service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  sub: 'user-1',
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

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ register â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ refresh â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('refreshTokens()', () => {
    it('returns new token pair', async () => {
      authService.refreshTokens.mockResolvedValue(mockTokens);
      const result = await controller.refreshTokens({ refreshToken: 'old-token' });
      expect(authService.refreshTokens).toHaveBeenCalledWith('old-token');
      expect(result).toEqual(mockTokens);
    });
  });

  // â”€â”€ logout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('logout()', () => {
    it('calls authService.logout and returns success', async () => {
      authService.logout.mockResolvedValue({ success: true });
      const result = await controller.logout(
        { refreshToken: 'rt-token' },
        mockUser as any,
      );
      expect(authService.logout).toHaveBeenCalledWith('rt-token');
      expect(result).toEqual({ success: true });
    });
  });

  // â”€â”€ me â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('getProfile()', () => {
    it('returns current user profile', async () => {

      const result = await controller.getProfile(mockUser as any);
      expect(authService.getProfile).not.toHaveBeenCalled();
      expect(result).toEqual(mockUser);
    });
  });

  // â”€â”€ verifyEmail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('verifyEmail()', () => {
    it('calls authService.verifyEmail with token', async () => {
      authService.verifyEmail.mockResolvedValue({ verified: true });
      const result = await controller.verifyEmail({ token: 'abc123' });
      expect(authService.verifyEmail).toHaveBeenCalledWith('abc123');
      expect(result).toEqual({ verified: true });
    });
  });

  // â”€â”€ password reset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('requestPasswordReset()', () => {
    it('always returns sent:true (no enumeration)', async () => {
      authService.requestPasswordReset.mockResolvedValue({ sent: true });
      const result = await controller.requestPasswordReset({ email: 'any@test.com' });
      expect(result).toEqual({ sent: true });
    });
  });

  // â”€â”€ MFA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('setupMfa()', () => {
    it('returns TOTP secret and QR url', async () => {
      authService.setupMfa.mockResolvedValue({
        secret: 'BASE32SECRET',
        qrCodeUrl: 'otpauth://totp/...',
      });
      const result = await controller.setupMfa(mockUser as any);
      expect(authService.setupMfa).toHaveBeenCalledWith(mockUser.sub);
      expect(result.secret).toBe('BASE32SECRET');
    });
  });

  // â”€â”€ revokeAllSessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('revokeAllSessions()', () => {
    it('calls service and returns count', async () => {
      authService.revokeAllSessions.mockResolvedValue({ revoked: true, revokedCount: 3 });
      const result = await controller.revokeAllSessions(mockUser as any);
      expect(authService.revokeAllSessions).toHaveBeenCalledWith(mockUser.sub);
      expect(result).toEqual({ revoked: true, revokedCount: 3 });
    });
  });
});

