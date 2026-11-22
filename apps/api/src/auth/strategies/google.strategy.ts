import { Injectable, UnauthorizedException } from '@nestjs/common';
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
    const photo = photos?.[0]?.value;
    const avatarUrl = typeof photo === 'string' && /^https:\/\//i.test(photo) ? photo : undefined;

    if (!email) return done(new Error('No email from Google'), false);

    let user = await this.db.findOne<Record<string, unknown>>('users', { email });
    if (user && user.is_active === false) {
      return done(new UnauthorizedException('Account is disabled. Contact support.'), false);
    }
    if (!user) {
      const userId = uuidv4();
      await this.db.query(
        `INSERT INTO users (id, email, name, avatar_url, email_verified)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [userId, email, name, avatarUrl],
      );
      user = await this.db.findOne<Record<string, unknown>>('users', { id: userId });
    }

    if (user && avatarUrl && user.avatar_url !== avatarUrl) {
      await this.db.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatarUrl, user.id]);
      user = { ...user, avatar_url: avatarUrl };
    }

    // Two historical schemas use different identity column names. Never accept a column from request data.
    const columns = await this.db.query<{column_name:string}>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'oauth_accounts' AND column_name IN ('provider_id','provider_user_id')",
    );
    const identityColumn = columns.rows.some(row=>row.column_name==='provider_id') ? 'provider_id'
      : columns.rows.some(row=>row.column_name==='provider_user_id') ? 'provider_user_id' : null;
    if (!identityColumn) return done(new Error('OAuth account schema is not configured.'),false);
    // Authentication needs the provider identity, not retained provider access/refresh secrets.
    await this.db.query(
      `INSERT INTO oauth_accounts (user_id, provider, ${identityColumn})
       VALUES ($1, 'google', $2)
       ON CONFLICT (provider, ${identityColumn}) DO NOTHING`,
      [user!.id, profile.id],
    );

    done(null, user);
  }
}
