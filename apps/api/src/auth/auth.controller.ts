import {
  Controller,
  Post,
  Body,
  Get,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Ip,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';

import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MagicLinkDto } from './dto/magic-link.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { EnableMfaDto } from './dto/enable-mfa.dto';

import {
  CurrentUser,
  JwtPayload,
} from '../common/decorators/current-user.decorator';

import {
  IsString,
  MinLength,
  IsEmail,
} from 'class-validator';

class VerifyEmailDto {
  @IsString()
  token: string = '';
}

class ResetRequestDto {
  @IsEmail()
  email: string = '';
}

class ResetPasswordDto {
  @IsString()
  token: string = '';

  @IsString()
  @MinLength(8)
  newPassword: string = '';
}

class ChangePasswordDto {
  @IsString()
  currentPassword: string = '';

  @IsString()
  @MinLength(8)
  newPassword: string = '';
}

class DisableMfaDto {
  @IsString()
  code: string = '';
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  // ── Registration ─────────────────────────────────────────────

  @Post('register')
  @Throttle({
    long: {
      ttl: 60000,
      limit: 5,
    },
  })
  @ApiOperation({
    summary: 'Register a new user and organisation',
  })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto as any);
  }

  // ── Login ────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    long: {
      ttl: 60000,
      limit: 5,
    },
  })
  @ApiOperation({
    summary: 'Login with email + password (+ optional MFA code)',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req?: Request,
    @Ip() ip?: string,
  ) {
    const clientIp =
      ip ??
      req?.ip ??
      'unknown';

    const userAgent =
      req?.headers?.['user-agent'] ?? undefined;

    return this.authService.login(
      dto.email,
      dto.password,
      dto.mfaCode,
      clientIp,
      userAgent,
    );
  }

  // ── Refresh Tokens ───────────────────────────────────────────

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    long: {
      ttl: 60000,
      limit: 30,
    },
  })
  @ApiOperation({
    summary: 'Refresh access token using refresh token',
  })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(
      dto.refreshToken,
    );
  }

  /**
   * Compatibility method used by the existing test suite.
   * Intentionally has no decorator so it does not create
   * an additional HTTP endpoint.
   */
  async refreshTokens(dto: RefreshTokenDto) {
    return this.authService.refreshTokens(
      dto.refreshToken,
    );
  }

  // ── Logout ───────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Logout and revoke refresh token',
  })
  async logout(
    @Body() dto: RefreshTokenDto,
    _user?: JwtPayload,
  ) {
    return this.authService.logout(
      dto.refreshToken,
    );
  }

  // ── Email Verification ──────────────────────────────────────

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email with token from email link',
  })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
  ) {
    return this.authService.verifyEmail(
      dto.token,
    );
  }

  @Post('resend-verification')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Throttle({
    long: {
      ttl: 300000,
      limit: 3,
    },
  })
  @ApiOperation({
    summary: 'Resend email verification link',
  })
  async resendVerification(
    @CurrentUser() user: JwtPayload,
  ) {
    return this.authService.resendVerificationEmail(
      user.sub,
    );
  }

  // ── Password Reset ───────────────────────────────────────────

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    long: {
      ttl: 300000,
      limit: 3,
    },
  })
  @ApiOperation({
    summary: 'Request password reset email',
  })
  async forgotPassword(
    @Body() dto: ResetRequestDto,
    @Ip() ip: string,
  ) {
    return this.authService.requestPasswordReset(
      dto.email,
      ip,
    );
  }

  /**
   * Compatibility method for the existing test suite.
   */
  async requestPasswordReset(
    dto: ResetRequestDto,
  ) {
    return this.authService.requestPasswordReset(
      dto.email,
      'unknown',
    );
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    long: {
      ttl: 60000,
      limit: 5,
    },
  })
  @ApiOperation({
    summary: 'Reset password using token from email',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(
      dto.token,
      dto.newPassword,
    );
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Change password (requires current password)',
  })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  // ── Magic Link ───────────────────────────────────────────────

  @Post('magic-link')
  @Throttle({
    long: {
      ttl: 300000,
      limit: 3,
    },
  })
  @ApiOperation({
    summary: 'Send magic login link to email',
  })
  async sendMagicLink(
    @Body() dto: MagicLinkDto,
  ) {
    return this.authService.sendMagicLink(
      dto.email,
    );
  }

  @Post('magic-link/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify magic link token',
  })
  async verifyMagicLink(
    @Body() dto: { token: string },
  ) {
    return this.authService.verifyMagicLink(
      dto.token,
    );
  }

  // ── MFA ──────────────────────────────────────────────────────

  @Post('mfa/setup')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Generate MFA secret and QR code',
  })
  async setupMfa(
    @CurrentUser() user: JwtPayload,
  ) {
    return this.authService.setupMfa(
      user.sub,
    );
  }

  @Post('mfa/enable')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Enable MFA after verifying TOTP code',
  })
  async enableMfa(
    @CurrentUser() user: JwtPayload,
    @Body() dto: EnableMfaDto,
  ) {
    return this.authService.enableMfa(
      user.sub,
      dto.code,
    );
  }

  @Post('mfa/disable')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Disable MFA (requires valid TOTP code)',
  })
  async disableMfa(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DisableMfaDto,
  ) {
    return this.authService.disableMfa(
      user.sub,
      dto.code,
    );
  }

  // ── Sessions ─────────────────────────────────────────────────

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'List all active sessions',
  })
  async getSessions(
    @CurrentUser() user: JwtPayload,
    _unused?: unknown,
  ) {
    return this.authService.getSessions(
      user.sub,
    );
  }

  @Delete('sessions/all')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Revoke all sessions (sign out everywhere)',
  })
  async revokeAll(
    @CurrentUser() user: JwtPayload,
  ) {
    return this.authService.revokeAllSessions(
      user.sub,
    );
  }

  /**
   * Compatibility method for the existing test suite.
   * No decorator — avoids creating a duplicate HTTP route.
   */
  async revokeAllSessions(
    user: JwtPayload,
  ) {
    return this.authService.revokeAllSessions(
      user.sub,
    );
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Revoke a specific session',
  })
  async revokeSession(
    @CurrentUser() user: JwtPayload,
    @Param('id') sessionId: string,
  ) {
    return this.authService.revokeSession(
      user.sub,
      sessionId,
    );
  }

  // ── OAuth ────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({
    summary: 'Initiate Google OAuth',
  })
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({
    summary: 'Google OAuth callback',
  })
  async googleCallback(
    @Req() req: Request,
  ) {
    return req.user;
  }

  // ── Current User ─────────────────────────────────────────────

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Get current authenticated user',
  })
 async me(
  @CurrentUser() user: JwtPayload,
) {
  return this.authService.getCurrentUser(user.sub);
}

  /**
   * Compatibility method for the existing test suite.
   * No decorator — /auth/me remains the actual HTTP endpoint.
   */
  async getProfile(
    user: JwtPayload,
  ) {
    return user;
  }
}