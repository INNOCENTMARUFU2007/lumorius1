import {Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
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

    const dauRes = await this.db.query<{ count: string }>(`
      SELECT COUNT(DISTINCT s.user_id)::text AS count
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE u.is_active = TRUE
        AND s.is_valid = TRUE
        AND COALESCE(s.last_active_at, s.created_at) >= NOW() - INTERVAL '24 hours'
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
        dailyActiveUsers: parseInt(dauRes.rows[0]?.count ?? '0', 10),
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
      WHERE (u.email ILIKE $1 OR u.name ILIKE $1 OR COALESCE(o.name, 'No organisation') ILIKE $1)
      ORDER BY (o.id IS NULL) ASC, COALESCE(o.name, '') ASC, u.created_at DESC, u.email ASC
      LIMIT $2 OFFSET $3
    `, [searchPattern, safeLimit, offset]);

    const count = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE (u.email ILIKE $1 OR u.name ILIKE $1 OR COALESCE(o.name, 'No organisation') ILIKE $1)`,
      [searchPattern],
    );

    return {
      data: data.rows,
      total: parseInt(count.rows[0]?.count ?? '0', 10),
      page: safePage,
      limit: safeLimit,
    };
  }    // Cursor-based global user listing. Avoids OFFSET scans and full COUNT(*) queries on very large tenants.
  async listUsersCursor(search?: string, cursor?: string, requestedLimit = 25) {
    const numericLimit = Number(requestedLimit);
    const limit = Number.isFinite(numericLimit)
      ? Math.min(100, Math.max(1, Math.trunc(numericLimit)))
      : 25;
    const searchTerm = typeof search === 'string' ? search.trim() : '';

    if (searchTerm.length > 200) {
      throw new BadRequestException('Search must be 200 characters or fewer.');
    }
    if (searchTerm.length > 0 && searchTerm.length < 3) {
      throw new BadRequestException('Enter at least 3 characters to search.');
    }

    type UserListCursor = { organizationId: string | null; createdAt: string; id: string };
    let cursorValues: UserListCursor | null = null;
    if (cursor) {
      let decoded: unknown;
      try {
        decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      } catch {
        throw new BadRequestException('Invalid users pagination cursor.');
      }

      if (!decoded || typeof decoded !== 'object') {
        throw new BadRequestException('Invalid users pagination cursor.');
      }
      const value = decoded as Record<string, unknown>;
      const isUuid = (candidate: unknown): candidate is string =>
        typeof candidate === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate);
      if (
        !(value.organizationId === null || isUuid(value.organizationId)) ||
        !isUuid(value.id) ||
        typeof value.createdAt !== 'string' ||
        Number.isNaN(Date.parse(value.createdAt))
      ) {
        throw new BadRequestException('Invalid users pagination cursor.');
      }
      cursorValues = {
        organizationId: value.organizationId as string | null,
        createdAt: value.createdAt,
        id: value.id,
      };
    }

    const params: unknown[] = [];
    const conditions: string[] = [];
    if (searchTerm) {
      params.push(`%${searchTerm}%`);
      const searchParam = `$${params.length}`;
      conditions.push(`(u.email ILIKE ${searchParam} OR u.name ILIKE ${searchParam} OR o.name ILIKE ${searchParam})`);
    }

    if (cursorValues) {
      params.push(cursorValues.organizationId, cursorValues.createdAt, cursorValues.id);
      const organizationParam = `$${params.length - 2}`;
      const createdAtParam = `$${params.length - 1}`;
      const idParam = `$${params.length}`;
      const sameOrganizationAfter = `(u.created_at < ${createdAtParam}::timestamptz OR (u.created_at = ${createdAtParam}::timestamptz AND u.id > ${idParam}::uuid))`;
      conditions.push(`(
        (${organizationParam}::uuid IS NULL AND (
          (u.organization_id IS NULL AND ${sameOrganizationAfter})
          OR u.organization_id IS NOT NULL
        ))
        OR
        (${organizationParam}::uuid IS NOT NULL AND (
          u.organization_id > ${organizationParam}::uuid
          OR (u.organization_id = ${organizationParam}::uuid AND ${sameOrganizationAfter})
        ))
      )`);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit + 1);
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT u.id, u.email, u.name AS full_name, u.role, u.is_active, u.email_verified,
              u.created_at, u.last_login_at,
              o.name AS org_name, o.id AS org_id,
              bp.name AS plan_name
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN billing_plans bp ON bp.id = o.plan_id::text
       ${whereSql}
       ORDER BY u.organization_id ASC NULLS FIRST, u.created_at DESC, u.id ASC
       LIMIT $${params.length}`,
      params,
    );

    const rows = result.rows ?? [];
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({
          organizationId: last.org_id == null ? null : String(last.org_id),
          createdAt: last.created_at instanceof Date ? last.created_at.toISOString() : String(last.created_at),
          id: String(last.id),
        }), 'utf8').toString('base64url')
      : null;

    return { data, hasMore, nextCursor, limit };
  }
  async getUserById(userId: string) {
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
