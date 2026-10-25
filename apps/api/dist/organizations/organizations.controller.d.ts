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
            limit: number;
        };
        storage: {
            usedGb: number;
            limitGb: number;
        };
        aiRequests: {
            used: number;
            limit: number;
        };
    }>;
    getMembers(user: JwtPayload): Promise<{
        status: string;
    }[]>;
    inviteMember(user: JwtPayload, body: {
        email: string;
        role?: string;
        teamId?: string;
    }): Promise<{
        sent: boolean;
        email: string;
    }>;
    removeMember(user: JwtPayload, userId: string): Promise<{
        removed: boolean;
        userId: string;
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
    getInvitationHistory(user: JwtPayload): Promise<Record<string, unknown>[]>;
    invite(user: JwtPayload, body: {
        email: string;
        role?: string;
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
    completeOnboarding(user: JwtPayload, body: {
        orgName?: string;
        orgSize?: string;
        industry?: string;
        invites?: string;
        brainDesc?: string;
        goalTitle?: string;
    }): Promise<{
        completed: boolean;
        onboardingCompleted: boolean;
    }>;
}
//# sourceMappingURL=organizations.controller.d.ts.map