import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: Error | null,
    user: TUser | false,
    info: { message?: string } | undefined,
  ): TUser {
    if (err || !user) {
      const message =
        info?.message === 'No auth token'
          ? 'No authentication token provided'
          : info?.message === 'jwt expired'
          ? 'Authentication token has expired'
          : info?.message ?? 'Unauthorized';
      throw err ?? new UnauthorizedException(message);
    }
    return user;
  }
}
