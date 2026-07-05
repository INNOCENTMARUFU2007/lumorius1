import {
  Injectable, CanActivate, ExecutionContext, UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { SecurityService } from '../../security/security.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly securityService: SecurityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractKey(req);
    if (!apiKey) throw new UnauthorizedException('API key required');

    const keyRecord = await this.securityService.validateApiKey(apiKey);
    if (!keyRecord) throw new UnauthorizedException('Invalid or revoked API key');

    // Attach key metadata to request
    (req as any).apiKey = keyRecord;
    return true;
  }

  private extractKey(req: Request): string | null {
    const header = req.headers['x-api-key'] as string | undefined;
    if (header) return header;
    const bearer = req.headers['authorization'];
    if (bearer?.startsWith('ApiKey ')) return bearer.slice(7);
    return null;
  }
}
