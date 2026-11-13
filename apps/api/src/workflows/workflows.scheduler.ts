import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { WorkflowsService } from './workflows.service';

type DataRecord = Record<string, unknown>;

@Injectable()
export class WorkflowsScheduler {
  private readonly logger = new Logger(WorkflowsScheduler.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly workflows: WorkflowsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async scanDecisionDeadlines(): Promise<void> {
    try {
      const due = await this.db.query(
        `SELECT decision.id, decision.organization_id, decision.title,
                decision.decision_type AS "decisionType", decision.priority, decision.status,
                decision.owner_id AS "ownerId", decision.created_by_id AS "createdById",
                decision.team_id AS "teamId", decision.due_date AS "dueDate",
                decision.approval_due_at AS "approvalDueAt"
           FROM knowledge_decisions decision
          WHERE decision.status IN ('draft', 'proposed', 'approved', 'implemented')
            AND decision.due_date IS NOT NULL
            AND decision.due_date <= NOW() + INTERVAL '24 hours'
          ORDER BY decision.due_date ASC LIMIT 500`,
      );
      for (const row of due.rows as DataRecord[]) {
        const deadline = new Date(String(row.dueDate));
        const overdue = deadline.getTime() < Date.now();
        const eventType = overdue ? 'decision.deadline_overdue' : 'decision.deadline_approaching';
        const eventKey = `${eventType}:${String(row.id)}:${deadline.toISOString()}`;
        await this.workflows.dispatchEvent(String(row.organization_id), eventType, { decision: row, scheduled: true }, eventKey, null);
      }

      const approvals = await this.db.query(
        `SELECT decision.id, decision.organization_id, decision.title,
                decision.decision_type AS "decisionType", decision.priority, decision.status,
                decision.owner_id AS "ownerId", decision.created_by_id AS "createdById",
                decision.team_id AS "teamId", decision.approval_due_at AS "approvalDueAt"
           FROM knowledge_decisions decision
          WHERE decision.status = 'proposed'
            AND decision.approval_due_at IS NOT NULL
            AND decision.approval_due_at <= NOW() + INTERVAL '24 hours'
          ORDER BY decision.approval_due_at ASC LIMIT 500`,
      );
      for (const row of approvals.rows as DataRecord[]) {
        const deadline = new Date(String(row.approvalDueAt));
        const overdue = deadline.getTime() < Date.now();
        const eventType = overdue ? 'decision.approval_overdue' : 'decision.approval_due_soon';
        const eventKey = `${eventType}:${String(row.id)}:${deadline.toISOString()}`;
        await this.workflows.dispatchEvent(String(row.organization_id), eventType, { decision: row, scheduled: true }, eventKey, null);
      }
    } catch (error) {
      this.logger.error('Decision deadline automation scan failed.', error instanceof Error ? error.stack : undefined);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scanOverdueTasks(): Promise<void> {
    try {
      const overdue = await this.db.query(
        `SELECT t.id, t.organization_id, t.title, t.status, t.priority,
                t.assignee_id AS "assigneeId", t.created_by_id AS "createdById",
                t.team_id AS "teamId", t.due_date AS "dueDate"
           FROM tasks t
          WHERE t.status IN ('todo', 'in_progress', 'review')
            AND t.due_date IS NOT NULL
            AND t.due_date < NOW()
            AND EXISTS (
              SELECT 1 FROM workflows workflow
               WHERE workflow.organization_id = t.organization_id
                 AND workflow.status = 'active'
                 AND workflow.trigger_type = 'task.overdue'
            )
          ORDER BY t.due_date ASC, t.organization_id ASC, t.id ASC`,
      );

      for (const row of overdue.rows as DataRecord[]) {
        const dueDate = new Date(String(row.dueDate));
        if (!Number.isFinite(dueDate.getTime())) {
          this.logger.warn(`Skipping overdue task with invalid due date: ${String(row.id)}`);
          continue;
        }

        const taskId = String(row.id);
        const eventKey = `task.overdue:${taskId}:${dueDate.toISOString()}`;
        const payload: DataRecord = {
          taskId,
          taskTitle: String(row.title ?? ''),
          organizationId: String(row.organization_id),
          status: String(row.status),
          priority: String(row.priority ?? 'medium'),
          assigneeId: row.assigneeId ?? null,
          createdById: row.createdById ?? null,
          teamId: row.teamId ?? null,
          dueDate: dueDate.toISOString(),
          eventKey,
          scheduled: true,
          scheduledAt: new Date().toISOString(),
          actorId: null,
        };

        try {
          await this.eventEmitter.emitAsync('task.overdue', payload);
        } catch (error) {
          this.logger.error(
            `Overdue workflow dispatch failed for task ${taskId}.`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Overdue task automation scan failed.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
  @Cron(CronExpression.EVERY_MINUTE)
  async recoverWorkflowQueueEnqueues(): Promise<void> {
    try {
      const result = await this.workflows.recoverQueueEnqueueFailures(100);
      if (result.failed > 0) {
        this.logger.warn(`Workflow queue recovery: ${result.recovered} recovered, ${result.failed} still failing.`);
      }
    } catch (error) {
      this.logger.error(
        'Workflow queue recovery scan failed.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
  @Cron('0 9 * * 1')
  async dispatchWeeklyWorkflows(): Promise<void> {
    try {
      const organizations = await this.db.query(
        `SELECT DISTINCT organization_id FROM workflows WHERE status = 'active' AND trigger_type = 'schedule.weekly'`,
      );
      const dateKey = new Date().toISOString().slice(0, 10);
      for (const row of organizations.rows) {
        await this.workflows.dispatchEvent(String(row.organization_id), 'schedule.weekly', {
          scheduledAt: new Date().toISOString(), schedule: 'weekly',
        }, `schedule.weekly:${dateKey}`, null);
      }
    } catch (error) {
      this.logger.error('Weekly workflow dispatch failed.', error instanceof Error ? error.stack : undefined);
    }
  }
}