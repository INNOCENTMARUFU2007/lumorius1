import { CanActivate, ExecutionContext } from '@nestjs/common';
import Redis from 'ioredis';
import { DatabaseService } from '../../database/database.service';
export declare class AiQuotaGuard implements CanActivate {
    private readonly redis;
    private readonly db;
    private readonly logger;
    private readonly BURST_LIMIT;
    private readonly BURST_TTL_SEC;
    private readonly FREE_TOKEN_LIMIT;
    constructor(redis: Redis, db: DatabaseService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private checkBurstLimit;
    private checkMonthlyTokenQuota;
    private getPlanLimit;
}
//# sourceMappingURL=ai-quota.guard.d.ts.map