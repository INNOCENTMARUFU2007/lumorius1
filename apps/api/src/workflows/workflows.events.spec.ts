import { WorkflowsEventsListener } from './workflows.events';

describe('WorkflowsEventsListener', () => {
  const workflows = { dispatchEvent: jest.fn().mockResolvedValue({ matched: 1 }) };
  let listener: WorkflowsEventsListener;

  beforeEach(() => {
    jest.clearAllMocks();
    listener = new WorkflowsEventsListener(workflows as never);
  });

  it('dispatches task assignment events with their event key and actor', async () => {
    await listener.onTaskAssigned({
      taskId: 'task-1',
      organizationId: 'org-1',
      actorId: 'user-1',
      assigneeId: 'user-2',
      eventKey: 'task.assigned:task-1:user-2',
    });

    expect(workflows.dispatchEvent).toHaveBeenCalledWith(
      'org-1',
      'task.assigned',
      expect.objectContaining({ taskId: 'task-1', assigneeId: 'user-2' }),
      'task.assigned:task-1:user-2',
      'user-1',
    );
  });

  it('dispatches overdue task events with a stable event key and no actor', async () => {
    await listener.onTaskOverdue({
      taskId: 'task-2',
      organizationId: 'org-1',
      eventKey: 'task.overdue:task-2:2026-10-01T10:00:00.000Z',
      scheduled: true,
    });

    expect(workflows.dispatchEvent).toHaveBeenCalledWith(
      'org-1',
      'task.overdue',
      expect.objectContaining({ taskId: 'task-2', scheduled: true }),
      'task.overdue:task-2:2026-10-01T10:00:00.000Z',
      null,
    );
  });
});