import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';

type WorkflowStatus = 'active' | 'paused' | 'draft' | 'archived';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly db: DatabaseService,
    @InjectQueue('workflows')
    private readonly workflowsQueue: Queue,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    dto: {
      name: string;
      description?: string;
      triggerType: string;
      triggerConfig: Record<string, unknown>;
      steps: Record<string, unknown>[];
    },
  ) {
    const name = dto.name?.trim();

    if (!name) {
      throw new BadRequestException('Workflow name is required.');
    }

    if (name.length > 255) {
      throw new BadRequestException(
        'Workflow name must be 255 characters or fewer.',
      );
    }

    const id = uuidv4();

    await this.db.query(
      `INSERT INTO workflows (
         id,
         name,
         description,
         trigger_type,
         trigger_config,
         steps,
         organization_id,
         created_by_id
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
      [
        id,
        name,
        dto.description?.trim() || null,
        dto.triggerType || 'manual',
        JSON.stringify(dto.triggerConfig ?? {}),
        JSON.stringify(dto.steps ?? []),
        organizationId,
        userId,
      ],
    );

    return this.findById(id, organizationId);
  }

  async findAll(organizationId: string) {
    const result = await this.db.query(
      `SELECT
         w.*,
         (w.status = 'active') AS is_active,
         u.name AS created_by_name,
         COALESCE(r.run_count, w.run_count, 0)::int AS run_count,
         COALESCE(r.successful_runs, 0)::int AS successful_runs
       FROM workflows w
       LEFT JOIN users u
         ON u.id = w.created_by_id
       LEFT JOIN (
         SELECT
           workflow_id,
           organization_id,
           COUNT(*)::int AS run_count,
           COUNT(*) FILTER (
             WHERE status = 'completed'
           )::int AS successful_runs
         FROM workflow_runs
         GROUP BY workflow_id, organization_id
       ) r
         ON r.workflow_id = w.id
        AND r.organization_id = w.organization_id
       WHERE w.organization_id = $1
       ORDER BY w.created_at DESC`,
      [organizationId],
    );

    return result.rows;
  }

  async findById(id: string, organizationId: string) {
    const result = await this.db.query(
      `SELECT
         w.*,
         (w.status = 'active') AS is_active
       FROM workflows w
       WHERE w.id = $1
         AND w.organization_id = $2`,
      [id, organizationId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Workflow not found.');
    }

    return result.rows[0];
  }

  /**
   * Active -> paused
   * Paused -> active
   * Draft -> active
   * Archived -> cannot be resumed through this toggle.
   */
  async toggle(id: string, organizationId: string) {
    const workflow = await this.findById(id, organizationId);
    const currentStatus = String(workflow.status) as WorkflowStatus;

    if (currentStatus === 'archived') {
      throw new BadRequestException(
        'Archived workflows cannot be resumed. Create a new workflow or add an explicit unarchive operation.',
      );
    }

    let nextStatus: WorkflowStatus;

    if (currentStatus === 'active') {
      nextStatus = 'paused';
    } else if (
      currentStatus === 'paused' ||
      currentStatus === 'draft'
    ) {
      nextStatus = 'active';
    } else {
      throw new BadRequestException(
        `Unsupported workflow status: ${currentStatus}`,
      );
    }

    const result = await this.db.query(
      `UPDATE workflows
       SET status = $1::workflow_status,
           updated_at = NOW()
       WHERE id = $2
         AND organization_id = $3
       RETURNING
         id,
         status,
         (status = 'active') AS is_active`,
      [nextStatus, id, organizationId],
    );

    if (!result.rows[0]) {
      throw new NotFoundException('Workflow not found.');
    }

    return result.rows[0];
  }

  async trigger(
    id: string,
    organizationId: string,
    triggerData: Record<string, unknown> = {},
  ) {
    const workflow = await this.findById(id, organizationId);
    const status = String(workflow.status);

    if (status !== 'active') {
      throw new BadRequestException(
        `This workflow cannot run because its status is "${status}". Activate it first.`,
      );
    }

    const runId = uuidv4();
    const inputData = JSON.stringify(triggerData ?? {});

    // Match the actual workflow_runs schema.
    await this.db.query(
      `INSERT INTO workflow_runs (
         id,
         workflow_id,
         organization_id,
         status,
         input_data
       )
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        runId,
        id,
        organizationId,
        'running',
        inputData,
      ],
    );

    try {
      await this.workflowsQueue.add('execute', {
        runId,
        workflowId: id,
        organizationId,
        triggerData: triggerData ?? {},
      });
    } catch (error) {
      // Record the enqueue failure instead of leaving a run marked running.
      await this.db.query(
        `UPDATE workflow_runs
         SET status = $1,
             error_message = $2,
             completed_at = NOW()
         WHERE id = $3
           AND organization_id = $4`,
        [
          'failed',
          error instanceof Error
            ? error.message
            : 'Failed to enqueue workflow execution.',
          runId,
          organizationId,
        ],
      );

      throw error;
    }

    return {
      runId,
      status: 'running',
    };
  }

  async getRuns(workflowId: string, organizationId: string) {
    await this.findById(workflowId, organizationId);

    const result = await this.db.query(
      `SELECT
         id,
         workflow_id,
         status,
         input_data,
         output_data,
         error_message,
         started_at,
         completed_at
       FROM workflow_runs
       WHERE workflow_id = $1
         AND organization_id = $2
       ORDER BY started_at DESC
       LIMIT 50`,
      [workflowId, organizationId],
    );

    return result.rows;
  }
}
