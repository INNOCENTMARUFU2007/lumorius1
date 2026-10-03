import { DatabaseService } from '../database/database.service';
export declare class AdminService {
    private readonly db;
    private readonly logger;
    constructor(db: DatabaseService);
    getPlatformStats(): Promise<{
        totals: {
            users: number;
            orgs: number;
            documents: number;
            meetings: number;
            activeSubs: number;
            mrrCents: number;
        };
        userGrowth: {
            date: string;
            count: string;
        }[];
    }>;
    listUsers(page?: number, limit?: number, search?: string): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        limit: number;
    }>;
    getUserById(userId: string): Promise<Record<string, unknown>>;
    suspendUser(userId: string, adminId: string): Promise<void>;
    reinstateUser(userId: string, adminId: string): Promise<void>;
    deleteUser(userId: string, adminId: string): Promise<void>;
    listOrgs(page?: number, limit?: number, search?: string): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        limit: number;
    }>;
    changePlan(orgId: string, planId: string, adminId: string): Promise<void>;
    getAuditLogs(page?: number, limit?: number): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        limit: number;
    }>;
}
//# sourceMappingURL=admin.service.d.ts.map