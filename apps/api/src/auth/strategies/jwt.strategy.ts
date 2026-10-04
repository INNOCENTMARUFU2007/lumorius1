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

    return payload;
  }
}