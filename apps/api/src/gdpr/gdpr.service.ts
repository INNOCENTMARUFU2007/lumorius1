import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';

const exportResources: Record<string, string> = {
  tasks: 'id, title, description, status, priority, due_date, project_id, team_id, created_at, updated_at',
  projects: 'id, name, description, status, start_date, end_date, team_id, created_at, updated_at',
  documents: 'id, name, original_name, type, status, team_id, size_bytes, created_at, updated_at',
  meetings: 'id, title, description, status, team_id, scheduled_at, completed_at, created_at',
  objectives: 'id, title, description, status, progress, quarter, year, due_date, created_at, updated_at',
  knowledge_decisions: 'id, title, description, rationale, status, priority, team_id, decision_at, review_due_at, created_at',
};
const DELETION_GRACE_PERIOD_DAYS = 30;
const RETENTION_RESOURCES = ['audit_logs', 'meeting_transcripts'] as const;
type RetentionResource = typeof RETENTION_RESOURCES[number];

@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

  constructor(private readonly db: DatabaseService) {}

  async exportOrganizationData(organizationId: string, actorId: string, resource: string, after?: string) {
    if (!resource || !Object.prototype.hasOwnProperty.call(exportResources, resource) || (after !== undefined && !isUUID(after))) {
      throw new BadRequestException('Select a supported export resource and use the returned pagination cursor.');
    }
    return this.db.transaction(async (client) => {
      const result = await client.query(
        `SELECT ${exportResources[resource]} FROM ${resource}
          WHERE organization_id = $1 AND ($2::uuid IS NULL OR id > $2)
          ORDER BY id LIMIT 251`, [organizationId, after ?? null],
      );
      const records = result.rows.slice(0, 250);
      await this.insertAudit(client, {
        organizationId, userId: actorId, action: 'gdpr.organization_export',
        resourceType: 'organization', resourceId: organizationId,
        metadata: { resource, recordCount: records.length },
      });
      return {
        resource, exportedAt: new Date().toISOString(), records,
        nextCursor: result.rows.length > 250 ? records[249].id : null,
      };
    });
  }

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
    const canReadAllTeams = ['owner', 'admin'].includes(String(userRow.role));
    const [documents, meetings, tasks, auditLogs, apiKeys, sessions] = await Promise.all([
      this.db.query<Record<string, unknown>>(
        `SELECT id, name, type, size_bytes, created_at
         FROM documents d
         WHERE d.uploaded_by_id = $1
           AND d.organization_id IS NOT DISTINCT FROM $2
           AND (d.team_id IS NULL OR $3 OR EXISTS (
             SELECT 1 FROM team_members tm WHERE tm.team_id = d.team_id AND tm.user_id = $1
           ))
         ORDER BY d.created_at DESC`,
        [userId, organizationId, canReadAllTeams],
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
           AND (m.team_id IS NULL OR $3 OR EXISTS (
             SELECT 1 FROM team_members tm WHERE tm.team_id = m.team_id AND tm.user_id = $1
           ))
         ORDER BY m.created_at DESC`,
        [userId, organizationId, canReadAllTeams],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, t.created_at
         FROM tasks t LEFT JOIN projects p ON p.id = t.project_id AND p.organization_id = t.organization_id
         WHERE t.created_by_id = $1
           AND t.organization_id IS NOT DISTINCT FROM $2
           AND (COALESCE(t.team_id, p.team_id) IS NULL OR $3 OR EXISTS (
             SELECT 1 FROM team_members tm WHERE tm.team_id = COALESCE(t.team_id, p.team_id) AND tm.user_id = $1
           ))
         ORDER BY t.created_at DESC`,
        [userId, organizationId, canReadAllTeams],
      ),
      this.db.query<Record<string, unknown>>(
        `SELECT action, resource_type, resource_id, ip_address, created_at
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

  private async personalDeletionSuccessor(client: PoolClient, userId: string, organizationId: string | null, role: unknown) {
    if (!organizationId) return null;
    // Serialize departing owners so two scheduled deletions cannot strand a company.
    await client.query('SELECT id FROM organizations WHERE id = $1 FOR UPDATE', [organizationId]);
    const successor = await client.query<{ id: string }>(
      `SELECT id FROM users
       WHERE organization_id = $1 AND id <> $2 AND is_active = TRUE AND role::text = 'owner'
         AND deletion_status NOT IN ('requested', 'processing', 'completed')
       ORDER BY created_at, id LIMIT 1`,
      [organizationId, userId],
    );
    if (successor.rows[0]) return successor.rows[0].id;
    const workflows = await client.query<{owned:boolean}>(
      'SELECT EXISTS(SELECT 1 FROM workflows WHERE organization_id = $1 AND created_by_id = $2) AS owned',
      [organizationId,userId],
    );
    if (role === 'owner' || workflows.rows[0]?.owned) {
      throw new ConflictException('Transfer company ownership to another active owner before deleting your account. Your company and workflows will be preserved.');
    }
    return null;
  }

  async requestDeletion(userId: string) {
    const scheduledAt = new Date(Date.now() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    return this.db.transaction(async (client) => {
      const current = await client.query<Record<string, unknown>>(
        `SELECT organization_id, deletion_scheduled_at, deletion_status, is_active, role
         FROM users
         WHERE id = $1
         FOR UPDATE`,
        [userId],
      );
      const user = current.rows[0];
      if (!user) throw new NotFoundException('User not found');
      if (user.deletion_scheduled_at && user.deletion_status !== 'failed') {
        throw new ConflictException('A deletion request is already scheduled for this account.');
      }
      if (!user.is_active) {
        throw new ConflictException('This account is inactive and cannot request deletion.');
      }

      await this.personalDeletionSuccessor(client, userId, user.organization_id as string | null, user.role);
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
           organization_id, organization_id_snapshot, organization_name_snapshot, requested_by_user_id, scheduled_at
         )
         VALUES ($1, $1, $2, $3, $4)
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

  async getOrganizationDeletionReceipt(id: string, requesterId: string) {
    const result = await this.db.query(
      `SELECT r.id, r.status, r.requested_at, r.scheduled_at, r.processed_at, r.failure_reason,
              (SELECT COUNT(*)::int FROM document_storage_cleanup_outbox q
                WHERE q.organization_id = r.organization_id_snapshot) AS storage_objects_pending,
              (SELECT COUNT(*)::int FROM document_storage_cleanup_outbox q
                WHERE q.organization_id = r.organization_id_snapshot AND q.last_error IS NOT NULL) AS storage_objects_retrying
         FROM organization_deletion_requests r WHERE r.id = $1 AND r.requested_by_user_id = $2`,
      [id, requesterId],
    );
    if (!result.rows[0]) throw new NotFoundException('Deletion request not found.');
    return result.rows[0];
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
             RETURNING organization_id, role`,
            [userId],
          );
          if (!current.rows[0]) return false;
          const organizationId = current.rows[0].organization_id as string | null;
          const successor = await this.personalDeletionSuccessor(client, userId, organizationId, current.rows[0].role);
          if (successor) {
            await client.query(
              'UPDATE workflows SET created_by_id = $1, updated_at = NOW() WHERE organization_id = $2 AND created_by_id = $3',
              [successor, organizationId, userId],
            );
          }
          await client.query('DELETE FROM oauth_accounts WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM briefing_workflow_requests WHERE requested_by_id = $1', [userId]);
          await client.query('DELETE FROM briefing_feedback WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM briefing_preferences WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM team_members WHERE user_id = $1', [userId]);
          await client.query('DELETE FROM ai_conversations WHERE user_id = $1', [userId]);
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
                 password_hash = NULL, mfa_secret = NULL, mfa_enabled = FALSE,
                 phone = NULL, preferences = '{}'::jsonb, is_active = FALSE,
                 role = 'member',
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
        const reason = error instanceof ConflictException ? error.message : 'The account purge failed. Contact a workspace administrator before retrying.';
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
          await client.query(
            `INSERT INTO document_storage_cleanup_outbox (organization_id, document_id, meeting_id, storage_key)
             SELECT organization_id, id, NULL::uuid, storage_key FROM documents
              WHERE organization_id = $1 AND storage_key IS NOT NULL
             UNION ALL
             SELECT organization_id, NULL::uuid, id, audio_key FROM meetings
              WHERE organization_id = $1 AND audio_key IS NOT NULL
             ON CONFLICT (storage_key) DO NOTHING`,
            [request.organization_id],
          );
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
        const reason = 'The organization purge failed. An operator can inspect the server logs and retry.';
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
      `WITH cleared_legacy AS (
         UPDATE meetings meeting SET transcript = NULL
         FROM organization_retention_policies policy
         WHERE policy.organization_id = meeting.organization_id
           AND policy.resource_type = 'meeting_transcripts'
           AND meeting.transcript IS NOT NULL
           AND COALESCE(meeting.completed_at, meeting.created_at) < NOW() - policy.retention_days * INTERVAL '1 day'
       )
       DELETE FROM meeting_transcripts transcript
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
