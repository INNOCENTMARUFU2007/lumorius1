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
  ai_requests_per_month: number;
}

/**
 * NX-000013 — AI Quota Enforcement Guard
 *
 * Applied to all state-changing AI endpoints (POST /ai/*).
 *
 * Two layers of protection:
 *  1. Per-minute burst limit  — 20 requests / 60 s  (Redis counter, TTL 60s)
 *  2. Monthly plan quota      — billing_plans.ai_requests_per_month
 *       0 = unlimited (Enterprise plan)
 *       counter key: ai:quota:{orgId}:{YYYY-MM}  (expires first of next month)
 *
 * HTTP responses:
 *  429  Too Many Requests   — burst limit hit  (Retry-After header set)
 *  402  Payment Required    — monthly quota exhausted
 */
@Injectable()
export class AiQuotaGuard implements CanActivate {
  private readonly logger = new Logger(AiQuotaGuard.name);

  private readonly BURST_LIMIT   = 20;
  private readonly BURST_TTL_SEC = 60;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req  = context.switchToHttp().getRequest<Request>();
    const user = req.user as JwtUser | undefined;

    if (!user?.organizationId) return true;

    await this.checkBurstLimit(user.organizationId);
    await this.checkMonthlyQuota(user.organizationId);

    return true;
  }

  // ── Burst limit (20 req / 60 s per org) ─────────────────────────────────
  private async checkBurstLimit(orgId: string): Promise<void> {
    const key   = `ai:burst:${orgId}`;
    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, this.BURST_TTL_SEC);
    }

    if (count > this.BURST_LIMIT) {
      const ttl = Math.max(await this.redis.ttl(key), 1);
      const res = { statusCode: 429, message: `AI rate limit — max ${this.BURST_LIMIT} requests/min. Retry after ${ttl}s.`, retryAfter: ttl };
      const exc = new HttpException(res, HttpStatus.TOO_MANY_REQUESTS);
      // Set Retry-After on the underlying response object
      const http = context.switchToHttp().getResponse<{ setHeader?: (k: string, v: string) => void }>();
      http.setHeader?.('Retry-After', String(ttl));
      throw exc;
    }
  }

  // ── Monthly quota ────────────────────────────────────────────────────────
  private async checkMonthlyQuota(orgId: string): Promise<void> {
    const limit = await this.getPlanLimit(orgId);

    if (limit === 0) return;  // 0 = unlimited

    const key  = this.monthlyKey(orgId);
    const used = await this.redis.incr(key);

    if (used === 1) {
      await this.redis.expireat(key, this.firstOfNextMonthUnix());
    }

    if (used > limit) {
      this.logger.warn(`[AiQuota] org=${orgId} used=${used} limit=${limit} — quota exceeded`);
      throw new HttpException(
        {
          statusCode: 402,
          message:    `Monthly AI quota of ${limit} requests exceeded. Upgrade your plan to continue.`,
          upgradeUrl: '/billing',
          used,
          limit,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Fetch the org's plan limit; cache in Redis for 5 minutes. */
  private async getPlanLimit(orgId: string): Promise<number> {
    const cacheKey = `ai:plan:${orgId}`;
    const cached   = await this.redis.get(cacheKey);

    if (cached !== null) return parseInt(cached, 10);

    const res = await this.db.query<OrgPlan>(
      `SELECT bp.ai_requests_per_month
       FROM   subscriptions   s
       JOIN   billing_plans   bp ON bp.id = s.plan_id
       WHERE  s.organization_id = $1
         AND  s.status = 'active'
       LIMIT  1`,
      [orgId],
    );

    // Default 100/month if no subscription row found (free tier)
    const limit = res.rows[0]?.ai_requests_per_month ?? 100;
    await this.redis.set(cacheKey, String(limit), 'EX', 300);
    return limit;
  }

  private monthlyKey(orgId: string): string {
    const d = new Date();
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return `ai:quota:${orgId}:${m}`;
  }

  private firstOfNextMonthUnix(): number {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
    d.setUTCHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }
}
