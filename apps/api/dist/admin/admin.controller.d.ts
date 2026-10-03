import { AdminService } from './admin.service';
export declare class AdminController {
    private readonly adminService;
    constructor(adminService: AdminService);
    getStats(): Promise<{
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
    listUsers(page?: string, limit?: string, search?: string): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        limit: number;
    }>;
    getUserById(id: string): Promise<Record<string, unknown>>;
    suspendUser(id: string, admin: {
        id: string;
    }): Promise<void>;
    reinstateUser(id: string, admin: {
        id: string;
    }): Promise<void>;
    deleteUser(id: string, admin: {
        id: string;
    }): Promise<void>;
    listOrgs(page?: string, limit?: string, search?: string): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        limit: number;
    }>;
    changePlan(id: string, body: {
        planId: string;
    }, admin: {
        id: string;
    }): Promise<void>;
    getAuditLogs(page?: string, limit?: string): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        limit: number;
    }>;
}
//# sourceMappingURL=admin.controller.d.ts.map