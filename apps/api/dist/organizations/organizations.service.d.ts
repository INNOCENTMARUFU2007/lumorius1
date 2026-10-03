import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';
import { ConfigService } from '@nestjs/config';
export declare class OrganizationsService {
    private readonly db;
    private readonly emailService;
    private readonly configService;
    constructor(db: DatabaseService, emailService: EmailService, configService: ConfigService);
    findById(id: string): Promise<Record<string, unknown>>;
    update(id: string, dto: {
        name?: string;
        settings?: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
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
    invite(organizationId: string, invitedById: string, dto: {
        email: string;
        role: string;
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
}
//# sourceMappingURL=organizations.service.d.ts.map