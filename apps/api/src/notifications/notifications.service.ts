import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async create(opts: {
    userId: string;
    organizationId: string;
    type: string;
    title: string;
    message?: string;
    data?: Record<string, unknown>;
  }) {
    const id = uuidv4();
    await this.db.query(
      `INSERT INTO notifications (id, user_id, organization_id, type, title, message, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, opts.userId, opts.organizationId, opts.type, opts.title,
       opts.message ?? null, JSON.stringify(opts.data ?? {})],
    );
    return { id };
  }

  async findAll(userId: string, unreadOnly = false) {
    const where = unreadOnly ? 'AND read_at IS NULL' : '';
    const res = await this.db.query(
      `SELECT id, type, title, message, data, read_at, created_at
       FROM notifications WHERE user_id = $1 ${where}
       ORDER BY created_at DESC LIMIT 50`,
      [userId],
    );
    return res.rows;
  }

  async markRead(userId: string, notificationId: string) {
    await this.db.query(
      'UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2',
      [notificationId, userId],
    );
    return { read: true };
  }

  async markAllRead(userId: string) {
    await this.db.query(
      'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    return { read: true };
  }

  async getUnreadCount(userId: string) {
    const res = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    return { count: parseInt(res.rows[0]?.count ?? '0', 10) };
  }
}
