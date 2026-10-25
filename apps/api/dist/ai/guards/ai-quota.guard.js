"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AiQuotaGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiQuotaGuard = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = __importDefault(require("ioredis"));
const redis_module_1 = require("../../common/redis/redis.module");
const database_service_1 = require("../../database/database.service");
let AiQuotaGuard = AiQuotaGuard_1 = class AiQuotaGuard {
    constructor(redis, db) {
        this.redis = redis;
        this.db = db;
        this.logger = new common_1.Logger(AiQuotaGuard_1.name);
        this.BURST_LIMIT = 20;
        this.BURST_TTL_SEC = 60;
        this.FREE_TOKEN_LIMIT = 25_000;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const user = req.user;
        if (!user?.organizationId) {
            return true;
        }
        await this.checkBurstLimit(user.organizationId, context);
        await this.checkMonthlyTokenQuota(user.organizationId);
        return true;
    }
    async checkBurstLimit(orgId, context) {
        const key = `ai:burst:${orgId}`;
        const count = await this.redis.incr(key);
        if (count === 1) {
            await this.redis.expire(key, this.BURST_TTL_SEC);
        }
        if (count > this.BURST_LIMIT) {
            const ttl = Math.max(await this.redis.ttl(key), 1);
            const response = context
                .switchToHttp()
                .getResponse();
            response.setHeader?.('Retry-After', String(ttl));
            throw new common_1.HttpException({
                statusCode: common_1.HttpStatus.TOO_MANY_REQUESTS,
                message: `AI rate limit reached. Maximum ${this.BURST_LIMIT} requests per minute.`,
                retryAfter: ttl,
            }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    async checkMonthlyTokenQuota(orgId) {
        const limit = await this.getPlanLimit(orgId);
        if (limit < 0) {
            return;
        }
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        const usageResult = await this.db.query(`SELECT COALESCE(SUM(total_tokens), 0)::bigint AS used
       FROM ai_usage
       WHERE organization_id = $1
         AND created_at >= $2
         AND created_at < $3`, [orgId, monthStart, nextMonthStart]);
        const used = Number(usageResult.rows[0]?.used ?? 0);
        if (!Number.isFinite(used)) {
            throw new common_1.HttpException('Unable to verify AI usage quota.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        if (used >= limit) {
            this.logger.warn(`[AiQuota] org=${orgId} tokens_used=${used} token_limit=${limit}`);
            throw new common_1.HttpException({
                statusCode: common_1.HttpStatus.PAYMENT_REQUIRED,
                code: 'AI_TOKEN_QUOTA_EXCEEDED',
                message: `Your monthly allowance of ${limit.toLocaleString()} AI tokens has been reached. Upgrade your plan to continue.`,
                upgradeUrl: '/billing',
                used,
                limit,
                remaining: 0,
            }, common_1.HttpStatus.PAYMENT_REQUIRED);
        }
    }
    async getPlanLimit(orgId) {
        const cacheKey = `ai:plan:tokens:v2:${orgId}`;
        const cached = await this.redis.get(cacheKey);
        if (cached !== null) {
            const parsed = Number(cached);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
            await this.redis.del(cacheKey);
        }
        const result = await this.db.query(`SELECT COALESCE(
         NULLIF(bp.limits ->> 'ai_tokens_monthly', '')::bigint,
         $2::bigint
       ) AS ai_tokens_monthly
       FROM organizations o
       LEFT JOIN billing_plans bp
         ON bp.id = o.plan_id::text
        AND bp.is_active = TRUE
       WHERE o.id = $1
       LIMIT 1`, [orgId, this.FREE_TOKEN_LIMIT]);
        const rawLimit = result.rows[0]?.ai_tokens_monthly;
        const limit = rawLimit === undefined ? this.FREE_TOKEN_LIMIT : Number(rawLimit);
        if (!Number.isFinite(limit)) {
            throw new common_1.HttpException('Unable to verify the organisation AI plan.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        await this.redis.set(cacheKey, String(limit), 'EX', 300);
        return limit;
    }
};
exports.AiQuotaGuard = AiQuotaGuard;
exports.AiQuotaGuard = AiQuotaGuard = AiQuotaGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [ioredis_1.default,
        database_service_1.DatabaseService])
], AiQuotaGuard);
//# sourceMappingURL=ai-quota.guard.js.map