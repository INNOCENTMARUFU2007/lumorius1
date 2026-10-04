"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrganizationsService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const database_service_1 = require("../database/database.service");
const email_service_1 = require("../common/email/email.service");
const config_1 = require("@nestjs/config");
let OrganizationsService = class OrganizationsService {
    constructor(db, emailService, configService) {
        this.db = db;
        this.emailService = emailService;
        this.configService = configService;
    }
    async findById(id) {
        const res = await this.db.query(`SELECT
         o.*,
         bp.name as plan_name,
         bp.max_users,
         bp.storage_gb,
         bp.ai_requests_per_month
       FROM organizations o
       JOIN billing_plans bp ON o.plan_id = bp.id
       WHERE o.id = $1`, [id]);
        if (!res.rows[0]) {
            throw new common_1.NotFoundException('Organization not found');
        }
        return res.rows[0];
    }
    async update(id, dto) {
        const updates = [];
        const values = [];
        let idx = 1;
        if (dto.name !== undefined) {
            updates.push(`name = $${idx++}`);
            values.push(dto.name);
        }
        if (dto.settings !== undefined) {
            updates.push(`settings = $${idx++}`);
            values.push(JSON.stringify(dto.settings));
        }
        if (updates.length === 0) {
            return this.findById(id);
        }
        values.push(id);
        await this.db.query(`UPDATE organizations
       SET ${updates.join(', ')},
           updated_at = NOW()
       WHERE id = $${idx}`, values);
        return this.findById(id);
    }
    async getTeams(organizationId) {
        const res = await this.db.query(`SELECT
         t.*,
         COUNT(tm.user_id) as member_count,
         d.name as department_name
       FROM teams t
       LEFT JOIN team_members tm
         ON t.id = tm.team_id
       LEFT JOIN departments d
         ON t.department_id = d.id
       WHERE t.organization_id = $1
       GROUP BY t.id, d.name
       ORDER BY t.created_at DESC`, [organizationId]);
        return res.rows;
    }
    async createTeam(organizationId, userId, dto) {
        const id = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO teams
         (
           id,
           name,
           description,
           organization_id,
           department_id,
           created_by_id
         )
       VALUES ($1,$2,$3,$4,$5,$6)`, [
            id,
            dto.name,
            dto.description ?? null,
            organizationId,
            dto.departmentId ?? null,
            userId,
        ]);
        await this.db.query(`INSERT INTO team_members
         (team_id, user_id, role)
       VALUES ($1,$2,'owner')`, [id, userId]);
        return this.findTeamById(id, organizationId);
    }
    async findTeamById(id, organizationId) {
        const res = await this.db.query(`SELECT
         t.*,
         COUNT(tm.user_id) as member_count
       FROM teams t
       LEFT JOIN team_members tm
         ON t.id = tm.team_id
       WHERE t.id = $1
         AND t.organization_id = $2
       GROUP BY t.id`, [id, organizationId]);
        if (!res.rows[0]) {
            throw new common_1.NotFoundException('Team not found');
        }
        return res.rows[0];
    }
    async addTeamMember(teamId, organizationId, userId, role = 'member') {
        await this.findTeamById(teamId, organizationId);
        await this.db.query(`INSERT INTO team_members
         (team_id, user_id, role)
       VALUES ($1,$2,$3)
       ON CONFLICT (team_id, user_id)
       DO UPDATE SET
         role = EXCLUDED.role`, [
            teamId,
            userId,
            role,
        ]);
        return {
            added: true,
        };
    }
    async getDepartments(organizationId) {
        const res = await this.db.query(`SELECT
         d.*,
         u.name as head_name,
         COUNT(t.id) as team_count
       FROM departments d
       LEFT JOIN users u
         ON d.head_user_id = u.id
       LEFT JOIN teams t
         ON t.department_id = d.id
       WHERE d.organization_id = $1
       GROUP BY d.id, u.name
       ORDER BY d.name`, [organizationId]);
        return res.rows;
    }
    async createDepartment(organizationId, dto) {
        const id = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO departments
         (
           id,
           name,
           description,
           organization_id,
           head_user_id
         )
       VALUES ($1,$2,$3,$4,$5)`, [
            id,
            dto.name,
            dto.description ?? null,
            organizationId,
            dto.headUserId ?? null,
        ]);
        return this.db.findOne('departments', { id });
    }
    async invite(organizationId, invitedById, dto) {
        const existing = await this.db.findOne('users', { email: dto.email });
        if (existing) {
            const member = existing;
            if (member.organization_id ===
                organizationId) {
                throw new common_1.ConflictException('User is already a member of this organization');
            }
        }
        const existingInvite = await this.db.query(`SELECT id
         FROM invitations
         WHERE email = $1
           AND organization_id = $2
           AND accepted_at IS NULL
           AND expires_at > NOW()`, [
            dto.email,
            organizationId,
        ]);
        if (existingInvite.rows.length > 0) {
            throw new common_1.ConflictException('An active invitation already exists for this email');
        }
        const token = (0, uuid_1.v4)();
        const expiresAt = new Date(Date.now() +
            48 * 60 * 60 * 1000);
        await this.db.query(`INSERT INTO invitations
         (
           id,
           email,
           role,
           organization_id,
           invited_by_id,
           team_id,
           token,
           expires_at
         )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
            (0, uuid_1.v4)(),
            dto.email,
            dto.role,
            organizationId,
            invitedById,
            dto.teamId ?? null,
            token,
            expiresAt,
        ]);
        const org = await this.findById(organizationId);
        const inviter = await this.db.findOne('users', { id: invitedById });
        const organizationName = org.name;
        const inviterName = (inviter?.name ??
            'Someone');
        await this.emailService.sendTeamInvitation(dto.email, inviterName, organizationName, token);
        return {
            sent: true,
            email: dto.email,
        };
    }
    async acceptInvitation(token, userId) {
        const invite = await this.db.findOne('invitations', { token });
        if (!invite ||
            invite.accepted_at) {
            throw new common_1.NotFoundException('Invitation not found or already used');
        }
        if (new Date(invite.expires_at) < new Date()) {
            throw new common_1.NotFoundException('Invitation expired');
        }
        await this.db.transaction(async (client) => {
            await client.query(`UPDATE users
           SET organization_id = $1,
               role = $2
           WHERE id = $3`, [
                invite.organization_id,
                invite.role,
                userId,
            ]);
            await client.query(`UPDATE invitations
           SET accepted_at = NOW()
           WHERE id = $1`, [invite.id]);
            if (invite.team_id) {
                await client.query(`INSERT INTO team_members
               (team_id, user_id, role)
             VALUES ($1,$2,'member')
             ON CONFLICT (team_id, user_id)
             DO NOTHING`, [
                    invite.team_id,
                    userId,
                ]);
            }
        });
        return {
            accepted: true,
        };
    }
    async getUsage(organizationId) {
        const [orgRes, userRes,] = await Promise.all([
            this.db.query(`SELECT
           o.storage_used_bytes,
           o.ai_requests_used,
           bp.storage_gb,
           bp.ai_requests_per_month,
           bp.max_users
         FROM organizations o
         JOIN billing_plans bp
           ON o.plan_id = bp.id
         WHERE o.id = $1`, [organizationId]),
            this.db.query(`SELECT COUNT(*)
         FROM users
         WHERE organization_id = $1
           AND is_active = TRUE`, [organizationId]),
        ]);
        if (!orgRes.rows[0]) {
            throw new common_1.NotFoundException('Organization not found');
        }
        const org = orgRes.rows[0];
        const userCount = parseInt(userRes.rows[0]?.count ??
            '0', 10);
        return {
            users: {
                used: userCount,
                limit: org.max_users,
            },
            storage: {
                usedGb: Number(org.storage_used_bytes) /
                    1024 ** 3,
                limitGb: org.storage_gb,
            },
            aiRequests: {
                used: org.ai_requests_used,
                limit: org.ai_requests_per_month,
            },
        };
    }
};
exports.OrganizationsService = OrganizationsService;
exports.OrganizationsService = OrganizationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        email_service_1.EmailService,
        config_1.ConfigService])
], OrganizationsService);
//# sourceMappingURL=organizations.service.js.map