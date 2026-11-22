import {
  BadRequestException,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { SecurityService } from './security.service';

const PUBLIC_API_SCOPES_METADATA = 'lumorius:public-api-scopes';
export const RequirePublicApiScopes = (...scopes: string[]) =>
  SetMetadata(PUBLIC_API_SCOPES_METADATA, scopes);

type ApiKeyRecord = Record<string, unknown>;
type ApiKeyRequest = Request & { apiKey?: ApiKeyRecord };
type DecodedCursor = { createdAt: string; id: string };
type PageRow = Record<string, unknown> & { id: string; created_at: string | Date };

@Injectable()
export class PublicApiScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly securityService: SecurityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(
      PUBLIC_API_SCOPES_METADATA,
      [context.getHandler(), context.getClass()],
    ) ?? [];
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const key = request.apiKey;
    const granted = Array.isArray(key?.scopes) ? key.scopes.map(String) : [];
    const missing = requiredScopes.filter((scope) => !granted.includes(scope));

    if (missing.length > 0) {
      await this.securityService.logAudit({
        organizationId: typeof key?.organization_id === 'string' ? key.organization_id : undefined,
        userId: typeof key?.created_by_id === 'string' ? key.created_by_id : undefined,
        action: 'security.api_key.scope_denied',
        resourceType: 'api_key',
        resourceId: typeof key?.id === 'string' ? key.id : undefined,
        metadata: { path: request.path, missingScopes: missing },
      });
      throw new ForbiddenException({
        message: 'The API key does not have the required scope.',
        requiredScopes: missing,
      });
    }

    return true;
  }
}

@Injectable()
export class PublicApiRateLimitGuard implements CanActivate {
  constructor(
    private readonly db: DatabaseService,
    private readonly securityService: SecurityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();
    const key = request.apiKey;
    const keyId = typeof key?.id === 'string' ? key.id : '';
    if (!keyId) throw new UnauthorizedException('API key context is missing.');

    const result = await this.db.query<{ request_count: number | string }>(
      `INSERT INTO api_key_rate_limits (api_key_id, window_start, request_count, updated_at)
       VALUES ($1, date_trunc('minute', NOW()), 1, NOW())
       ON CONFLICT (api_key_id) DO UPDATE SET
         request_count = CASE
           WHEN api_key_rate_limits.window_start < date_trunc('minute', NOW()) THEN 1
           ELSE api_key_rate_limits.request_count + 1
         END,
         window_start = CASE
           WHEN api_key_rate_limits.window_start < date_trunc('minute', NOW()) THEN date_trunc('minute', NOW())
           ELSE api_key_rate_limits.window_start
         END,
         updated_at = NOW()
       RETURNING request_count`,
      [keyId],
    );

    const configuredLimit = Number(process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE ?? 120);
    const limit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 120;
    const count = Number(result.rows?.[0]?.request_count ?? 0);

    if (count > limit) {
      await this.securityService.logAudit({
        organizationId: typeof key?.organization_id === 'string' ? key.organization_id : undefined,
        userId: typeof key?.created_by_id === 'string' ? key.created_by_id : undefined,
        action: 'security.api_key.rate_limited',
        resourceType: 'api_key',
        resourceId: keyId,
        metadata: { path: request.path, limitPerMinute: limit },
      });
      throw new HttpException('API key rate limit exceeded. Try again next minute.', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}

@ApiTags('public-api')
@ApiHeader({ name: 'X-API-Key', required: true, description: 'Lumorius API key. Keep it secret.' })
@UseGuards(ApiKeyGuard, PublicApiRateLimitGuard, PublicApiScopeGuard)
@Controller({ path: 'public', version: '1' })
export class PublicApiController {
  constructor(private readonly db: DatabaseService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check the authenticated API key and public API availability' })
  health() {
    return { status: 'ok', apiVersion: '1' };
  }

  @Get('documents')
  @RequirePublicApiScopes('documents:read')
  @ApiOperation({ summary: 'List document metadata belonging to the API key organisation' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page size, 1 to 100 (default 50)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor returned by the previous page' })
  async documents(@Req() request: ApiKeyRequest, @Query('limit') limitValue?: string, @Query('cursor') cursorValue?: string) {
    const limit = this.parseLimit(limitValue);
    const cursor = this.decodeCursor(cursorValue);
    const sql = `SELECT d.id, d.name, d.original_name, d.type, d.status, d.size_bytes, d.created_at, d.updated_at
      FROM documents d
      WHERE d.organization_id = $1 AND d.team_id IS NULL
        AND ($2::timestamptz IS NULL OR (d.created_at, d.id) < ($2::timestamptz, $3::uuid))
      ORDER BY d.created_at DESC, d.id DESC
      LIMIT $4`;
    return this.fetchPage(sql, this.requireOrganizationId(request), limit, cursor);
  }

  @Get('tasks')
  @RequirePublicApiScopes('tasks:read')
  @ApiOperation({ summary: 'List tasks belonging to the API key organisation' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page size, 1 to 100 (default 50)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor returned by the previous page' })
  async tasks(@Req() request: ApiKeyRequest, @Query('limit') limitValue?: string, @Query('cursor') cursorValue?: string) {
    const limit = this.parseLimit(limitValue);
    const cursor = this.decodeCursor(cursorValue);
    const sql = `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, t.completed_at, t.project_id, t.team_id, t.created_at, t.updated_at
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id AND p.organization_id = t.organization_id
      WHERE t.organization_id = $1 AND COALESCE(t.team_id, p.team_id) IS NULL
        AND ($2::timestamptz IS NULL OR (t.created_at, t.id) < ($2::timestamptz, $3::uuid))
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $4`;
    return this.fetchPage(sql, this.requireOrganizationId(request), limit, cursor);
  }

  @Get('projects')
  @RequirePublicApiScopes('projects:read')
  @ApiOperation({ summary: 'List projects belonging to the API key organisation' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page size, 1 to 100 (default 50)' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque cursor returned by the previous page' })
  async projects(@Req() request: ApiKeyRequest, @Query('limit') limitValue?: string, @Query('cursor') cursorValue?: string) {
    const limit = this.parseLimit(limitValue);
    const cursor = this.decodeCursor(cursorValue);
    const sql = `SELECT p.id, p.name, p.description, p.status, p.start_date, p.end_date, p.created_at, p.updated_at
      FROM projects p
      WHERE p.organization_id = $1 AND p.team_id IS NULL
        AND ($2::timestamptz IS NULL OR (p.created_at, p.id) < ($2::timestamptz, $3::uuid))
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $4`;
    return this.fetchPage(sql, this.requireOrganizationId(request), limit, cursor);
  }

  // Organization context comes only from the validated API-key record.
  private requireOrganizationId(request: ApiKeyRequest): string {
    const organizationId = request.apiKey?.organization_id;
    if (typeof organizationId !== 'string' || !organizationId) {
      throw new UnauthorizedException('API key organisation context is missing.');
    }
    return organizationId;
  }

  private parseLimit(value?: string): number {
    if (value === undefined || value.trim() === '') return 50;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new BadRequestException('limit must be an integer between 1 and 100.');
    }
    return parsed;
  }

  private decodeCursor(value?: string): DecodedCursor | null {
    if (!value) return null;
    try {
      const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<DecodedCursor>;
      const dateMs = typeof decoded.createdAt === 'string' ? new Date(decoded.createdAt).getTime() : NaN;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!Number.isFinite(dateMs) || typeof decoded.id !== 'string' || !uuidPattern.test(decoded.id)) {
        throw new Error('Invalid cursor values');
      }
      return { createdAt: new Date(dateMs).toISOString(), id: decoded.id };
    } catch {
      throw new BadRequestException('Invalid cursor. Use the nextCursor value returned by Lumorius.');
    }
  }

  private async fetchPage(
    sql: string,
    organizationId: string,
    limit: number,
    cursor: DecodedCursor | null,
  ) {
    const result = await this.db.query<PageRow>(
      sql,
      [organizationId, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
    );
    const hasMore = result.rows.length > limit;
    const items = hasMore ? result.rows.slice(0, limit) : result.rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ createdAt: new Date(String(last.created_at)).toISOString(), id: last.id }), 'utf8').toString('base64url')
      : null;
    return { items, pagination: { limit, nextCursor } };
  }
}