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

    // The schema stores billing prices in currency units. Return cents because
    // the dashboard formats mrrCents as a USD amount.
    const mrrRes = await this.db.query<{ mrr: string }>(`
      SELECT COALESCE(SUM(
        CASE
          WHEN s.stripe_price_id IS NOT NULL
            AND bp.stripe_price_yearly IS NOT NULL
            AND s.stripe_price_id = bp.stripe_price_yearly
            THEN ROUND((bp.price_yearly * 100) / 12)
          ELSE ROUND(bp.price_monthly * 100)
        END
      ), 0) AS mrr
      FROM subscriptions s
      JOIN billing_plans bp ON bp.id = s.plan_id
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
        users: parseInt(users.rows[0]?.count ?? '0', 10),
        orgs: parseInt(orgs.rows[0]?.count ?? '0', 10),
        documents: parseInt(docs.rows[0]?.count ?? '0', 10),
        meetings: parseInt(meetings.rows[0]?.count ?? '0', 10),
        activeSubs: parseInt(activeSubs.rows[0]?.count ?? '0', 10),
        mrrCents: parseInt(mrrRes.rows[0]?.mrr ?? '0', 10),
      },
      userGrowth: growthRes.rows,
    };
  }  async listUsers(page = 1, limit = 25, search?: string) {
    const safePage = Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1);
    const safeLimit = Math.min(100, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 25));
    const offset = (safePage - 1) * safeLimit;
    const searchPattern = `%${search ?? ''}%`;

    const data = await this.db.query<Record<string, unknown>>(`
      SELECT
        u.id,
        u.email,
        u.name AS full_name,
        u.role,
        u.is_active,
        u.email_verified,
        u.created_at,
        u.last_login_at,
        o.name AS org_name,
        o.id AS org_id,
        bp.name AS plan_name
      FROM users u
      LEFT JOIN organizations o ON o.id = u.organization_id
      LEFT JOIN billing_plans bp ON bp.id = o.plan_id::text
      WHERE (u.email ILIKE $1 OR u.name ILIKE $1)
      ORDER BY u.created_at DESC
      LIMIT $2 OFFSET $3
    `, [searchPattern, safeLimit, offset]);

    const count = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) FROM users WHERE email ILIKE $1 OR name ILIKE $1',
      [searchPattern],
    );

    return {
      data: data.rows,
      total: parseInt(count.rows[0]?.count ?? '0', 10),
      page: safePage,
      limit: safeLimit,
    };
  }  async getUserById(userId: string) {
    const res = await this.db.query<Record<string, unknown>>(`
      SELECT u.*, u.name AS full_name, o.name AS org_name, bp.name AS plan_name
      FROM users u
      LEFT JOIN organizations o ON o.id = u.organization_id
      LEFT JOIN billing_plans bp ON bp.id = o.plan_id::text
      WHERE u.id = $1
      LIMIT 1
    `, [userId]);

    if (!res.rows[0]) throw new NotFoundException('User not found');
    return res.rows[0];
  }

  async suspendUser(userId: string, adminId: string) {
    if (userId === adminId) throw new ForbiddenException('Cannot suspend yourself');

    const suspended = await this.db.query<{ id: string }>(
      `UPDATE users
       SET is_active = FALSE,
           tokens_valid_after = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [userId],
    );
    if (!suspended.rows[0]) throw new NotFoundException('User not found');

    // Revoke refresh sessions and set a cutoff for already-issued access tokens.
    await this.db.query(
      'UPDATE sessions SET is_valid = FALSE WHERE user_id = $1',
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
    const reinstated = await this.db.query<{ id: string }>(
      `UPDATE users
       SET is_active = TRUE,
           failed_login_count = 0,
           locked_until = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [userId],
    );
    if (!reinstated.rows[0]) throw new NotFoundException('User not found');

    // Do not revalidate old sessions or old access tokens. Require a fresh login.
    await this.db.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata)
       VALUES (gen_random_uuid(), $1, 'admin.user.reinstate', 'user', $2, $3)`,
      [adminId, userId, JSON.stringify({ by: adminId })],
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
    const safePage = Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1);
    const safeLimit = Math.min(100, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 25));
    const offset = (safePage - 1) * safeLimit;
    const searchPattern = `%${search ?? ''}%`;

    const data = await this.db.query<Record<string, unknown>>(`
      SELECT
        o.*,
        bp.name AS plan_name,
        COUNT(DISTINCT u.id)::int AS member_count,
        COALESCE(s.status::text, 'trial') AS subscription_status
      FROM organizations o
      LEFT JOIN billing_plans bp ON bp.id = o.plan_id::text
      LEFT JOIN users u ON u.organization_id = o.id
      LEFT JOIN LATERAL (
        SELECT sub.status
        FROM subscriptions sub
        WHERE sub.organization_id = o.id
        ORDER BY sub.created_at DESC
        LIMIT 1
      ) s ON TRUE
      WHERE o.name ILIKE $1
      GROUP BY o.id, bp.name, s.status
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `, [searchPattern, safeLimit, offset]);

    const count = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) FROM organizations WHERE name ILIKE $1',
      [searchPattern],
    );

    return {
      data: data.rows,
      total: parseInt(count.rows[0]?.count ?? '0', 10),
      page: safePage,
      limit: safeLimit,
    };
  }  async changePlan(orgId: string, planId: string, adminId: string) {
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
      SELECT al.*, u.email AS user_email, u.name AS user_name
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
