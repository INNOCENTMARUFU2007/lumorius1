import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { PassportStrategy } from '@nestjs/passport';
import {
  ExtractJwt,
  Strategy,
} from 'passport-jwt';

import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../../database/database.service';

import {
  JwtPayload,
} from '../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(
  Strategy,
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {
    const secret =
      configService.get<string>('jwt.secret') ??
      configService.get<string>('JWT_SECRET') ??
      process.env.JWT_SECRET;

    if (!secret) {
      throw new Error(
        'JWT_SECRET is not configured. ' +
          'Set JWT_SECRET in the Lumorius .env file.',
      );
    }

    super({
      jwtFromRequest:
        ExtractJwt.fromAuthHeaderAsBearerToken(),

      ignoreExpiration: false,

      secretOrKey: secret,
    });
  }

  async validate(
    payload: JwtPayload,
  ): Promise<JwtPayload> {
    const user =
      await this.db.findOne(
        'users',
        {
          id: payload.sub,
          is_active: true,
        },
      );

    if (!user) {
      throw new UnauthorizedException(
        'User not found or inactive',
      );
    }
    const sessionId = (payload as JwtPayload & { sid?: string }).sid;
    if (!sessionId) {
      throw new UnauthorizedException('Session is not bound to a device. Please sign in again.');
    }

    const session = await this.db.findOne<Record<string, unknown>>(
      'sessions',
      { id: sessionId, user_id: payload.sub, is_valid: true },
    );

    if (
      !session ||
      !session.expires_at ||
      new Date(String(session.expires_at)).getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('Session revoked or expired. Please sign in again.');
    }
    const tokenCutoff = (user as Record<string, unknown>).tokens_valid_after;
    if (tokenCutoff) {
      const cutoffMs = new Date(String(tokenCutoff)).getTime();
      const issuedAt = (payload as JwtPayload & { iat?: number }).iat;
      const cutoffSeconds = Math.floor(cutoffMs / 1000);
      if (!Number.isFinite(cutoffMs) || typeof issuedAt !== 'number' || issuedAt <= cutoffSeconds) {
        throw new UnauthorizedException('Session revoked. Please sign in again.');
      }
    }

    return payload;
  }
}