import { GdprService } from './gdpr.service';
export declare class GdprDeletionScheduler {
    private readonly gdprService;
    private readonly logger;
    constructor(gdprService: GdprService);
    processExpiredDeletionRequests(): Promise<void>;
}
//# sourceMappingURL=gdpr-deletion.scheduler.d.ts.map