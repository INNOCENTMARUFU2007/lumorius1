import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';

type WorkflowStatus = 'active' | 'paused' | 'draft' | 'archived';
type DataRecord = Record<string, unknown>;

const SUPPORTED_TRIGGERS = new Set([
  'manual', 'document.indexed', 'document.deleted', 'document.indexing_failed',
  'meeting.completed', 'meeting.deleted', 'schedule.weekly',
  'task.created', 'task.updated', 'task.assigned', 'task.status_changed',
  'task.completed', 'task.deleted', 'task.overdue',
  'project.created', 'project.updated', 'financial.import_committed',
  'decision.created', 'decision.proposed', 'decision.approved', 'decision.rejected',
  'decision.implemented', 'decision.reviewed', 'decision.withdrawn',
  'decision.deadline_approaching', 'decision.deadline_overdue',
  'decision.approval_due_soon', 'decision.approval_overdue',
]);
const SUPPORTED_ACTIONS = new Set(['task.create', 'notification.create']);

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly db: DatabaseService,
    @InjectQueue('workflows') private readonly workflowsQueue: Queue,
  ) {}

  private isRecord(value: unknown): value is DataRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private validateSteps(steps: unknown): void {
    if (!Array.isArray(steps) || steps.length > 20) {
      throw new BadRequestException('Workflow steps must be an array containing no more than 20 actions.');
    }
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      if (!this.isRecord(step)) throw new BadRequestException(`Workflow step ${index + 1} must be an object.`);
      const type = typeof step.type === 'string' ? step.type : '';
      if (!SUPPORTED_ACTIONS.has(type)) {
        throw new BadRequestException(`Workflow step ${index + 1} uses an unsupported action. Supported actions: task.create, notification.create.`);
      }
      if (!this.isRecord(step.config)) throw new BadRequestException(`Workflow step ${index + 1} requires a config object.`);
      if (type === 'task.create') {
        if (typeof step.config.title !== 'string' || !step.config.title.trim()) {
          throw new BadRequestException(`Workflow task action ${index + 1} requires a title.`);
        }
      }
      if (type === 'notification.create') {
        if (typeof step.config.title !== 'string' || !step.config.title.trim()) {
          throw new BadRequestException(`Workflow notification action ${index + 1} requires a title.`);
        }
        const recipient = String(step.config.recipient ?? 'owner');
        if (!['owner', 'creator', 'actor', 'approvers'].includes(recipient)) {
          throw new BadRequestException(`Workflow notification action ${index + 1} has an unsupported recipient.`);
        }
      }
    }
  }

  async create(
    organizationId: string,
    userId: string,
    dto: { name: string; description?: string; triggerType: string; triggerConfig: DataRecord; steps: DataRecord[] },
  ) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Workflow name is required.');
    if (name.length > 255) throw new BadRequestException('Workflow name must be 255 characters or fewer.');
    const triggerType = String(dto.triggerType || 'manual');
    if (!SUPPORTED_TRIGGERS.has(triggerType)) throw new BadRequestException('Unsupported workflow trigger.');
    this.validateSteps(dto.steps ?? []);
    if (!this.isRecord(dto.triggerConfig ?? {})) throw new BadRequestException('Trigger configuration must be a JSON object.');

    const id = uuidv4();
    await this.db.query(
      `INSERT INTO workflows (id, name, description, trigger_type, trigger_config, steps, organization_id, created_by_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::uuid, $8::uuid)`,
      [id, name, dto.description?.trim() || null, triggerType, JSON.stringify(dto.triggerConfig ?? {}), JSON.stringify(dto.steps ?? []), organizationId, userId],
    );
    return this.findById(id, organizationId);
  }

  async findAll(organizationId: string) {
    const result = await this.db.query(
      `SELECT w.*, (w.status = 'active') AS is_active, u.name AS created_by_name,
              COALESCE(r.run_count, w.run_count, 0)::int AS run_count,
              COALESCE(r.successful_runs, 0)::int AS successful_runs
         FROM workflows w
         LEFT JOIN users u ON u.id = w.created_by_id
         LEFT JOIN (
           SELECT workflow_id, organization_id, COUNT(*)::int AS run_count,
                  COUNT(*) FILTER (WHERE status = 'completed')::int AS successful_runs
             FROM workflow_runs GROUP BY workflow_id, organization_id
         ) r ON r.workflow_id = w.id AND r.organization_id = w.organization_id
        WHERE w.organization_id = $1::uuid ORDER BY w.created_at DESC`,
      [organizationId],
    );
    return result.rows;
  }

  async findById(id: string, organizationId: string) {
    const result = await this.db.query(
      `SELECT w.*, (w.status = 'active') AS is_active
         FROM workflows w WHERE w.id = $1::uuid AND w.organization_id = $2::uuid`,
      [id, organizationId],
    );
    if (!result.rows[0]) throw new NotFoundException('Workflow not found.');
    return result.rows[0];
  }

  async toggle(id: string, organizationId: string) {
    const workflow = await this.findById(id, organizationId);
    const currentStatus = String(workflow.status) as WorkflowStatus;
    if (currentStatus === 'archived') throw new BadRequestException('Archived workflows cannot be resumed.');
    let nextStatus: WorkflowStatus;
    if (currentStatus === 'active') nextStatus = 'paused';
    else if (currentStatus === 'paused' || currentStatus === 'draft') nextStatus = 'active';
    else throw new BadRequestException(`Unsupported workflow status: ${currentStatus}`);
    const result = await this.db.query(
      `UPDATE workflows SET status = $1::workflow_status, updated_at = NOW()
        WHERE id = $2::uuid AND organization_id = $3::uuid
        RETURNING id, status, (status = 'active') AS is_active`,
      [nextStatus, id, organizationId],
    );
    if (!result.rows[0]) throw new NotFoundException('Workflow not found.');
    return result.rows[0];
  }

  private matchesTriggerConfig(configValue: unknown, eventData: DataRecord): boolean {
    const config = this.isRecord(configValue) ? configValue : {};
    const decision = this.isRecord(eventData.decision) ? eventData.decision : eventData;
    const read = (camel: string, snake: string) => decision[camel] ?? decision[snake];
    const decisionType = String(read('decisionType', 'decision_type') ?? '');
    const priority = String(decision.priority ?? '');
    const status = String(decision.status ?? '');
    const teamId = String(read('teamId', 'team_id') ?? '');
    const includes = (key: string, value: string) => {
      const allowed = config[key];
      return !Array.isArray(allowed) || allowed.length === 0 || allowed.includes(value);
    };
    if (!includes('decisionTypes', decisionType)) return false;
    if (!includes('priorities', priority)) return false;
    if (!includes('statuses', status)) return false;
    if (typeof config.teamId === 'string' && config.teamId && config.teamId !== teamId) return false;
    return true;
  }

  private async enqueueRun(
    workflow: DataRecord,
    organizationId: string,
    eventType: string,
    eventData: DataRecord,
    eventKey: string | null,
    triggeredById: string | null,
  ) {
    const runId = uuidv4();
    const inputData = {
      eventType,
      eventKey,
      actorId: triggeredById ?? eventData.actorId ?? null,
      payload: eventData,
      decision: this.isRecord(eventData.decision) ? eventData.decision : undefined,
    };
    const inserted = await this.db.query(
      `INSERT INTO workflow_runs (id, workflow_id, organization_id, triggered_by_id, status, input_data, trigger_event, event_key)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'running', $5::jsonb, $6, $7)
       ON CONFLICT (workflow_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [runId, workflow.id, organizationId, triggeredById, JSON.stringify(inputData), eventType, eventKey],
    );
    if (!inserted.rows[0]) return { queued: false, duplicate: true };
    try {
      await this.workflowsQueue.add('execute', { runId, workflowId: workflow.id, organizationId }, {
        jobId: runId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      });
    } catch (error) {
      await this.db.query(
        `UPDATE workflow_runs SET status = 'failed', error_message = $1, completed_at = NOW()
          WHERE id = $2::uuid AND organization_id = $3::uuid`,
        [`WORKFLOW_QUEUE_ENQUEUE_FAILED: ${error instanceof Error ? error.message.slice(0, 4000) : 'Failed to enqueue workflow execution.'}`, runId, organizationId],
      );
      throw error;
    }
    return { queued: true, duplicate: false, runId, status: 'running' };
  }

  /**
   * Re-enqueues workflow runs whose initial Bull queue handoff failed.
   * The same runId is reused as Bull's jobId, preserving execution idempotency.
   */
  async recoverQueueEnqueueFailures(limit = 100): Promise<{ scanned: number; recovered: number; failed: number }> {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 100;
    const pending = await this.db.query(
      `SELECT run.id, run.workflow_id, run.organization_id
         FROM workflow_runs run
         INNER JOIN workflows workflow
           ON workflow.id = run.workflow_id
          AND workflow.organization_id = run.organization_id
        WHERE run.status = 'failed'
          AND run.error_message LIKE 'WORKFLOW_QUEUE_ENQUEUE_FAILED:%'
          AND workflow.status = 'active'
        ORDER BY run.completed_at ASC NULLS FIRST, run.started_at ASC, run.id ASC
        LIMIT $1`,
      [safeLimit],
    );

    let recovered = 0;
    let failed = 0;
    for (const row of pending.rows as DataRecord[]) {
      const runId = String(row.id);
      const workflowId = String(row.workflow_id);
      const organizationId = String(row.organization_id);
      try {
        await this.workflowsQueue.add('execute', { runId, workflowId, organizationId }, {
          jobId: runId,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        });
        const updated = await this.db.query(
          `UPDATE workflow_runs
              SET status = 'running', error_message = NULL, completed_at = NULL
            WHERE id = $1::uuid
              AND workflow_id = $2::uuid
              AND organization_id = $3::uuid
              AND status = 'failed'
              AND error_message LIKE 'WORKFLOW_QUEUE_ENQUEUE_FAILED:%'
            RETURNING id`,
          [runId, workflowId, organizationId],
        );
        if (updated.rows[0]) recovered += 1;
      } catch (error) {
        await this.db.query(
          `UPDATE workflow_runs
              SET error_message = $1, completed_at = NOW()
            WHERE id = $2::uuid
              AND workflow_id = $3::uuid
              AND organization_id = $4::uuid
              AND status = 'failed'
              AND error_message LIKE 'WORKFLOW_QUEUE_ENQUEUE_FAILED:%'`,
          [
            `WORKFLOW_QUEUE_ENQUEUE_FAILED: ${error instanceof Error ? error.message.slice(0, 4000) : 'Queue retry failed.'}`,
            runId,
            workflowId,
            organizationId,
          ],
        );
        failed += 1;
      }
    }

    return { scanned: pending.rows.length, recovered, failed };
  }
  async trigger(id: string, organizationId: string, triggerData: DataRecord = {}, triggeredById?: string) {
    const workflow = await this.findById(id, organizationId);
    if (String(workflow.status) !== 'active') {
      throw new BadRequestException(`This workflow cannot run because its status is "${String(workflow.status)}". Activate it first.`);
    }
    const result = await this.enqueueRun(workflow, organizationId, 'manual', triggerData ?? {}, null, triggeredById ?? null);
    return { runId: result.runId, status: result.status };
  }

  async dispatchEvent(
    organizationId: string,
    eventType: string,
    eventData: DataRecord,
    eventKey: string,
    triggeredById?: string | null,
  ) {
    const result = await this.db.query(
      `SELECT id, trigger_type, trigger_config, status
         FROM workflows
        WHERE organization_id = $1::uuid AND trigger_type = $2 AND status = 'active'
        ORDER BY created_at ASC`,
      [organizationId, eventType],
    );
    const outcomes: Array<Record<string, unknown>> = [];
    for (const workflow of result.rows as DataRecord[]) {
      if (!this.matchesTriggerConfig(workflow.trigger_config, eventData)) continue;
      try {
        const outcome = await this.enqueueRun(workflow, organizationId, eventType, eventData, eventKey, triggeredById ?? null);
        outcomes.push({ workflowId: workflow.id, ...outcome });
      } catch (error) {
        outcomes.push({ workflowId: workflow.id, queued: false, error: error instanceof Error ? error.message : 'Queue failure' });
      }
    }
    return { eventType, matched: outcomes.length, outcomes };
  }

  async getRuns(workflowId: string, organizationId: string) {
    await this.findById(workflowId, organizationId);
    const result = await this.db.query(
      `SELECT run.id, run.workflow_id, run.status, run.trigger_event,
              run.input_data, run.output_data, run.error_message,
              run.started_at, run.completed_at,
              COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', step.id,
                    'step_index', step.step_index,
                    'step_type', step.step_type,
                    'status', step.status,
                    'attempt_count', step.attempt_count,
                    'input_data', step.input_data,
                    'output_data', step.output_data,
                    'error_message', step.error_message,
                    'started_at', step.started_at,
                    'completed_at', step.completed_at
                  ) ORDER BY step.step_index
                )
                  FROM workflow_step_runs step
                 WHERE step.workflow_run_id = run.id
                   AND step.organization_id = run.organization_id
              ), '[]'::jsonb) AS steps
         FROM workflow_runs run
        WHERE run.workflow_id = $1::uuid
          AND run.organization_id = $2::uuid
        ORDER BY run.started_at DESC
        LIMIT 50`,
      [workflowId, organizationId],
    );
    return result.rows;
  }
}