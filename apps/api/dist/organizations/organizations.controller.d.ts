import { OrganizationsService } from './organizations.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
export declare class OrganizationsController {
    private readonly orgsService;
    constructor(orgsService: OrganizationsService);
    getMyOrg(user: JwtPayload): Promise<Record<string, unknown>>;
    update(user: JwtPayload, body: {
        name?: string;
        settings?: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
    getUsage(user: JwtPayload): Promise<{
        users: {
            used: number;
            limit: unknown;
        };
        storage: {
            usedGb: number;
            limitGb: unknown;
        };
        aiRequests: {
            used: unknown;
            limit: unknown;
        };
    }>;
    getTeams(user: JwtPayload): Promise<Record<string, unknown>[]>;
    createTeam(user: JwtPayload, body: {
        name: string;
        description?: string;
        departmentId?: string;
    }): Promise<Record<string, unknown>>;
    addTeamMember(user: JwtPayload, teamId: string, body: {
        userId: string;
        role?: string;
    }): Promise<{
        added: boolean;
    }>;
    getDepartments(user: JwtPayload): Promise<Record<string, unknown>[]>;
    createDepartment(user: JwtPayload, body: {
        name: string;
        description?: string;
        headUserId?: string;
    }): Promise<Record<string, unknown>>;
    invite(user: JwtPayload, body: {
        email: string;
        role: string;
        teamId?: string;
    }): Promise<{
        sent: boolean;
        email: string;
    }>;
    acceptInvite(user: JwtPayload, body: {
        token: string;
    }): Promise<{
        accepted: boolean;
    }>;
}
//# sourceMappingURL=organizations.controller.d.ts.map