import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { DatabaseService } from '../../database/database.service';

interface JwtUser {
  sub: string;
  organizationId: string;
  email: string;
}

interface OrgPlan {
  ai_tokens_monthly: number | string;
}

interface MonthlyUsage {
  used: number | string;
}

@Injectable()
export class AiQuotaGuard implements CanActivate {
  private readonly logger = new Logger(AiQuotaGuard.name);

  private readonly BURST_LIMIT = 20;
  private readonly BURST_TTL_SEC = 60;
  private readonly FREE_TOKEN_LIMIT = 25_000;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as JwtUser | undefined;

    if (!user?.organizationId) {
      return true;
    }

    await this.checkBurstLimit(user.organizationId, context);
    await this.checkMonthlyTokenQuota(user.organizationId);

    return true;
  }

  private async checkBurstLimit(
    orgId: string,
    context: ExecutionContext,
  ): Promise<void> {
    const key = `ai:burst:${orgId}`;
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, this.BURST_TTL_SEC);
    }

    if (count > this.BURST_LIMIT) {
      const ttl = Math.max(await this.redis.ttl(key), 1);

      const response = context
        .switchToHttp()
        .getResponse<{
          setHeader?: (name: string, value: string) => void;
        }>();

      response.setHeader?.('Retry-After', String(ttl));

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `AI rate limit reached. Maximum ${this.BURST_LIMIT} requests per minute.`,
          retryAfter: ttl,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async checkMonthlyTokenQuota(orgId: string): Promise<void> {
    const limit = await this.getPlanLimit(orgId);

    // A negative limit represents unlimited usage.
    if (limit < 0) {
      return;
    }

    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    const usageResult = await this.db.query<MonthlyUsage>(
      `SELECT COALESCE(SUM(total_tokens), 0)::bigint AS used
       FROM ai_usage
       WHERE organization_id = $1
         AND created_at >= $2
         AND created_at < $3`,
      [orgId, monthStart, nextMonthStart],
    );

    const used = Number(usageResult.rows[0]?.used ?? 0);

    if (!Number.isFinite(used)) {
      throw new HttpException(
        'Unable to verify AI usage quota.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (used >= limit) {
      this.logger.warn(
        `[AiQuota] org=${orgId} tokens_used=${used} token_limit=${limit}`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          code: 'AI_TOKEN_QUOTA_EXCEEDED',
          message: `Your monthly allowance of ${limit.toLocaleString()} AI tokens has been reached. Upgrade your plan to continue.`,
          upgradeUrl: '/billing',
          used,
          limit,
          remaining: 0,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  private async getPlanLimit(orgId: string): Promise<number> {
    // Versioned key prevents reusing the old cached request-based quota.
    const cacheKey = `ai:plan:tokens:v2:${orgId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached !== null) {
      const parsed = Number(cached);

      if (Number.isFinite(parsed)) {
        return parsed;
      }

      await this.redis.del(cacheKey);
    }

    const result = await this.db.query<OrgPlan>(
      `SELECT COALESCE(
         NULLIF(bp.limits ->> 'ai_tokens_monthly', '')::bigint,
         $2::bigint
       ) AS ai_tokens_monthly
       FROM organizations o
       LEFT JOIN billing_plans bp
         ON bp.id = o.plan_id::text
        AND bp.is_active = TRUE
       WHERE o.id = $1
       LIMIT 1`,
      [orgId, this.FREE_TOKEN_LIMIT],
    );

    // Default to the restrictive Free allowance when a plan cannot be found.
    const rawLimit = result.rows[0]?.ai_tokens_monthly;
    const limit =
      rawLimit === undefined ? this.FREE_TOKEN_LIMIT : Number(rawLimit);

    if (!Number.isFinite(limit)) {
      throw new HttpException(
        'Unable to verify the organisation AI plan.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    await this.redis.set(cacheKey, String(limit), 'EX', 300);

    return limit;
  }
}