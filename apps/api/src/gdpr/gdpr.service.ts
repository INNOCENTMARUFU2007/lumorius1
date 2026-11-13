import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';

const DELETION_GRACE_PERIOD_DAYS = 30;
const RETENTION_RESOURCES = ['audit_logs', 'meeting_transcripts'] as const;
type RetentionResource = typeof RETENTION_RESOURCES[number];

@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

  constructor(private readonly db: DatabaseService) {}

  async exportUserData(userId: string): Promise<Record<string, unknown>> {
    const user = await this.db.query<Record<string, unknown>>(
      `SELECT id, email, name, avatar_url, role, organization_id,
              created_at, last_login_at
       FROM users
       WHERE id = $1 AND is_active = TRUE`,
      [userId],
    );
    const userRow = user.rows[0];
    if (!userRow) throw new NotFoundException('User not found or inactive');

    const organizationId = (userRow.organization_id as string | null) ?? null;
    const [documents, meetings, tasks, auditLogs, apiKeys, sessions] = await Promise.all([
      this.db.query<Record<string, unknown>>(
        `SELECT id, name, type, size_bytes, created_at
         FROM documents
         WHERE uploaded_by_id = $1
           AND organization_id IS NOT DISTINCT FROM $2
         ORDER BY created_at DESC`,
        [userId, organizationId],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT m.id, m.title, m.created_at,
                mt.content AS transcript,
                ma.summary, ma.action_items, ma.decisions
         FROM meetings m
         LEFT JOIN meeting_transcripts mt ON mt.meeting_id = m.id
         LEFT JOIN meeting_analyses ma ON ma.meeting_id = m.id
         WHERE m.created_by_id = $1
           AND m.organization_id IS NOT DISTINCT FROM $2
         ORDER BY m.created_at DESC`,
        [userId, organizationId],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT id, title, description, status, priority, due_date, created_at
         FROM tasks
         WHERE created_by_id = $1
           AND organization_id IS NOT DISTINCT FROM $2
         ORDER BY created_at DESC`,
        [userId, organizationId],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT action, resource_type, resource_id, metadata, ip_address, created_at
         FROM audit_logs
         WHERE user_id = $1
           AND organization_id IS NOT DISTINCT FROM $2
         ORDER BY created_at DESC`,
        [userId, organizationId],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at
         FROM api_keys
         WHERE created_by_id = $1
           AND organization_id IS NOT DISTINCT FROM $2
         ORDER BY created_at DESC`,
        [userId, organizationId],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT id, device_name, device_type, ip_address, user_agent,
                is_valid, last_active_at, expires_at, created_at
         FROM sessions
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId],
      ),
    ]);

    await this.db.transaction((client) => this.insertAudit(client, {
      organizationId,
      userId,
      action: 'gdpr.data_export',
      resourceType: 'user',
      resourceId: userId,
      metadata: { exportVersion: '1.0' },
    }));

    this.logger.log(`GDPR data export completed for user ${userId}`);
    return {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      user: userRow,
      documents: documents.rows,
      meetings: meetings.rows,
      tasks: tasks.rows,
      auditLogs: auditLogs.rows,
      apiKeys: apiKeys.rows,
      sessions: sessions.rows,
    };
  }

  async requestDeletion(userId: string) {
    const scheduledAt = new Date(Date.now() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    return this.db.transaction(async (client) => {
      const current = await client.query<Record<string, unknown>>(
        `SELECT organization_id, deletion_scheduled_at, is_active
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [userId],
      );
      const user = current.rows[0];
      if (!user) throw new NotFoundException('User not found');
      if (user.deletion_scheduled_at) {
        throw new ConflictException('A deletion request is already scheduled for this account.');
      }
      if (!user.is_active) {
        throw new ConflictException('This account is inactive and cannot request deletion.');
      }

      await client.query(
        `UPDATE users
         SET deletion_requested_at = NOW(),
             deletion_scheduled_at = $1,
             deletion_status = 'requested',
             deletion_failure_reason = NULL,
             deletion_completed_at = NULL,
             updated_at = NOW()
         WHERE id = $2`,
        [scheduledAt, userId],
      );
      await this.insertAudit(client, {
        organizationId: user.organization_id as string | null,
        userId,
        action: 'gdpr.deletion_requested',
        resourceType: 'user',
        resourceId: userId,
        metadata: { scheduledAt: scheduledAt.toISOString(), gracePeriodDays: DELETION_GRACE_PERIOD_DAYS },
      });

      return {
        status: 'requested',
        requestedAt: new Date().toISOString(),
        scheduledAt: scheduledAt.toISOString(),
      };
    });
  }

  async getDeletionStatus(userId: string) {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT deletion_status, deletion_requested_at, deletion_scheduled_at,
              deletion_completed_at, deletion_failure_reason
       FROM users
       WHERE id = $1`,
      [userId],
    );
    const status = result.rows[0];
    if (!status) throw new NotFoundException('User not found');

    return {
      status: status.deletion_status ?? 'none',
      requestedAt: status.deletion_requested_at ?? null,
      scheduledAt: status.deletion_scheduled_at ?? null,
      completedAt: status.deletion_completed_at ?? null,
      failureReason: status.deletion_failure_reason ?? null,
    };
  }

  async cancelDeletion(userId: string) {
    return this.db.transaction(async (client) => {
      const current = await client.query<Record<string, unknown>>(
        `SELECT organization_id, deletion_scheduled_at, deletion_status
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [userId],
      );
      const user = current.rows[0];
      if (!user) throw new NotFoundException('User not found');
      if (
        user.deletion_status !== 'requested' ||
        !user.deletion_scheduled_at ||
        new Date(String(user.deletion_scheduled_at)).getTime() <= Date.now()
      ) {
        throw new ConflictException('There is no cancellable deletion request.');
      }

      await client.query(
        `UPDATE users
         SET deletion_scheduled_at = NULL,
             deletion_status = 'cancelled',
             deletion_failure_reason = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [userId],
      );
      await this.insertAudit(client, {
        organizationId: user.organization_id as string | null,
        userId,
        action: 'gdpr.deletion_cancelled',
        resourceType: 'user',
        resourceId: userId,
      });
      return { status: 'cancelled' };
    });
  }

  async requestOrganizationDeletion(organizationId: string, userId: string) {
    const scheduledAt = new Date(Date.now() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    return this.db.transaction(async (client) => {
      const orgResult = await client.query<{ name: string }>(
        `SELECT name FROM organizations WHERE id = $1 FOR UPDATE`,
        [organizationId],
      );
      const organization = orgResult.rows[0];
      if (!organization) throw new NotFoundException('Organization not found');
      const existing = await client.query(
        `SELECT id
         FROM organization_deletion_requests
         WHERE organization_id = $1 AND status IN ('requested', 'processing')
         LIMIT 1`,
        [organizationId],
      );
      if (existing.rows[0]) {
        throw new ConflictException('An organization deletion request is already active.');
      }

      const request = await client.query<Record<string, unknown>>(
        `INSERT INTO organization_deletion_requests (
           organization_id, organization_name_snapshot, requested_by_user_id, scheduled_at
         )
         VALUES ($1, $2, $3, $4)
         RETURNING id, status, requested_at, scheduled_at`,
        [organizationId, organization.name, userId, scheduledAt],
      );
      await this.insertAudit(client, {
        organizationId,
        userId,
        action: 'gdpr.organization_deletion_requested',
        resourceType: 'organization',
        resourceId: organizationId,
        metadata: { requestId: request.rows[0].id, scheduledAt: scheduledAt.toISOString() },
      });
      return request.rows[0];
    });
  }

  async getOrganizationDeletionStatus(organizationId: string) {
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT id, status, requested_at, scheduled_at, processed_at, failure_reason
       FROM organization_deletion_requests
       WHERE organization_id = $1
       ORDER BY requested_at DESC
       LIMIT 1`,
      [organizationId],
    );
    return result.rows[0] ?? { status: 'none' };
  }

  async cancelOrganizationDeletion(organizationId: string, userId: string) {
    return this.db.transaction(async (client) => {
      const result = await client.query<Record<string, unknown>>(
        `UPDATE organization_deletion_requests
         SET status = 'cancelled', updated_at = NOW()
         WHERE id = (
           SELECT id FROM organization_deletion_requests
           WHERE organization_id = $1 AND status = 'requested' AND scheduled_at > NOW()
           ORDER BY requested_at DESC
           LIMIT 1
           FOR UPDATE
         )
         RETURNING id`,
        [organizationId],
      );
      if (!result.rows[0]) {
        throw new ConflictException('There is no cancellable organization deletion request.');
      }
      await this.insertAudit(client, {
        organizationId,
        userId,
        action: 'gdpr.organization_deletion_cancelled',
        resourceType: 'organization',
        resourceId: organizationId,
        metadata: { requestId: result.rows[0].id },
      });
      return { status: 'cancelled' };
    });
  }

  async getRetentionPolicies(organizationId: string) {
    const result = await this.db.query(
      `SELECT resource_type, retention_days, updated_at
       FROM organization_retention_policies
       WHERE organization_id = $1
       ORDER BY resource_type`,
      [organizationId],
    );
    return result.rows;
  }

  async setRetentionPolicy(
    organizationId: string,
    userId: string,
    resourceType: string,
    retentionDays: number,
  ) {
    if (!RETENTION_RESOURCES.includes(resourceType as RetentionResource)) {
      throw new BadRequestException(`Unsupported retention resource: ${resourceType}`);
    }
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
      throw new BadRequestException('Retention must be a whole number between 1 and 3650 days.');
    }

    return this.db.transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO organization_retention_policies (
           organization_id, resource_type, retention_days, updated_by_id
         )
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, resource_type)
         DO UPDATE SET retention_days = EXCLUDED.retention_days,
                       updated_by_id = EXCLUDED.updated_by_id,
                       updated_at = NOW()
         RETURNING resource_type, retention_days, updated_at`,
        [organizationId, resourceType, retentionDays, userId],
      );
      await this.insertAudit(client, {
        organizationId,
        userId,
        action: 'gdpr.retention_policy.updated',
        resourceType: 'retention_policy',
        resourceId: resourceType,
        metadata: { retentionDays },
      });
      return result.rows[0];
    });
  }

  async purgeScheduledDeletions() {
    const due = await this.db.query<{ id: string }>(
      `SELECT id
       FROM users
       WHERE deletion_status = 'requested'
         AND deletion_scheduled_at <= NOW()
       ORDER BY deletion_scheduled_at`,
    );
    let purged = 0;
    const failedRequests: string[] = [];

    for (const { id: userId } of due.rows) {
      try {
        const completed = await this.db.transaction(async (client) => {
          const current = await client.query<Record<string, unknown>>(
            `UPDATE users
             SET deletion_status = 'processing', updated_at = NOW()
             WHERE id = $1 AND deletion_status = 'requested'
               AND deletion_scheduled_at <= NOW()
             RETURNING organization_id`,
            [userId],
          );
          if (!current.rows[0]) return false;
          const organizationId = current.rows[0].organization_id as string | null;
          await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM api_keys WHERE created_by_id = $1', [userId]);
          await this.insertAudit(client, {
            organizationId,
            userId,
            action: 'gdpr.deletion_completed',
            resourceType: 'user',
            resourceId: userId,
          });
          await client.query(
            `UPDATE users
             SET email = $1, name = 'Deleted User', avatar_url = NULL,
                 password_hash = NULL, mfa_secret = NULL, is_active = FALSE,
                 organization_id = NULL, role = 'member',
                 deletion_status = 'completed', deletion_failure_reason = NULL,
                 deletion_completed_at = NOW(), deletion_scheduled_at = NULL,
                 updated_at = NOW()
             WHERE id = $2`,
            [`deleted_${userId}@deleted.invalid`, userId],
          );
          return true;
        });
        if (completed) purged += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message.slice(0, 500) : 'Unknown deletion failure';
        await this.db.query(
          `UPDATE users
           SET deletion_status = 'failed',
               deletion_failure_reason = $1,
               updated_at = NOW()
           WHERE id = $2 AND deletion_status IN ('requested', 'processing')`,
          [reason, userId],
        );
        failedRequests.push(userId);
        this.logger.error(`GDPR account deletion failed for ${userId}`, error);
      }
    }

    const organizations = await this.purgeScheduledOrganizationDeletions();
    const retention = await this.purgeExpiredRetentionData();
    return { purged, failed: failedRequests.length, failedRequests, organizations, retention };
  }

  private async purgeScheduledOrganizationDeletions() {
    const due = await this.db.query<{ id: string; organization_id: string }>(
      `SELECT id, organization_id
       FROM organization_deletion_requests
       WHERE status = 'requested' AND scheduled_at <= NOW()
         AND organization_id IS NOT NULL
       ORDER BY scheduled_at`,
    );
    let purged = 0;
    const failedRequests: string[] = [];

    for (const request of due.rows) {
      try {
        const completed = await this.db.transaction(async (client) => {
          const locked = await client.query<Record<string, unknown>>(
            `UPDATE organization_deletion_requests
             SET status = 'processing', updated_at = NOW()
             WHERE id = $1 AND status = 'requested' AND scheduled_at <= NOW()
             RETURNING organization_id, requested_by_user_id`,
            [request.id],
          );
          if (!locked.rows[0]) return false;

          await this.insertAudit(client, {
            organizationId: request.organization_id,
            userId: locked.rows[0].requested_by_user_id as string | null,
            action: 'gdpr.organization_deletion_completed',
            resourceType: 'organization',
            resourceId: request.organization_id,
            metadata: { requestId: request.id },
          });
          const deleted = await client.query(
            `DELETE FROM organizations WHERE id = $1 RETURNING id`,
            [request.organization_id],
          );
          if (!deleted.rows[0]) throw new NotFoundException('Organization no longer exists');
          await client.query(
            `UPDATE organization_deletion_requests
             SET organization_id = NULL, status = 'completed',
                 processed_at = NOW(), failure_reason = NULL, updated_at = NOW()
             WHERE id = $1`,
            [request.id],
          );
          return true;
        });
        if (completed) purged += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message.slice(0, 500) : 'Unknown deletion failure';
        await this.db.query(
          `UPDATE organization_deletion_requests
           SET status = 'failed', failure_reason = $1, updated_at = NOW()
           WHERE id = $2 AND status IN ('requested', 'processing')`,
          [reason, request.id],
        );
        failedRequests.push(request.id);
        this.logger.error(`GDPR organization deletion failed for request ${request.id}`, error);
      }
    }

    return { purged, failed: failedRequests.length, failedRequests };
  }

  private async purgeExpiredRetentionData() {
    const auditLogs = await this.db.query(
      `DELETE FROM audit_logs al
       USING organization_retention_policies policy
       WHERE policy.organization_id = al.organization_id
         AND policy.resource_type = 'audit_logs'
         AND al.created_at < NOW() - policy.retention_days * INTERVAL '1 day'`,
    );
    const transcripts = await this.db.query(
      `DELETE FROM meeting_transcripts transcript
       USING meetings meeting, organization_retention_policies policy
       WHERE transcript.meeting_id = meeting.id
         AND policy.organization_id = meeting.organization_id
         AND policy.resource_type = 'meeting_transcripts'
         AND transcript.created_at < NOW() - policy.retention_days * INTERVAL '1 day'`,
    );
    return {
      auditLogs: auditLogs.rowCount ?? 0,
      meetingTranscripts: transcripts.rowCount ?? 0,
    };
  }

  private async insertAudit(
    client: PoolClient,
    entry: {
      organizationId?: string | null;
      userId?: string | null;
      action: string;
      resourceType?: string;
      resourceId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await client.query(
      `INSERT INTO audit_logs (
         organization_id, user_id, action, resource_type, resource_id, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.organizationId ?? null,
        entry.userId ?? null,
        entry.action,
        entry.resourceType ?? null,
        entry.resourceId ?? null,
        JSON.stringify(entry.metadata ?? {}),
      ],
    );
  }
}
