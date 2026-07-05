import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly db: DatabaseService) {}

  // ── Platform overview ────────────────────────────────────────
  async getPlatformStats() {
    const [users, orgs, docs, meetings, activeSubs] = await Promise.all([
      this.db.query<{ count: string }>('SELECT COUNT(*) FROM users'),
      this.db.query<{ count: string }>('SELECT COUNT(*) FROM organizations'),
      this.db.query<{ count: string }>('SELECT COUNT(*) FROM documents'),
      this.db.query<{ count: string }>('SELECT COUNT(*) FROM meetings'),
      this.db.query<{ count: string }>(
        "SELECT COUNT(*) FROM subscriptions WHERE status = 'active'",
      ),
    ]);

    const mrrRes = await this.db.query<{ mrr: string }>(`
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

    const growthRes = await this.db.query<{ date: string; count: string }>(`
      SELECT DATE(created_at) AS date, COUNT(*) AS count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `);

    return {
      totals: {
        users:       parseInt(users.rows[0]?.count ?? '0'),
        orgs:        parseInt(orgs.rows[0]?.count ?? '0'),
        documents:   parseInt(docs.rows[0]?.count ?? '0'),
        meetings:    parseInt(meetings.rows[0]?.count ?? '0'),
        activeSubs:  parseInt(activeSubs.rows[0]?.count ?? '0'),
        mrrCents:    parseInt(mrrRes.rows[0]?.mrr ?? '0'),
      },
      userGrowth: growthRes.rows,
    };
  }

  // ── User management ──────────────────────────────────────────
  async listUsers(page = 1, limit = 25, search?: string) {
    const offset = (page - 1) * limit;
    const params: unknown[] = [`%${search ?? ''}%`, limit, offset];

    const data = await this.db.query<Record<string, unknown>>(`
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

    const count = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM users WHERE email ILIKE $1 OR full_name ILIKE $1`,
      [`%${search ?? ''}%`],
    );

    return {
      data: data.rows,
      total: parseInt(count.rows[0]?.count ?? '0'),
      page,
      limit,
    };
  }

  async getUserById(userId: string) {
    const res = await this.db.query<Record<string, unknown>>(`
      SELECT u.*, o.name AS org_name, bp.name AS plan_name
      FROM users u
      LEFT JOIN organization_members om ON om.user_id = u.id AND om.is_primary = TRUE
      LEFT JOIN organizations o ON o.id = om.organization_id
      LEFT JOIN billing_plans bp ON bp.id = o.plan_id
      WHERE u.id = $1
    `, [userId]);

    if (!res.rows[0]) throw new NotFoundException('User not found');
    return res.rows[0];
  }

  async suspendUser(userId: string, adminId: string) {
    if (userId === adminId) throw new ForbiddenException('Cannot suspend yourself');
    await this.db.query(
      `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [userId],
    );
    await this.db.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata)
       VALUES (gen_random_uuid(), $1, 'admin.user.suspend', 'user', $2, $3)`,
      [adminId, userId, JSON.stringify({ by: adminId })],
    );
    this.logger.warn(`User ${userId} suspended by admin ${adminId}`);
  }

  async reinstateUser(userId: string, adminId: string) {
    await this.db.query(
      `UPDATE users SET is_active = TRUE, failed_login_attempts = 0,
       locked_until = NULL, updated_at = NOW() WHERE id = $1`,
      [userId],
    );
    this.logger.log(`User ${userId} reinstated by admin ${adminId}`);
  }

  async deleteUser(userId: string, adminId: string) {
    if (userId === adminId) throw new ForbiddenException('Cannot delete yourself');
    await this.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    this.logger.warn(`User ${userId} deleted by admin ${adminId}`);
  }

  // ── Organization management ──────────────────────────────────
  async listOrgs(page = 1, limit = 25, search?: string) {
    const offset = (page - 1) * limit;
    const data = await this.db.query<Record<string, unknown>>(`
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

    const count = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) FROM organizations WHERE name ILIKE $1`,
      [`%${search ?? ''}%`],
    );

    return {
      data: data.rows,
      total: parseInt(count.rows[0]?.count ?? '0'),
      page,
      limit,
    };
  }

  async changePlan(orgId: string, planId: string, adminId: string) {
    await this.db.query(
      `UPDATE organizations SET plan_id = $1, updated_at = NOW() WHERE id = $2`,
      [planId, orgId],
    );
    await this.db.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata)
       VALUES (gen_random_uuid(), $1, 'admin.org.plan_change', 'organization', $2, $3)`,
      [adminId, orgId, JSON.stringify({ newPlanId: planId })],
    );
    this.logger.log(`Org ${orgId} plan changed to ${planId} by admin ${adminId}`);
  }

  // ── Audit log viewer ─────────────────────────────────────────
  async getAuditLogs(page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const res = await this.db.query<Record<string, unknown>>(`
      SELECT al.*, u.email AS user_email, u.full_name AS user_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    const count = await this.db.query<{ count: string }>('SELECT COUNT(*) FROM audit_logs');
    return {
      data: res.rows,
      total: parseInt(count.rows[0]?.count ?? '0'),
      page,
      limit,
    };
  }
}
