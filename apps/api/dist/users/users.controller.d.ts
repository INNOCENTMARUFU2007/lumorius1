import { UsersService } from './users.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    findAll(user: JwtPayload, search?: string, page?: number, pageSize?: number): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    getMe(user: JwtPayload): Promise<Record<string, unknown>>;
    updateMe(user: JwtPayload, body: {
        name?: string;
        avatarUrl?: string;
    }): Promise<Record<string, unknown>>;
    changePassword(user: JwtPayload, body: {
        currentPassword: string;
        newPassword: string;
    }): Promise<{
        changed: boolean;
    }>;
    findOne(user: JwtPayload, id: string): Promise<Record<string, unknown>>;
    updateRole(user: JwtPayload, id: string, body: {
        role: string;
    }): Promise<Record<string, unknown>>;
    deactivate(user: JwtPayload, id: string): Promise<{
        deactivated: boolean;
    }>;
}
//# sourceMappingURL=users.controller.d.ts.map