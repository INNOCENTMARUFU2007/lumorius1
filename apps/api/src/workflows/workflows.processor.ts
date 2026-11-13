import { BadRequestException, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';

type DataRecord = Record<string, unknown>;
type WorkflowJob = { runId: string; workflowId: string; organizationId: string };

@Processor('workflows')
export class WorkflowsProcessor {
  private readonly logger = new Logger(WorkflowsProcessor.name);
  constructor(private readonly db: DatabaseService) {}

  private record(value: unknown): DataRecord {
    if (typeof value === 'string') {
      try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as DataRecord : {}; }
      catch { return {}; }
    }
    return value && typeof value === 'object' && !Array.isArray(value) ? value as DataRecord : {};
  }

  private list(value: unknown): DataRecord[] {
    if (typeof value === 'string') {
      try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as DataRecord[] : []; }
      catch { return []; }
    }
    return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as DataRecord[] : [];
  }

  private render(value: unknown, context: DataRecord): string {
    if (typeof value !== 'string') return '';
    return value.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, path: string) => {
      const resolved = path.split('.').reduce<unknown>((current, key) => {
        return current && typeof current === 'object' ? (current as DataRecord)[key] : undefined;
      }, context);
      return resolved === undefined || resolved === null || typeof resolved === 'object' ? '' : String(resolved);
    }).slice(0, 12000);
  }

  @Process({ name: 'execute', concurrency: 5 })
  async execute(job: Job<WorkflowJob>): Promise<void> {
    const { runId, workflowId, organizationId } = job.data;
    const loaded = await this.db.query(
      `SELECT run.id AS run_id, run.input_data, run.status AS run_status,
              workflow.id AS workflow_id, workflow.name, workflow.steps,
              workflow.status::text AS workflow_status, workflow.created_by_id
         FROM workflow_runs run
         INNER JOIN workflows workflow ON workflow.id = run.workflow_id AND workflow.organization_id = run.organization_id
        WHERE run.id = $1::uuid AND run.workflow_id = $2::uuid AND run.organization_id = $3::uuid`,
      [runId, workflowId, organizationId],
    );
    const run = loaded.rows[0] as DataRecord | undefined;
    if (!run) return;
    if (String(run.workflow_status) !== 'active') {
      await this.db.transaction(async client => {
        const cancelled = await client.query(
          `UPDATE workflow_runs SET status = 'cancelled', error_message = 'Workflow was paused before execution.', completed_at = NOW()
            WHERE id = $1::uuid AND organization_id = $2::uuid
            RETURNING id`,
          [runId, organizationId],
        );
        if (cancelled.rows[0]) {
          await client.query(
            `INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
             VALUES ($1::uuid, $2::uuid, 'workflow.run.cancelled', 'workflow_run', $3, $4::jsonb)`,
            [organizationId, run.created_by_id, runId, JSON.stringify({ workflowId })],
          );
        }
      });
      return;
    }

    const input = this.record(run.input_data);
    const payload = this.record(input.payload);
    const decision = this.record(input.decision ?? payload.decision ?? payload);
    const actorId = String(input.actorId ?? payload.actorId ?? '');
    const context: DataRecord = {
      decision,
      event: payload,
      actor: { id: actorId },
      workflow: { id: workflowId, name: String(run.name ?? '') },
    };
    const steps = this.list(run.steps);
    const results: DataRecord[] = [];

    await this.db.query(
      `UPDATE workflow_runs SET status = 'running', error_message = NULL, completed_at = NULL
        WHERE id = $1::uuid AND organization_id = $2::uuid`,
      [runId, organizationId],
    );

    try {
      if (steps.length > 20) throw new BadRequestException('Workflow execution is limited to 20 action steps.');
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index];
        const type = typeof step.type === 'string' ? step.type : '';
        const config = this.record(step.config);
        if (!['task.create', 'notification.create'].includes(type)) {
          throw new BadRequestException(`Workflow step ${index + 1} uses an unsupported action: ${type || 'missing type'}.`);
        }
        const stepId = uuidv4();
        const stepInput = { type, config };
        const stepStart = await this.db.query(
          `INSERT INTO workflow_step_runs (
             id, organization_id, workflow_id, workflow_run_id, step_index, step_type,
             status, attempt_count, input_data, started_at
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, 'running', 1, $7::jsonb, NOW())
           ON CONFLICT (workflow_run_id, step_index) DO UPDATE SET
             status = CASE WHEN workflow_step_runs.status = 'completed' THEN 'completed' ELSE 'running' END,
             attempt_count = CASE WHEN workflow_step_runs.status = 'completed' THEN workflow_step_runs.attempt_count ELSE workflow_step_runs.attempt_count + 1 END,
             error_message = NULL,
             completed_at = CASE WHEN workflow_step_runs.status = 'completed' THEN workflow_step_runs.completed_at ELSE NULL END,
             started_at = CASE WHEN workflow_step_runs.status = 'completed' THEN workflow_step_runs.started_at ELSE NOW() END
           RETURNING status, output_data`,
          [stepId, organizationId, workflowId, runId, index, type, JSON.stringify(stepInput)],
        );
        if (String(stepStart.rows[0]?.status) === 'completed') {
          results.push({ stepIndex: index, type, skipped: true, output: this.record(stepStart.rows[0]?.output_data) });
          continue;
        }

        try {
          const output = type === 'task.create'
            ? await this.createTask(organizationId, workflowId, runId, index, actorId, String(run.created_by_id), decision, config, context)
            : await this.createNotifications(organizationId, runId, index, actorId, decision, config, context);
          await this.db.query(
            `UPDATE workflow_step_runs SET status = 'completed', output_data = $1::jsonb,
                    error_message = NULL, completed_at = NOW()
              WHERE workflow_run_id = $2::uuid AND step_index = $3`,
            [JSON.stringify(output), runId, index],
          );
          results.push({ stepIndex: index, type, ...output });
        } catch (error) {
          await this.db.query(
            `UPDATE workflow_step_runs SET status = 'failed', error_message = $1, completed_at = NOW()
              WHERE workflow_run_id = $2::uuid AND step_index = $3`,
            [error instanceof Error ? error.message : 'Workflow action failed.', runId, index],
          );
          throw error;
        }
      }

      await this.db.transaction(async client => {
        await client.query(
          `UPDATE workflow_runs SET status = 'completed', output_data = $1::jsonb,
                  error_message = NULL, completed_at = NOW()
            WHERE id = $2::uuid AND organization_id = $3::uuid`,
          [JSON.stringify({ steps: results }), runId, organizationId],
        );
        await client.query(
          `UPDATE workflows SET run_count = run_count + 1, last_run_at = NOW(), updated_at = NOW()
            WHERE id = $1::uuid AND organization_id = $2::uuid`,
          [workflowId, organizationId],
        );
        await client.query(
          `INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
           VALUES ($1::uuid, $2::uuid, 'workflow.run.completed', 'workflow_run', $3, $4::jsonb)`,
          [organizationId, run.created_by_id, runId, JSON.stringify({ workflowId, stepCount: results.length })],
        );
      });
    } catch (error) {
      const attempts = Number(job.opts.attempts ?? 1);
      const terminal = Number(job.attemptsMade ?? 0) + 1 >= attempts;
      if (terminal) {
        await this.db.transaction(async client => {
          await client.query(
            `UPDATE workflow_runs SET status = 'failed', error_message = $1, completed_at = NOW()
              WHERE id = $2::uuid AND organization_id = $3::uuid`,
            [
              error instanceof Error ? error.message.slice(0, 4000) : 'Workflow execution failed.',
              runId,
              organizationId,
            ],
          );
          await client.query(
            `UPDATE workflows SET run_count = run_count + 1, last_run_at = NOW(), updated_at = NOW()
              WHERE id = $1::uuid AND organization_id = $2::uuid`,
            [workflowId, organizationId],
          );
          await client.query(
            `INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
             VALUES ($1::uuid, $2::uuid, 'workflow.run.failed', 'workflow_run', $3, $4::jsonb)`,
            [organizationId, run.created_by_id, runId, JSON.stringify({ workflowId })],
          );
        });
      } else {
        await this.db.query(
          `UPDATE workflow_runs SET status = 'running', error_message = $1, completed_at = NULL
            WHERE id = $2::uuid AND organization_id = $3::uuid`,
          [
            error instanceof Error ? error.message.slice(0, 4000) : 'Workflow execution failed.',
            runId,
            organizationId,
          ],
        );
      }
      this.logger.error(`Workflow ${workflowId} run ${runId} failed${terminal ? ' permanently' : '; retry scheduled'}.`);
      throw error;
    }
  }

  private async createTask(
    organizationId: string,
    workflowId: string,
    runId: string,
    stepIndex: number,
    actorId: string,
    workflowCreatorId: string,
    decision: DataRecord,
    config: DataRecord,
    context: DataRecord,
  ): Promise<DataRecord> {
    const title = this.render(config.title, context).trim().slice(0, 240);
    if (!title) throw new BadRequestException('Task action rendered an empty title.');
    const description = this.render(config.description, context).slice(0, 12000) || null;
    const priorityValue = String(config.priority ?? decision.priority ?? 'medium').toLowerCase();
    const priority = priorityValue === 'critical' ? 'urgent' : priorityValue;
    if (!['low', 'medium', 'high', 'urgent'].includes(priority)) throw new BadRequestException('Task action priority is invalid.');
    const dueInHours = config.dueInHours === undefined ? null : Number(config.dueInHours);
    if (dueInHours !== null && (!Number.isFinite(dueInHours) || dueInHours < 1 || dueInHours > 8760)) {
      throw new BadRequestException('Task action dueInHours must be between 1 and 8760.');
    }
    const dueDate = dueInHours === null ? null : new Date(Date.now() + dueInHours * 3600000).toISOString();
    const assigneeSource = String(config.assignee ?? 'owner');
    if (!['owner', 'creator', 'actor', 'unassigned'].includes(assigneeSource)) {
      throw new BadRequestException('Task action assignee must be owner, creator, actor or unassigned.');
    }
    const candidate = assigneeSource === 'owner' ? (decision.owner_id ?? decision.ownerId)
      : assigneeSource === 'creator' ? (decision.created_by_id ?? decision.createdById)
        : assigneeSource === 'actor' ? actorId : null;
    let assigneeId: string | null = null;
    if (typeof candidate === 'string' && candidate) {
      const user = await this.db.query(
        `SELECT id FROM users WHERE id = $1::uuid AND organization_id = $2::uuid AND is_active = TRUE LIMIT 1`,
        [candidate, organizationId],
      );
      assigneeId = user.rows[0]?.id ? String(user.rows[0].id) : null;
    }
    let createdById = workflowCreatorId;
    if (actorId) {
      const actor = await this.db.query(
        `SELECT id FROM users WHERE id = $1::uuid AND organization_id = $2::uuid AND is_active = TRUE LIMIT 1`,
        [actorId, organizationId],
      );
      if (actor.rows[0]) createdById = String(actor.rows[0].id);
    }
    const decisionId = typeof decision.id === 'string' ? decision.id : null;
    const teamCandidate = decision.team_id ?? decision.teamId;
    const teamId = typeof teamCandidate === 'string' ? teamCandidate : null;
    const executionKey = `${runId}:${stepIndex}`;
    const taskId = await this.db.transaction(async client => {
      const existing = await client.query(
        `SELECT id FROM tasks WHERE organization_id = $1::uuid AND metadata->>'workflowExecutionKey' = $2 LIMIT 1`,
        [organizationId, executionKey],
      );
      if (existing.rows[0]) return String(existing.rows[0].id);
      const id = uuidv4();
      await client.query(
        `INSERT INTO tasks (id, organization_id, created_by_id, assignee_id, title, description, priority, due_date, team_id, tags, metadata)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::task_priority, $8::timestamptz, $9::uuid, $10::text[], $11::jsonb)`,
        [id, organizationId, createdById, assigneeId, title, description, priority, dueDate, teamId, [], JSON.stringify({
          source: 'workflow_automation', workflowId, workflowRunId: runId, workflowStepIndex: stepIndex,
          workflowExecutionKey: executionKey, decisionId,
        })],
      );
      if (decisionId) {
        await client.query(
          `INSERT INTO knowledge_decision_links (
             organization_id, decision_id, link_type, linked_id, link_label, created_by_id, metadata
           ) SELECT $1::uuid, $2::uuid, 'task', $3::uuid, $4, $5::uuid, $6::jsonb
             WHERE EXISTS (SELECT 1 FROM knowledge_decisions WHERE id = $2::uuid AND organization_id = $1::uuid)
               AND NOT EXISTS (
                 SELECT 1 FROM knowledge_decision_links
                  WHERE organization_id = $1::uuid AND decision_id = $2::uuid
                    AND link_type = 'task' AND linked_id = $3::uuid
               )`,
          [organizationId, decisionId, id, title, createdById, JSON.stringify({ source: 'workflow_automation', workflowId, workflowRunId: runId })],
        );
      }
      return id;
    });
    return { taskId, title, assigneeId, dueDate, linkedDecisionId: decisionId };
  }

  private async createNotifications(
    organizationId: string,
    runId: string,
    stepIndex: number,
    actorId: string,
    decision: DataRecord,
    config: DataRecord,
    context: DataRecord,
  ): Promise<DataRecord> {
    const title = this.render(config.title, context).trim().slice(0, 240);
    if (!title) throw new BadRequestException('Notification action rendered an empty title.');
    const message = this.render(config.message, context).slice(0, 4000) || null;
    const recipient = String(config.recipient ?? 'owner');
    let recipients: string[] = [];
    if (recipient === 'owner' && typeof (decision.owner_id ?? decision.ownerId) === 'string') recipients = [String(decision.owner_id ?? decision.ownerId)];
    else if (recipient === 'creator' && typeof (decision.created_by_id ?? decision.createdById) === 'string') recipients = [String(decision.created_by_id ?? decision.createdById)];
    else if (recipient === 'actor' && actorId) recipients = [actorId];
    else if (recipient === 'approvers') {
      const users = await this.db.query(
        `SELECT id FROM users WHERE organization_id = $1::uuid AND is_active = TRUE AND role::text = ANY($2::text[])`,
        [organizationId, ['owner', 'admin', 'manager']],
      );
      recipients = users.rows.map(row => String(row.id));
    } else if (!['owner', 'creator', 'actor', 'approvers'].includes(recipient)) {
      throw new BadRequestException('Notification recipient must be owner, creator, actor or approvers.');
    }
    recipients = [...new Set(recipients)];
    let createdCount = 0;
    for (const userId of recipients) {
      const eventKey = `workflow:${runId}:${stepIndex}:${userId}`;
      const inserted = await this.db.query(
        `INSERT INTO notifications (id, user_id, organization_id, type, title, message, action_url, data)
         SELECT gen_random_uuid(), usr.id, usr.organization_id, 'workflow', $3, $4, $5, $6::jsonb
           FROM users usr
          WHERE usr.id = $1::uuid AND usr.organization_id = $2::uuid AND usr.is_active = TRUE
         ON CONFLICT (user_id, (data ->> 'eventKey')) WHERE (data ? 'eventKey') DO NOTHING
         RETURNING id`,
        [userId, organizationId, title, message, typeof config.actionUrl === 'string' ? config.actionUrl : null,
          JSON.stringify({ eventKey, workflowRunId: runId, workflowStepIndex: stepIndex, decisionId: decision.id ?? null })],
      );
      createdCount += inserted.rows.length;
    }
    return { recipient, recipientCount: recipients.length, createdCount };
  }
}