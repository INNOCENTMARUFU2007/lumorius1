import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';
export declare class OrganizationsService {
    private readonly db;
    private readonly emailService;
    constructor(db: DatabaseService, emailService: EmailService);
    findById(id: string): Promise<Record<string, unknown>>;
    update(id: string, dto: {
        name?: string;
        settings?: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
    getMembers(organizationId: string): Promise<{
        status: string;
    }[]>;
    removeMember(organizationId: string, userIdToRemove: string, requestedById: string): Promise<{
        removed: boolean;
        userId: string;
    }>;
    getTeams(organizationId: string): Promise<Record<string, unknown>[]>;
    createTeam(organizationId: string, userId: string, dto: {
        name: string;
        description?: string;
        departmentId?: string;
    }): Promise<Record<string, unknown>>;
    findTeamById(id: string, organizationId: string): Promise<Record<string, unknown>>;
    addTeamMember(teamId: string, organizationId: string, userId: string, role?: string): Promise<{
        added: boolean;
    }>;
    getDepartments(organizationId: string): Promise<Record<string, unknown>[]>;
    createDepartment(organizationId: string, dto: {
        name: string;
        description?: string;
        headUserId?: string;
    }): Promise<Record<string, unknown>>;
    getInvitationHistory(organizationId: string): Promise<Record<string, unknown>[]>;
    invite(organizationId: string, invitedById: string, dto: {
        email: string;
        role?: string;
        teamId?: string;
    }): Promise<{
        sent: boolean;
        email: string;
    }>;
    acceptInvitation(token: string, userId: string): Promise<{
        accepted: boolean;
    }>;
    getUsage(organizationId: string): Promise<{
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
    completeOnboarding(userId: string, dto: {
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
//# sourceMappingURL=organizations.service.d.ts.map