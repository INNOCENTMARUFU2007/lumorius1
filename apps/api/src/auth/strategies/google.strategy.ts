import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {
    super({
      clientID: configService.get<string>('oauth.google.clientId', 'placeholder'),
      clientSecret: configService.get<string>('oauth.google.clientSecret', 'placeholder'),
      callbackURL: `${configService.get<string>('appUrl')}/api/v1/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Record<string, unknown>,
    done: VerifyCallback,
  ) {
    const emails = profile.emails as Array<{ value: string }>;
    const photos = profile.photos as Array<{ value: string }>;
    const email = emails?.[0]?.value;
    const name = profile.displayName as string;
    const avatarUrl = photos?.[0]?.value;

    if (!email) return done(new Error('No email from Google'), false);

    let user = await this.db.findOne<Record<string, unknown>>('users', { email });
    if (!user) {
      const userId = uuidv4();
      await this.db.query(
        `INSERT INTO users (id, email, name, avatar_url, email_verified)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [userId, email, name, avatarUrl],
      );
      user = await this.db.findOne<Record<string, unknown>>('users', { id: userId });
    }

    await this.db.query(
      `INSERT INTO oauth_accounts (user_id, provider, provider_user_id, access_token, refresh_token)
       VALUES ($1, 'google', $2, $3, $4)
       ON CONFLICT (provider, provider_user_id) DO UPDATE
       SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token`,
      [user!.id, profile.id, accessToken, refreshToken],
    );

    done(null, user);
  }
}
