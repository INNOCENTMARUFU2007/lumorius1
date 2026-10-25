import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type AuthenticatedRequest = {
  user?: {
    id?: string;
    sub?: string;
    userId?: string;
  };
};

@Injectable()
export class PlatformOwnerGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.sub ?? request.user?.id ?? request.user?.userId;
    const ownerEmail = (process.env.LUMORIUS_ADMIN_EMAIL ?? 'marufuinnocent0@gmail.com')
      .trim()
      .toLowerCase();

    if (!userId || !ownerEmail) {
      throw new ForbiddenException('Platform-owner access required.');
    }

    const result = await this.db.query<{ email: string; is_active: boolean }>(
      'SELECT email, is_active FROM users WHERE id = $1 LIMIT 1',
      [userId],
    );
    const account = result.rows?.[0];
    const accountEmail = (account?.email ?? '').trim().toLowerCase();

    if (!account || account.is_active === false || accountEmail !== ownerEmail) {
      throw new ForbiddenException('Platform-owner access required.');
    }

    return true;
  }
}