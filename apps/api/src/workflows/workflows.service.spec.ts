import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { WorkflowsService } from './workflows.service';

describe('WorkflowsService V4.11 decision automation', () => {
  let service: WorkflowsService;
  let db: { query: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(() => {
    db = { query: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    service = new WorkflowsService(db as unknown as DatabaseService, queue as never);
  });

  it('rejects unsupported workflow trigger types', async () => {
    await expect(service.create('org-1', 'user-1', {
      name: 'Unsafe trigger', triggerType: 'decision.auto_approve', triggerConfig: {}, steps: [],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects unregistered action types', async () => {
    await expect(service.create('org-1', 'user-1', {
      name: 'Unsafe action', triggerType: 'decision.proposed', triggerConfig: {},
      steps: [{ type: 'decision.auto_approve', config: {} }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects notification actions without a title', async () => {
    await expect(service.create('org-1', 'user-1', {
      name: 'Missing title', triggerType: 'decision.proposed', triggerConfig: {},
      steps: [{ type: 'notification.create', config: { recipient: 'owner' } }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('supports task.assigned as a workflow trigger', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'workflow-assigned', trigger_type: 'task.assigned', status: 'draft' }] });

    await service.create('org-1', 'user-1', {
      name: 'Assignment workflow', triggerType: 'task.assigned', triggerConfig: {}, steps: [],
    });

    expect(db.query.mock.calls[0][1][3]).toBe('task.assigned');
  });

  it.each(['document.deleted', 'document.indexing_failed'])('accepts %s as a document lifecycle trigger', async (triggerType) => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'workflow-document', trigger_type: triggerType, status: 'draft' }] });

    await service.create('org-1', 'user-1', {
      name: 'Document lifecycle workflow', triggerType, triggerConfig: {}, steps: [],
    });

    expect(db.query.mock.calls[0][1][3]).toBe(triggerType);
  });
  const growthPlan = { rows: [{ plan_id: 'growth', trial_ends_at: null, created_at: new Date().toISOString() }] };

  it('dispatches an active matching decision workflow to the Bull queue', async () => {
    db.query
      .mockResolvedValueOnce(growthPlan)
      .mockResolvedValueOnce({ rows: [{ id: 'workflow-1', trigger_config: {}, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'run-1' }] });
    const result = await service.dispatchEvent('org-1', 'decision.proposed', {
      decision: { id: 'decision-1', decisionType: 'strategic', priority: 'high', status: 'proposed' },
    }, 'decision.proposed:decision-1:1', 'actor-1');
    expect(result.matched).toBe(1);
    const insertedRunId = String(db.query.mock.calls[2][1][0]);
    expect(queue.add).toHaveBeenCalledWith(
      'execute',
      expect.objectContaining({ runId: insertedRunId, workflowId: 'workflow-1', organizationId: 'org-1' }),
      expect.objectContaining({ jobId: insertedRunId }),
    );
    expect(db.query.mock.calls[2][0]).toContain('ON CONFLICT (workflow_id, event_key)');
  });

  it('does not fire event workflows when the plan excludes Workflows', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ plan_id: 'starter', trial_ends_at: null, created_at: new Date().toISOString() }] });
    const result = await service.dispatchEvent('org-1', 'decision.proposed', { decision: { id: 'decision-1' } }, 'key-1');
    expect(result).toMatchObject({ matched: 0, skipped: 'plan_does_not_include_workflows' });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not enqueue a duplicate event when the run key already exists', async () => {
    db.query
      .mockResolvedValueOnce(growthPlan)
      .mockResolvedValueOnce({ rows: [{ id: 'workflow-1', trigger_config: {}, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await service.dispatchEvent('org-1', 'decision.proposed', { decision: { id: 'decision-1' } }, 'same-event-key');
    expect(result.outcomes[0]).toEqual({ workflowId: 'workflow-1', queued: false, duplicate: true });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('filters workflows by decision type and priority', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'workflow-1', trigger_config: { decisionTypes: ['financial'], priorities: ['critical'] }, status: 'active' }] });
    const result = await service.dispatchEvent('org-1', 'decision.proposed', {
      decision: { id: 'decision-1', decisionType: 'strategic', priority: 'high', status: 'proposed' },
    }, 'event-1');
    expect(result.matched).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });
  it('returns step-level execution records with workflow run history', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'workflow-1', status: 'active' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'run-1', status: 'completed', steps: [{ step_index: 0, step_type: 'task.create', status: 'completed' }] }] });

    const result = await service.getRuns('workflow-1', 'org-1');

    expect(result).toHaveLength(1);
    expect(db.query.mock.calls[1][0]).toContain('workflow_step_runs');
    expect(db.query.mock.calls[1][0]).toContain('jsonb_agg');
    expect(result[0].steps).toHaveLength(1);
  });
});
