import { DatabaseService } from '../database/database.service';
import { Queue } from 'bull';
export declare class HealthController {
    private readonly db;
    private readonly documentsQueue;
    constructor(db: DatabaseService, documentsQueue: Queue);
    check(): Promise<{
        status: string;
        timestamp: string;
        version: string;
        checks: Record<string, string>;
    }>;
}
//# sourceMappingURL=health.controller.d.ts.map