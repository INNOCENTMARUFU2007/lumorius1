import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';

interface CreateNotificationOptions {
  userId: string;
  organizationId: string;
  type: string;
  title: string;
  message?: string;
  actionUrl?: string;
  data?: Record<string, unknown>;
}

interface BroadcastNotificationOptions {
  organizationId: string;
  type: string;
  title: string;
  message?: string;
  actionUrl?: string;
  data?: Record<string, unknown>;
  recipientRoles?: string[];
  excludeUserIds?: string[];
  includeUserIds?: string[];
  eventKey?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async create(opts: CreateNotificationOptions) {
    const id = uuidv4();

    await this.db.query(
      `INSERT INTO notifications (
        id, user_id, organization_id, type, title,
        message, action_url, data
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        id,
        opts.userId,
        opts.organizationId,
        opts.type,
        opts.title,
        opts.message ?? null,
        opts.actionUrl ?? null,
        JSON.stringify(opts.data ?? {}),
      ],
    );

    return { id };
  }

  async createForOrganization(opts: BroadcastNotificationOptions) {
    const eventKey = opts.eventKey?.trim() || undefined;

    const data = {
      ...(opts.data ?? {}),
      ...(eventKey ? { eventKey } : {}),
    };

    const roles = opts.recipientRoles?.length
      ? [...new Set(opts.recipientRoles)]
      : null;

    const excludedUserIds = [
      ...new Set(opts.excludeUserIds ?? []),
    ];
    const includedUserIds = opts.includeUserIds === undefined ? undefined : [...new Set(opts.includeUserIds)];

    const result = await this.db.query<{ user_id: string }>(
      `INSERT INTO notifications (
        id, user_id, organization_id, type, title,
        message, action_url, data
      )
      SELECT
        gen_random_uuid(),
        u.id,
        u.organization_id,
        $2, $3, $4, $5, $6::jsonb
      FROM users u
      WHERE u.organization_id = $1
        AND u.is_active = TRUE
        AND ($7::text[] IS NULL OR u.role::text = ANY($7::text[]))
        AND NOT (u.id = ANY($8::uuid[]))
        ${includedUserIds === undefined ? '' : 'AND u.id = ANY($9::uuid[])'}
      ON CONFLICT (user_id, (data ->> 'eventKey'))
        WHERE (data ? 'eventKey')
      DO NOTHING
      RETURNING user_id`,
      [
        opts.organizationId,
        opts.type,
        opts.title,
        opts.message ?? null,
        opts.actionUrl ?? null,
        JSON.stringify(data),
        roles,
        excludedUserIds,
        ...(includedUserIds === undefined ? [] : [includedUserIds]),
      ],
    );

    return {
      createdCount: result.rows.length,
      userIds: result.rows.map((row) => row.user_id),
    };
  }

  async findAll(userId: string, unreadOnly = false) {
    const where = unreadOnly ? 'AND read_at IS NULL' : '';

    const result = await this.db.query(
      `SELECT id, type, title, message, action_url, data,
              read_at, created_at
       FROM notifications
       WHERE user_id = $1 ${where}
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId],
    );

    return result.rows;
  }

  async feed(userId: string, organizationId: string, unreadOnly: boolean, pageInput: unknown) {
    const pageSize = 25;
    const requested = Number(pageInput ?? 1);
    const page = Number.isSafeInteger(requested) ? Math.min(1_000_000, Math.max(1, requested)) : 1;
    const [rows, counts] = await Promise.all([
      this.db.query(
        `SELECT id, type, title, message, action_url, data, read_at, created_at
           FROM notifications
          WHERE user_id = $1 AND organization_id = $2 AND (NOT $3::boolean OR read_at IS NULL)
          ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`,
        [userId, organizationId, unreadOnly, pageSize, (page - 1) * pageSize],
      ),
      this.db.query<{ all_count: number; unread: number }>(
        `SELECT COUNT(*)::int AS all_count, COUNT(*) FILTER (WHERE read_at IS NULL)::int AS unread
           FROM notifications WHERE user_id = $1 AND organization_id = $2`,
        [userId, organizationId],
      ),
    ]);
    const summary = counts.rows[0] ?? { all_count: 0, unread: 0 };
    const total = unreadOnly ? summary.unread : summary.all_count;
    return { items: rows.rows, total, unread: summary.unread, page, pageSize };
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.db.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Notification not found');
    }

    return { read: true };
  }

  async markAllRead(userId: string) {
    const result = await this.db.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );

    return {
      read: true,
      updated: result.rowCount ?? 0,
    };
  }

  async delete(userId: string, notificationId: string) {
    const result = await this.db.query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [notificationId, userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException('Notification not found');
    }

    return { deleted: true, id: notificationId };
  }

  async getUnreadCount(userId: string) {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM notifications
       WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );

    return {
      count: Number.parseInt(result.rows[0]?.count ?? '0', 10),
    };
  }
}
