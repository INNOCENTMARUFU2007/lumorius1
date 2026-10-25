import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';

@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly email: EmailService,
  ) {}

  /**
   * GDPR Article 20 — Right to Data Portability
   * Exports all personal data for a user as a JSON bundle.
   */
  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    const user = await this.db.query<Record<string, unknown>>(
      `SELECT id, email, full_name, avatar_url, role, created_at, last_login_at
       FROM users WHERE id = $1`,
      [userId],
    );
    if (!user.rows[0]) throw new NotFoundException('User not found');

    const [docs, meetings, tasks, auditLogs, apiKeys, sessions] = await Promise.all([
      this.db.query<Record<string, unknown>>(
        `SELECT title, file_name, created_at FROM documents
         WHERE uploaded_by = $1 ORDER BY created_at DESC`, [userId],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT title, transcript_summary, created_at FROM meetings
         WHERE created_by = $1 ORDER BY created_at DESC`, [userId],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT title, description, status, due_date, created_at FROM tasks
         WHERE created_by = $1 ORDER BY created_at DESC`, [userId],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT action, resource_type, ip_address, created_at FROM audit_logs
         WHERE user_id = $1 ORDER BY created_at DESC`, [userId],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT name, scopes, last_used_at, created_at FROM api_keys
         WHERE user_id = $1`, [userId],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT device_name, ip_address, last_used_at FROM user_sessions
         WHERE user_id = $1`, [userId],
      ),
    ]);

    const bundle = {
      exportedAt:    new Date().toISOString(),
      exportVersion: '1.0',
      user:          user.rows[0],
      documents:     docs.rows,
      meetings:      meetings.rows,
      tasks:         tasks.rows,
      auditLogs:     auditLogs.rows,
      apiKeys:       apiKeys.rows,
      sessions:      sessions.rows,
    };

    // Audit the export request itself
    await this.db.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata)
       VALUES (gen_random_uuid(), $1, 'gdpr.data_export', 'user', $1, '{}')`,
      [userId],
    );

    this.logger.log(`GDPR data export completed for user ${userId}`);
    return bundle;
  }

  /**
   * GDPR Article 17 — Right to Erasure ("right to be forgotten")
   * Schedules or immediately deletes all user personal data.
   */
  async requestDeletion(userId: string): Promise<{ scheduledAt: string; deletionAt: string }> {
    const deletionAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30-day grace period

    await this.db.query(
      `UPDATE users
       SET deletion_requested_at = NOW(),
           deletion_scheduled_at = $1,
           is_active = FALSE,
           updated_at = NOW()
       WHERE id = $2`,
      [deletionAt, userId],
    );

    await this.db.query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, metadata)
       VALUES (gen_random_uuid(), $1, 'gdpr.deletion_requested', 'user', $1, $2)`,
      [userId, JSON.stringify({ scheduledAt: deletionAt.toISOString() })],
    );

    this.logger.warn(`GDPR deletion requested for user ${userId}, scheduled for ${deletionAt.toISOString()}`);

    return {
      scheduledAt: new Date().toISOString(),
      deletionAt:  deletionAt.toISOString(),
    };
  }

  /**
   * Cancel a pending deletion request (within the grace period).
   */
  async cancelDeletion(userId: string) {
    await this.db.query(
      `UPDATE users
       SET deletion_requested_at = NULL,
           deletion_scheduled_at = NULL,
           is_active = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [userId],
    );
    this.logger.log(`GDPR deletion cancelled for user ${userId}`);
  }

  /**
   * Executed by a scheduler — purge accounts past the grace period.
   */
  async purgeScheduledDeletions() {
    const due = await this.db.query<Record<string, unknown>>(
      `SELECT id, email FROM users WHERE deletion_scheduled_at <= NOW() AND deletion_scheduled_at IS NOT NULL`,
    );

    for (const user of due.rows) {
      const uid = user.id as string;
      // Anonymise instead of hard delete to preserve referential integrity
      await this.db.query(
        `UPDATE users
         SET email = $1, full_name = 'Deleted User', avatar_url = NULL,
             password_hash = '', refresh_token_hash = NULL,
             mfa_secret = NULL, is_active = FALSE,
             deletion_scheduled_at = NULL, updated_at = NOW()
         WHERE id = $2`,
        [`deleted_${uid}@deleted.invalid`, uid],
      );
      await this.db.query(`DELETE FROM user_sessions WHERE user_id = $1`, [uid]);
     await this.db.query(
  `DELETE FROM api_keys WHERE created_by_id = $1`,
  [uid],
); 
      this.logger.warn(`GDPR: user ${uid} (${user.email}) purged`);
    }

    return { purged: due.rows.length };
  }
}
