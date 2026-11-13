import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import { WorkflowsService } from './workflows.service';
import { WorkflowsScheduler } from './workflows.scheduler';

describe('WorkflowsScheduler task overdue scan', () => {
  const db = { query: jest.fn() };
  const workflows = {
    dispatchEvent: jest.fn(),
    recoverQueueEnqueueFailures: jest.fn().mockResolvedValue({ scanned: 0, recovered: 0, failed: 0 }),
  };
  const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
  let scheduler: WorkflowsScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    scheduler = new WorkflowsScheduler(
      db as unknown as DatabaseService,
      workflows as unknown as WorkflowsService,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('emits eligible overdue tasks with stable idempotency keys', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      id: 'task-1',
      organization_id: 'org-1',
      title: 'Prepare launch',
      status: 'in_progress',
      priority: 'high',
      assigneeId: 'user-2',
      createdById: 'user-1',
      teamId: 'team-1',
      dueDate: new Date('2026-10-01T10:00:00.000Z'),
    }] });

    await scheduler.scanOverdueTasks();

    expect(db.query.mock.calls[0][0]).toContain("t.status IN ('todo', 'in_progress', 'review')");
    expect(db.query.mock.calls[0][0]).toContain("workflow.trigger_type = 'task.overdue'");
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('task.overdue', expect.objectContaining({
      taskId: 'task-1',
      organizationId: 'org-1',
      eventKey: 'task.overdue:task-1:2026-10-01T10:00:00.000Z',
      assigneeId: 'user-2',
      actorId: null,
      scheduled: true,
    }));
  });

  it('runs the periodic retry for failed workflow queue handoffs', async () => {
    workflows.recoverQueueEnqueueFailures.mockResolvedValueOnce({ scanned: 2, recovered: 1, failed: 1 });

    await scheduler.recoverWorkflowQueueEnqueues();

    expect(workflows.recoverQueueEnqueueFailures).toHaveBeenCalledWith(100);
  });
  it('does not emit when no overdue tasks exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await scheduler.scanOverdueTasks();
    expect(eventEmitter.emitAsync).not.toHaveBeenCalled();
  });

  it('continues processing later tasks when one event dispatch fails', async () => {
    db.query.mockResolvedValueOnce({ rows: [
      { id: 'task-1', organization_id: 'org-1', title: 'First', status: 'todo', dueDate: new Date('2026-10-01T10:00:00.000Z') },
      { id: 'task-2', organization_id: 'org-1', title: 'Second', status: 'review', dueDate: new Date('2026-10-02T10:00:00.000Z') },
    ] });
    eventEmitter.emitAsync
      .mockRejectedValueOnce(new Error('temporary listener failure'))
      .mockResolvedValueOnce([]);

    await scheduler.scanOverdueTasks();

    expect(eventEmitter.emitAsync).toHaveBeenCalledTimes(2);
  });
});