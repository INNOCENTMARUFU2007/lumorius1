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
var AdminService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
let AdminService = AdminService_1 = class AdminService {
    constructor(db) {
        this.db = db;
        this.logger = new common_1.Logger(AdminService_1.name);
    }
    async getPlatformStats() {
        const [users, orgs, docs, meetings, activeSubs] = await Promise.all([
            this.db.query('SELECT COUNT(*) FROM users'),
            this.db.query('SELECT COUNT(*) FROM organizations'),
            this.db.query('SELECT COUNT(*) FROM documents'),
            this.db.query('SELECT COUNT(*) FROM meetings'),
            this.db.query("SELECT COUNT(*) FROM subscriptions WHERE status = 'active'"),
        ]);
        const mrrRes = await this.db.query(`
      SELECT COALESCE(SUM(
        CASE s.interval
          WHEN 'monthly' THEN bp.monthly_price_cents
          WHEN 'annual'  THEN ROUND(bp.annual_price_cents / 12)
        END
      ), 0) AS mrr
      FROM subscriptions s
      JOIN billing_plans bp ON s.plan_id = bp.id
      WHERE s.status = 'active'
    `);
        const growthRes = await this.db.query(`
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);
        return {
            totals: {
                users: parseInt(users.rows[0]?.count ?? '0'),
                orgs: parseInt(orgs.rows[0]?.count ?? '0'),
                documents: parseInt(docs.rows[0]?.count ?? '0'),
                meetings: parseInt(meetings.rows[0]?.count ?? '0'),
                activeSubs: parseInt(activeSubs.rows[0]?.count ?? '0'),
                mrrCents: parseInt(mrrRes.rows[0]?.mrr ?? '0'),
            },
            userGrowth: growthRes.rows,
        };
    }
    async listUsers(page = 1, limit = 25, search) {
        const offset = (page - 1) * limit;
        const params = [`%${search ?? ''}%`, limit, offset];
        const data = await this.db.query(`
      SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.email_verified,
             u.created_at, u.last_login_at,
             o.name AS org_name, o.id AS org_id,
             bp.name AS plan_name
      FROM users u
      LEFT JOIN organization_members om ON om.user_id = u.id AND om.is_primary = TRUE
      LEFT JOIN organizations o ON o.id = om.organization_id
      LEFT JOIN billing_plans bp ON bp.id = o.plan_id
      WHERE u.email ILIKE $1 OR u.full_name ILIKE $1
      ORDER BY u.created_at DESC
      LIMIT $2 OFFSET $3
    `, params);
        const count = await this.db.query(`SELECT COUNT(*) FROM users WHERE email ILIKE $1 OR full_name ILIKE $1`, [`%${search ?? ''}%`]);
        return {
            data: data.rows,
            total: parseInt(count.rows[0]?.count ?? '0'),
            page,
            limit,
        };
    }
    async getUserById(userId) {
        const res = await this.db.query(`
      SELECT u.*, o.name AS org_name, bp.name AS plan_name
      FROM users u
      LEFT JOIN organization_members om ON om.user_id = u.id AND om.is_primary = TRUE
      LEFT JOIN organizations o ON o.id = om.organization_id
      LEFT JOIN billing_plans bp ON bp.id = o.plan_id
      WHERE u.id = $1
    `, [userId]);
        if (!res.rows[0])
            throw new common_1.NotFoundException('User not found');
        return res.rows[0];
    }
    async suspendUser(userId, adminId) {
        if (userId === adminId)
            throw new common_1.ForbiddenException('Cannot suspend yourself');
        await this.db.query(`UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1`, [userId]);
        await this.db.query(`INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata)
       VALUES (gen_random_uuid(), $1, 'admin.user.suspend', 'user', $2, $3)`, [adminId, userId, JSON.stringify({ by: adminId })]);
        this.logger.warn(`User ${userId} suspended by admin ${adminId}`);
    }
    async reinstateUser(userId, adminId) {
        await this.db.query(`UPDATE users SET is_active = TRUE, failed_login_attempts = 0,
       locked_until = NULL, updated_at = NOW() WHERE id = $1`, [userId]);
        this.logger.log(`User ${userId} reinstated by admin ${adminId}`);
    }
    async deleteUser(userId, adminId) {
        if (userId === adminId)
            throw new common_1.ForbiddenException('Cannot delete yourself');
        await this.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
        this.logger.warn(`User ${userId} deleted by admin ${adminId}`);
    }
    async listOrgs(page = 1, limit = 25, search) {
        const offset = (page - 1) * limit;
        const data = await this.db.query(`
      SELECT o.*, bp.name AS plan_name,
             COUNT(DISTINCT om.user_id) AS member_count,
             s.status AS subscription_status
      FROM organizations o
      LEFT JOIN billing_plans bp ON bp.id = o.plan_id
      LEFT JOIN organization_members om ON om.organization_id = o.id
      LEFT JOIN subscriptions s ON s.organization_id = o.id
      WHERE o.name ILIKE $1
      GROUP BY o.id, bp.name, s.status
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `, [`%${search ?? ''}%`, limit, (page - 1) * limit]);
        const count = await this.db.query(`SELECT COUNT(*) FROM organizations WHERE name ILIKE $1`, [`%${search ?? ''}%`]);
        return {
            data: data.rows,
            total: parseInt(count.rows[0]?.count ?? '0'),
            page,
            limit,
        };
    }
    async changePlan(orgId, planId, adminId) {
        await this.db.query(`UPDATE organizations SET plan_id = $1, updated_at = NOW() WHERE id = $2`, [planId, orgId]);
        await this.db.query(`INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata)
       VALUES (gen_random_uuid(), $1, 'admin.org.plan_change', 'organization', $2, $3)`, [adminId, orgId, JSON.stringify({ newPlanId: planId })]);
        this.logger.log(`Org ${orgId} plan changed to ${planId} by admin ${adminId}`);
    }
    async getAuditLogs(page = 1, limit = 50) {
        const offset = (page - 1) * limit;
        const res = await this.db.query(`
      SELECT al.*, u.email AS user_email, u.full_name AS user_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
        const count = await this.db.query('SELECT COUNT(*) FROM audit_logs');
        return {
            data: res.rows,
            total: parseInt(count.rows[0]?.count ?? '0'),
            page,
            limit,
        };
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = AdminService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], AdminService);
//# sourceMappingURL=admin.service.js.map