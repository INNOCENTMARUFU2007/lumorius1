import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';
export declare class GdprService {
    private readonly db;
    private readonly email;
    private readonly logger;
    constructor(db: DatabaseService, email: EmailService);
    exportUserData(userId: string): Promise<Record<string, unknown>>;
    requestDeletion(userId: string): Promise<{
        scheduledAt: string;
        deletionAt: string;
    }>;
    cancelDeletion(userId: string): Promise<void>;
    purgeScheduledDeletions(): Promise<{
        purged: number;
    }>;
}
//# sourceMappingURL=gdpr.service.d.ts.map