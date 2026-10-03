import { DatabaseService } from '../database/database.service';
export declare class UsersService {
    private readonly db;
    constructor(db: DatabaseService);
    findAll(organizationId: string, query: {
        search?: string;
        page?: number;
        pageSize?: number;
    }): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    findById(userId: string, organizationId: string): Promise<Record<string, unknown>>;
    updateProfile(userId: string, organizationId: string, dto: {
        name?: string;
        avatarUrl?: string;
    }): Promise<Record<string, unknown>>;
    changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{
        changed: boolean;
    }>;
    updateRole(targetUserId: string, organizationId: string, role: string, requestingUserId: string): Promise<Record<string, unknown>>;
    deactivate(targetUserId: string, organizationId: string, requestingUserId: string): Promise<{
        deactivated: boolean;
    }>;
}
//# sourceMappingURL=users.service.d.ts.map