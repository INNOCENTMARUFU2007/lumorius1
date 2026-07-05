import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class WorkflowsService {
  constructor(
    private readonly db: DatabaseService,
    @InjectQueue('workflows') private readonly workflowsQueue: Queue,
  ) {}

  async create(organizationId: string, userId: string, dto: {
    name: string;
    description?: string;
    triggerType: string;
    triggerConfig: Record<string, unknown>;
    steps: Record<string, unknown>[];
  }) {
    const id = uuidv4();
    await this.db.query(
      `INSERT INTO workflow_definitions (id, name, description, trigger_type, trigger_config, steps, organization_id, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, dto.name, dto.description ?? null, dto.triggerType,
       JSON.stringify(dto.triggerConfig), JSON.stringify(dto.steps),
       organizationId, userId],
    );
    return this.findById(id, organizationId);
  }

  async findAll(organizationId: string) {
    const res = await this.db.query(
      `SELECT wd.*, u.name as created_by_name,
              COUNT(wr.id) as run_count,
              COUNT(wr.id) FILTER (WHERE wr.status = 'completed') as successful_runs
       FROM workflow_definitions wd
       LEFT JOIN users u ON wd.created_by_id = u.id
       LEFT JOIN workflow_runs wr ON wr.workflow_id = wd.id
       WHERE wd.organization_id = $1
       GROUP BY wd.id, u.name
       ORDER BY wd.created_at DESC`,
      [organizationId],
    );
    return res.rows;
  }

  async findById(id: string, organizationId: string) {
    const res = await this.db.query(
      'SELECT * FROM workflow_definitions WHERE id = $1 AND organization_id = $2',
      [id, organizationId],
    );
    if (!res.rows[0]) throw new NotFoundException('Workflow not found');
    return res.rows[0];
  }

  async toggle(id: string, organizationId: string) {
    const wf = await this.findById(id, organizationId);
    const isActive = !(wf as Record<string, unknown>).is_active;
    await this.db.query(
      'UPDATE workflow_definitions SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [isActive, id],
    );
    return { id, isActive };
  }

  async trigger(id: string, organizationId: string, triggerData: Record<string, unknown>) {
    const wf = await this.findById(id, organizationId);
    if (!(wf as Record<string, unknown>).is_active) {
      throw new NotFoundException('Workflow is not active');
    }

    const runId = uuidv4();
    await this.db.query(
      `INSERT INTO workflow_runs (id, workflow_id, status, trigger_data) VALUES ($1,$2,'running',$3)`,
      [runId, id, JSON.stringify(triggerData)],
    );

    await this.workflowsQueue.add('execute', {
      runId, workflowId: id, organizationId, triggerData,
    });

    return { runId, status: 'running' };
  }

  async getRuns(workflowId: string, organizationId: string) {
    await this.findById(workflowId, organizationId);
    const res = await this.db.query(
      `SELECT id, status, trigger_data, result, error_message, started_at, completed_at
       FROM workflow_runs WHERE workflow_id = $1 ORDER BY started_at DESC LIMIT 50`,
      [workflowId],
    );
    return res.rows;
  }
}
