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
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const user = req.user;
        if (!user?.organizationId)
            return true;
        await this.checkBurstLimit(user.organizationId);
        await this.checkMonthlyQuota(user.organizationId);
        return true;
    }
    async checkBurstLimit(orgId) {
        const key = `ai:burst:${orgId}`;
        const count = await this.redis.incr(key);
        if (count === 1) {
            await this.redis.expire(key, this.BURST_TTL_SEC);
        }
        if (count > this.BURST_LIMIT) {
            const ttl = Math.max(await this.redis.ttl(key), 1);
            const res = { statusCode: 429, message: `AI rate limit — max ${this.BURST_LIMIT} requests/min. Retry after ${ttl}s.`, retryAfter: ttl };
            const exc = new common_1.HttpException(res, common_1.HttpStatus.TOO_MANY_REQUESTS);
            canActivate(context, common_1.ExecutionContext);
            {
                /common;
            }
            const http = context.switchToHttp().getResponse();
            http.setHeader?.('Retry-After', String(ttl));
            throw exc;
        }
    }
    async checkMonthlyQuota(orgId) {
        const limit = await this.getPlanLimit(orgId);
        if (limit === 0)
            return;
        const key = this.monthlyKey(orgId);
        const used = await this.redis.incr(key);
        if (used === 1) {
            await this.redis.expireat(key, this.firstOfNextMonthUnix());
        }
        if (used > limit) {
            this.logger.warn(`[AiQuota] org=${orgId} used=${used} limit=${limit} — quota exceeded`);
            throw new common_1.HttpException({
                statusCode: 402,
                message: `Monthly AI quota of ${limit} requests exceeded. Upgrade your plan to continue.`,
                upgradeUrl: '/billing',
                used,
                limit,
            }, common_1.HttpStatus.PAYMENT_REQUIRED);
        }
    }
    async getPlanLimit(orgId) {
        const cacheKey = `ai:plan:${orgId}`;
        const cached = await this.redis.get(cacheKey);
        if (cached !== null)
            return parseInt(cached, 10);
        const res = await this.db.query(`SELECT bp.ai_requests_per_month
       FROM   subscriptions   s
       JOIN   billing_plans   bp ON bp.id = s.plan_id
       WHERE  s.organization_id = $1
         AND  s.status = 'active'
       LIMIT  1`, [orgId]);
        const limit = res.rows[0]?.ai_requests_per_month ?? 100;
        await this.redis.set(cacheKey, String(limit), 'EX', 300);
        return limit;
    }
    monthlyKey(orgId) {
        const d = new Date();
        const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        return `ai:quota:${orgId}:${m}`;
    }
    firstOfNextMonthUnix() {
        const d = new Date();
        d.setUTCMonth(d.getUTCMonth() + 1, 1);
        d.setUTCHours(0, 0, 0, 0);
        return Math.floor(d.getTime() / 1000);
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