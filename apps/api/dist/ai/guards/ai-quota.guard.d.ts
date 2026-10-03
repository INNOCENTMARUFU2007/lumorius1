import { CanActivate, ExecutionContext } from '@nestjs/common';
import Redis from 'ioredis';
import { DatabaseService } from '../../database/database.service';
export declare class AiQuotaGuard implements CanActivate {
    private readonly redis;
    private readonly db;
    private readonly logger;
    private readonly BURST_LIMIT;
    private readonly BURST_TTL_SEC;
    constructor(redis: Redis, db: DatabaseService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private checkBurstLimit;
    private checkMonthlyQuota;
    private getPlanLimit;
    private monthlyKey;
    private firstOfNextMonthUnix;
}
//# sourceMappingURL=ai-quota.guard.d.ts.map