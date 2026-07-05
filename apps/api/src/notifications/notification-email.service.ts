import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';
import { NotificationsService } from './notifications.service';

export interface TaskAssignedEvent {
  taskId: string;
  taskTitle: string;
  assigneeId: string;
  assignerName: string;
  organizationId: string;
  priority: string;
  dueDate?: string;
}

export interface MeetingCompletedEvent {
  meetingId: string;
  meetingTitle: string;
  userId: string;
  organizationId: string;
  summary: string;
  actionItemCount: number;
}

export interface DocumentIndexedEvent {
  documentId: string;
  documentName: string;
  uploadedById: string;
  organizationId: string;
  chunkCount: number;
}

export interface DocumentFailedEvent {
  documentId: string;
  documentName: string;
  uploadedById: string;
  organizationId: string;
  errorMessage: string;
}

export interface GoalAchievedEvent {
  goalId: string;
  goalTitle: string;
  ownerId: string;
  organizationId: string;
}

@Injectable()
export class NotificationEmailService {
  private readonly logger = new Logger(NotificationEmailService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Task assigned ─────────────────────────────────────────

  @OnEvent('task.assigned', { async: true })
  async handleTaskAssigned(payload: TaskAssignedEvent) {
    try {
      const assignee = await this.db.findOne<{ email: string; name: string }>(
        'users',
        { id: payload.assigneeId, is_active: true },
      );
      if (!assignee) return;

      await Promise.all([
        this.emailService.sendTaskAssigned(
          assignee.email,
          assignee.name,
          payload.taskTitle,
          payload.taskId,
          payload.assignerName,
          payload.priority,
          payload.dueDate,
        ),
        this.notificationsService.create({
          userId: payload.assigneeId,
          organizationId: payload.organizationId,
          type: 'task_assigned',
          title: `New task: ${payload.taskTitle}`,
          message: `Assigned by ${payload.assignerName} · Priority: ${payload.priority}`,
          data: { taskId: payload.taskId, priority: payload.priority },
        }),
      ]);
    } catch (err) {
      this.logger.error('handleTaskAssigned failed', err);
    }
  }

  // ── Meeting completed ─────────────────────────────────────

  @OnEvent('meeting.completed', { async: true })
  async handleMeetingCompleted(payload: MeetingCompletedEvent) {
    try {
      const user = await this.db.findOne<{ email: string; name: string }>(
        'users',
        { id: payload.userId, is_active: true },
      );
      if (!user) return;

      await Promise.all([
        this.emailService.sendMeetingReady(
          user.email,
          user.name,
          payload.meetingTitle,
          payload.meetingId,
          payload.summary,
          payload.actionItemCount,
        ),
        this.notificationsService.create({
          userId: payload.userId,
          organizationId: payload.organizationId,
          type: 'meeting_processed',
          title: `Meeting ready: ${payload.meetingTitle}`,
          message: `${payload.actionItemCount} action item${payload.actionItemCount !== 1 ? 's' : ''} extracted`,
          data: { meetingId: payload.meetingId },
        }),
      ]);
    } catch (err) {
      this.logger.error('handleMeetingCompleted failed', err);
    }
  }

  // ── Document indexed ──────────────────────────────────────

  @OnEvent('document.indexed', { async: true })
  async handleDocumentIndexed(payload: DocumentIndexedEvent) {
    try {
      const user = await this.db.findOne<{ email: string; name: string }>(
        'users',
        { id: payload.uploadedById, is_active: true },
      );
      if (!user) return;

      await Promise.all([
        this.emailService.sendDocumentIndexed(
          user.email,
          user.name,
          payload.documentName,
          payload.documentId,
          payload.chunkCount,
        ),
        this.notificationsService.create({
          userId: payload.uploadedById,
          organizationId: payload.organizationId,
          type: 'document_indexed',
          title: `"${payload.documentName}" is ready`,
          message: `${payload.chunkCount} knowledge chunks indexed — AI search enabled`,
          data: { documentId: payload.documentId, chunkCount: payload.chunkCount },
        }),
      ]);
    } catch (err) {
      this.logger.error('handleDocumentIndexed failed', err);
    }
  }

  // ── Document failed ───────────────────────────────────────

  @OnEvent('document.failed', { async: true })
  async handleDocumentFailed(payload: DocumentFailedEvent) {
    try {
      const user = await this.db.findOne<{ email: string; name: string }>(
        'users',
        { id: payload.uploadedById, is_active: true },
      );
      if (!user) return;

      await Promise.all([
        this.emailService.sendDocumentFailed(
          user.email,
          user.name,
          payload.documentName,
          payload.errorMessage,
        ),
        this.notificationsService.create({
          userId: payload.uploadedById,
          organizationId: payload.organizationId,
          type: 'document_failed',
          title: `Processing failed: "${payload.documentName}"`,
          message: 'Please re-upload the file. Contact support if the issue persists.',
          data: { documentId: payload.documentId, error: payload.errorMessage },
        }),
      ]);
    } catch (err) {
      this.logger.error('handleDocumentFailed failed', err);
    }
  }

  // ── Goal achieved ─────────────────────────────────────────

  @OnEvent('goal.achieved', { async: true })
  async handleGoalAchieved(payload: GoalAchievedEvent) {
    try {
      const user = await this.db.findOne<{ email: string; name: string }>(
        'users',
        { id: payload.ownerId, is_active: true },
      );
      if (!user) return;

      await Promise.all([
        this.emailService.sendGoalAchieved(user.email, user.name, payload.goalTitle),
        this.notificationsService.create({
          userId: payload.ownerId,
          organizationId: payload.organizationId,
          type: 'goal_achieved',
          title: `🎉 Goal achieved: ${payload.goalTitle}`,
          message: 'You hit your target. Congratulations!',
          data: { goalId: payload.goalId },
        }),
      ]);
    } catch (err) {
      this.logger.error('handleGoalAchieved failed', err);
    }
  }

  // ── Daily overdue task reminder — 9 am UTC ────────────────

  @Cron('0 9 * * *')
  async sendOverdueTaskReminders() {
    this.logger.log('Running overdue task reminder cron...');
    try {
      const overdueByUser = await this.db.query<{
        user_id: string; email: string; name: string;
        organization_id: string; task_id: string;
        task_title: string; due_date: string; priority: string;
      }>(
        `SELECT t.assignee_id as user_id, u.email, u.name,
                t.organization_id, t.id as task_id, t.title as task_title,
                t.due_date, t.priority
         FROM tasks t
         JOIN users u ON u.id = t.assignee_id
         WHERE t.due_date < NOW()
           AND t.status NOT IN ('done','cancelled')
           AND u.is_active = TRUE
         ORDER BY u.id, t.due_date ASC`,
      );

      const byUser = new Map<string, typeof overdueByUser.rows>();
      for (const row of overdueByUser.rows) {
        const list = byUser.get(row.user_id) ?? [];
        list.push(row);
        byUser.set(row.user_id, list);
      }

      for (const [, tasks] of byUser) {
        const first = tasks[0];
        await this.emailService.sendOverdueTasksSummary(
          first.email,
          first.name,
          tasks.map((t) => ({
            id: t.task_id,
            title: t.task_title,
            dueDate: t.due_date,
            priority: t.priority,
          })),
        ).catch((err) =>
          this.logger.error(`Overdue reminder failed for ${first.email}`, err),
        );
      }
    } catch (err) {
      this.logger.error('Overdue task reminder cron failed', err);
    }
  }

  // ── Weekly digest — Monday 8 am UTC ──────────────────────

  @Cron('0 8 * * MON')
  async sendWeeklyDigests() {
    this.logger.log('Running weekly digest cron...');
    try {
      const orgs = await this.db.query<{ id: string; name: string }>(
        `SELECT DISTINCT o.id, o.name FROM organizations o
         JOIN users u ON u.organization_id = o.id
         WHERE u.is_active = TRUE AND u.role IN ('owner','admin')`,
      );

      for (const org of orgs.rows) {
        const owners = await this.db.query<{ id: string; email: string; name: string }>(
          `SELECT id, email, name FROM users
           WHERE organization_id = $1 AND is_active = TRUE
             AND role IN ('owner','admin')`,
          [org.id],
        );

        const [tasks, docs, meetings, goals] = await Promise.all([
          this.db.query<Record<string, string>>(
            `SELECT
               COUNT(*) FILTER (WHERE status = 'done' AND updated_at > NOW() - INTERVAL '7 days') as completed_this_week,
               COUNT(*) FILTER (WHERE status != 'done' AND status != 'cancelled') as open,
               COUNT(*) FILTER (WHERE priority = 'urgent' AND status != 'done') as urgent_open,
               COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'done') as overdue
             FROM tasks WHERE organization_id = $1`,
            [org.id],
          ),
          this.db.query<Record<string, string>>(
            `SELECT
               COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as uploaded_this_week,
               COUNT(*) FILTER (WHERE status = 'indexed') as total_indexed
             FROM documents WHERE organization_id = $1`,
            [org.id],
          ),
          this.db.query<Record<string, string>>(
            `SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as this_week,
                    COUNT(*) FILTER (WHERE status = 'completed' AND created_at > NOW() - INTERVAL '7 days') as completed
             FROM meetings WHERE organization_id = $1`,
            [org.id],
          ),
          this.db.query<Record<string, string>>(
            `SELECT COUNT(*) FILTER (WHERE status = 'active') as active,
                    COUNT(*) FILTER (WHERE status = 'completed' AND updated_at > NOW() - INTERVAL '7 days') as achieved_this_week
             FROM goals WHERE organization_id = $1`,
            [org.id],
          ),
        ]);

        const stats = {
          tasksCompletedThisWeek: parseInt(tasks.rows[0]?.completed_this_week ?? '0', 10),
          openTasks:              parseInt(tasks.rows[0]?.open ?? '0', 10),
          urgentOpenTasks:        parseInt(tasks.rows[0]?.urgent_open ?? '0', 10),
          overdueTasks:           parseInt(tasks.rows[0]?.overdue ?? '0', 10),
          docsUploadedThisWeek:   parseInt(docs.rows[0]?.uploaded_this_week ?? '0', 10),
          totalDocsIndexed:       parseInt(docs.rows[0]?.total_indexed ?? '0', 10),
          meetingsThisWeek:       parseInt(meetings.rows[0]?.this_week ?? '0', 10),
          meetingsCompleted:      parseInt(meetings.rows[0]?.completed ?? '0', 10),
          activeGoals:            parseInt(goals.rows[0]?.active ?? '0', 10),
          goalsAchievedThisWeek:  parseInt(goals.rows[0]?.achieved_this_week ?? '0', 10),
        };

        for (const owner of owners.rows) {
          await this.emailService.sendWeeklyDigest(
            owner.email, owner.name, org.name, stats,
          ).catch((err) =>
            this.logger.error(`Weekly digest failed for ${owner.email}`, err),
          );
        }
      }
    } catch (err) {
      this.logger.error('Weekly digest cron failed', err);
    }
  }
}
