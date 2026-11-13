import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TasksService, TaskAccessContext } from './tasks.service';
import {
  createMockDatabaseService,
  pgResult,
  makeTask,
  makeProject,
  makeUser,
  FIXED_UUID,
  FIXED_UUID_2,
  FIXED_UUID_3,
} from '../test/helpers';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
}));

describe('TasksService authorization and tenant isolation', () => {
  let service: TasksService;
  let db: ReturnType<typeof createMockDatabaseService>;
  let publisher: { append: jest.Mock };

  const member: TaskAccessContext = { userId: FIXED_UUID, role: 'member' };
  const manager: TaskAccessContext = { userId: FIXED_UUID, role: 'manager' };
  const owner: TaskAccessContext = { userId: FIXED_UUID, role: 'owner' };
  const organizationId = FIXED_UUID_2;

  beforeEach(() => {
    db = createMockDatabaseService();
    publisher = { append: jest.fn().mockResolvedValue({ eventId: FIXED_UUID, duplicate: false, deliveriesInserted: 1 }) };
    db.transaction.mockImplementation(async (callback: (client: { query: typeof db.query }) => Promise<unknown>) => callback({ query: db.query }));
    service = new TasksService(db as never, publisher as never);
  });

  it('scopes task lists to organization and team membership', async () => {
    db.query
      .mockResolvedValueOnce(pgResult([{ count: '1' }]))
      .mockResolvedValueOnce(pgResult([makeTask()]));

    const result = await service.findAll(organizationId, {}, member);

    expect(result.total).toBe(1);
    expect(db.query.mock.calls[0][0]).toContain('team_members');
    expect(db.query.mock.calls[0][0]).toContain('COALESCE(t.team_id');
    expect(db.query.mock.calls[0][1]).toEqual([organizationId, false, member.userId]);
  });

  it('limits page size to 100', async () => {
    db.query
      .mockResolvedValueOnce(pgResult([{ count: '0' }]))
      .mockResolvedValueOnce(pgResult([]));

    const result = await service.findAll(organizationId, { page: 1, pageSize: 500 }, member);
    expect(result.pageSize).toBe(100);
    expect(db.query.mock.calls[1][0]).toContain('LIMIT 100 OFFSET 0');
  });

  it('uses team-aware lookup for a task', async () => {
    const task = makeTask();
    db.query.mockResolvedValueOnce(pgResult([task]));

    const result = await service.findById(FIXED_UUID_3, organizationId, member);
    expect(result).toEqual(task);
    expect(db.query.mock.calls[0][0]).toContain('team_members');
    expect(db.query.mock.calls[0][0]).toContain('COALESCE(t.team_id, p.team_id)');
    expect(db.query.mock.calls[0][1]).toEqual([FIXED_UUID_3, organizationId, false, member.userId]);
  });

  it('does not disclose tasks outside the actor team', async () => {
    db.query.mockResolvedValueOnce(pgResult([]));
    await expect(service.findById(FIXED_UUID_3, organizationId, member)).rejects.toThrow(NotFoundException);
  });

  it('allows an owner to see tasks in every team', async () => {
    db.query.mockResolvedValueOnce(pgResult([makeTask()]));
    await service.findById(FIXED_UUID_3, organizationId, owner);
    expect(db.query.mock.calls[0][1]).toEqual([FIXED_UUID_3, organizationId, true, owner.userId]);
  });

  it('rejects viewers at service level', async () => {
    await expect(
      service.findAll(organizationId, {}, { userId: FIXED_UUID, role: 'viewer' }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('creates an unassigned organization-level task and returns it', async () => {
    const task = makeTask();
    db.query
      .mockResolvedValueOnce(pgResult([]))
      .mockResolvedValueOnce(pgResult([task]));

    const result = await service.create(organizationId, member.userId, { title: 'Write tests' }, member);
    expect(result).toEqual(task);
    expect(db.query.mock.calls[0][0]).toContain('INSERT INTO tasks');
    expect(db.query.mock.calls[0][1]).toContainEqual([]);
    expect(publisher.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'task.created', aggregateId: expect.any(String) }),
      ['luie.legacy-domain-bridge'],
    );
  });

  it('reuses an existing task when the same meeting action is retried', async () => {
    const task = makeTask();
    db.query
      .mockResolvedValueOnce(pgResult([]))
      .mockResolvedValueOnce(pgResult([]))
      .mockResolvedValueOnce(pgResult([{ id: FIXED_UUID_3 }]))
      .mockResolvedValueOnce(pgResult([task]));

    const result = await service.create(
      organizationId,
      member.userId,
      { title: 'Follow up with customer' },
      member,
      { meetingActionItemId: FIXED_UUID_3 },
    );

    expect(result).toEqual(task);
    expect(db.query.mock.calls[0][0]).toContain('source_meeting_action_item_id');
    expect(db.query.mock.calls[1][0]).toContain('ON CONFLICT');
    expect(db.query.mock.calls[2][1]).toEqual([organizationId, FIXED_UUID_3]);
    expect(publisher.append).not.toHaveBeenCalled();
  });

  it('rejects a team outside the organization or inaccessible to the actor', async () => {
    db.query.mockResolvedValueOnce(pgResult([]));
    await expect(
      service.create(organizationId, member.userId, { title: 'Restricted', teamId: FIXED_UUID_3 }, member),
    ).rejects.toThrow('selected team is unavailable');
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('validates active same-organization assignees and emits actor identity', async () => {
    const task = makeTask({ assignee_id: FIXED_UUID_3 });
    db.query
      .mockResolvedValueOnce(pgResult([{ id: FIXED_UUID_3 }]))
      .mockResolvedValueOnce(pgResult([]))
      .mockResolvedValueOnce(pgResult([task]));
    db.findOne.mockResolvedValueOnce(makeUser({ id: member.userId, name: 'Task Creator' }));

    await service.create(organizationId, member.userId, {
      title: 'Assigned task', assigneeId: FIXED_UUID_3,
    }, member);

    expect(publisher.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'task.assigned',
        aggregateId: expect.any(String),
        actorId: member.userId,
        organizationId,
        payload: expect.objectContaining({ assigneeId: FIXED_UUID_3, actorId: member.userId }),
      }),
      ['luie.legacy-domain-bridge'],
    );
  });

  it('allows an assignee to change status only', async () => {
    const existing = makeTask({ created_by_id: FIXED_UUID_2, assignee_id: member.userId });
    const updated = makeTask({ created_by_id: FIXED_UUID_2, assignee_id: member.userId, status: 'done' });
    db.query
      .mockResolvedValueOnce(pgResult([existing]))
      .mockResolvedValueOnce(pgResult([]))
      .mockResolvedValueOnce(pgResult([updated]));

    const result = await service.update(FIXED_UUID_3, organizationId, { status: 'done' }, member);
    expect(result.status).toBe('done');
    expect(db.query.mock.calls[1][0]).toContain('UPDATE tasks');
  });

  it('records status change and completion events with the task update', async () => {
    const existing = makeTask({ status: 'in_progress', created_by_id: member.userId });
    const updated = makeTask({ status: 'done', created_by_id: member.userId });
    db.query
      .mockResolvedValueOnce(pgResult([existing]))
      .mockResolvedValueOnce(pgResult([{
        updated_at: new Date('2026-11-13T10:00:00.000Z'),
        previous_assignee_id: existing.assignee_id,
        previous_status: 'in_progress',
        team_id: null,
        project_team_id: null,
        status: 'done',
        title: updated.title,
        description: updated.description,
        priority: updated.priority,
        due_date: updated.due_date,
        tags: updated.tags,
        project_id: updated.project_id,
        previous_title: existing.title,
        previous_description: existing.description,
        previous_priority: existing.priority,
        previous_due_date: existing.due_date,
        previous_tags: existing.tags,
        previous_project_id: existing.project_id,
      }]))
      .mockResolvedValueOnce(pgResult([updated]));

    await service.update(FIXED_UUID_3, organizationId, { status: 'done' }, member);

    expect(publisher.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'task.status_changed',
        payload: expect.objectContaining({ previousStatus: 'in_progress', status: 'done' }),
      }),
      ['luie.legacy-domain-bridge'],
    );
    expect(publisher.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'task.completed' }),
      ['luie.legacy-domain-bridge'],
    );
  });

  it('records task unassignment as an assignment change', async () => {
    const existing = makeTask({ created_by_id: member.userId, assignee_id: FIXED_UUID_3 });
    const updated = makeTask({ created_by_id: member.userId, assignee_id: null });
    db.query
      .mockResolvedValueOnce(pgResult([existing]))
      .mockResolvedValueOnce(pgResult([{
        updated_at: new Date('2026-11-13T10:00:00.000Z'),
        previous_assignee_id: FIXED_UUID_3,
        previous_status: existing.status,
        team_id: null,
        project_team_id: null,
        status: updated.status,
        title: updated.title,
        description: updated.description,
        priority: updated.priority,
        due_date: updated.due_date,
        tags: updated.tags,
        project_id: updated.project_id,
        previous_title: existing.title,
        previous_description: existing.description,
        previous_priority: existing.priority,
        previous_due_date: existing.due_date,
        previous_tags: existing.tags,
        previous_project_id: existing.project_id,
      }]))
      .mockResolvedValueOnce(pgResult([updated]));

    await service.update(FIXED_UUID_3, organizationId, { assigneeId: null }, member);

    expect(publisher.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'task.assigned',
        payload: expect.objectContaining({ assigneeId: null }),
      }),
      ['luie.legacy-domain-bridge'],
    );
  });

  it('prevents an unrelated member from editing another user task', async () => {
    db.query.mockResolvedValueOnce(pgResult([makeTask({ created_by_id: FIXED_UUID_2, assignee_id: FIXED_UUID_3 })]));
    await expect(
      service.update(FIXED_UUID_3, organizationId, { title: 'Take over' }, member),
    ).rejects.toThrow(ForbiddenException);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('allows the creator to edit their task', async () => {
    const existing = makeTask({ created_by_id: member.userId, assignee_id: FIXED_UUID_3 });
    const updated = makeTask({ created_by_id: member.userId, title: 'Edited title' });
    db.query
      .mockResolvedValueOnce(pgResult([existing]))
      .mockResolvedValueOnce(pgResult([]))
      .mockResolvedValueOnce(pgResult([updated]));

    const result = await service.update(FIXED_UUID_3, organizationId, { title: 'Edited title' }, member);
    expect(result.title).toBe('Edited title');
  });

  it('validates replacement assignees before updating', async () => {
    const existing = makeTask({ created_by_id: member.userId, assignee_id: null });
    db.query
      .mockResolvedValueOnce(pgResult([existing]))
      .mockResolvedValueOnce(pgResult([]));

    await expect(
      service.update(FIXED_UUID_3, organizationId, { assigneeId: FIXED_UUID_3 }, member),
    ).rejects.toThrow('assignee must be an active organization member');
  });

  it('allows a manager to delete a visible task', async () => {
    db.query
      .mockResolvedValueOnce(pgResult([{
        ...makeTask({ created_by_id: FIXED_UUID_2 }),
        project_team_id: null,
      }]))
      .mockResolvedValueOnce(pgResult([{ id: FIXED_UUID_3 }]));

    const result = await service.delete(FIXED_UUID_3, organizationId, manager);
    expect(result).toEqual({ deleted: true });
    expect(db.query.mock.calls[0][0]).toContain('FOR UPDATE OF task');
    expect(db.query.mock.calls[1][0]).toContain('DELETE FROM tasks');
    expect(publisher.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'task.deleted', aggregateId: FIXED_UUID_3 }),
      ['luie.legacy-domain-bridge'],
    );
  });

  it('prevents a non-creator member from deleting a task', async () => {
    db.query.mockResolvedValueOnce(pgResult([makeTask({ created_by_id: FIXED_UUID_2 })]));
    await expect(service.delete(FIXED_UUID_3, organizationId, member)).rejects.toThrow(ForbiddenException);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('requires manager privilege to create projects', async () => {
    await expect(
      service.createProject(organizationId, member.userId, { name: 'Roadmap' }, member),
    ).rejects.toThrow(ForbiddenException);
  });

  it('writes project creation and its event in one transaction', async () => {
    db.query
      .mockResolvedValueOnce(pgResult([{ created_at: new Date('2026-11-13T10:00:00.000Z') }]))
      .mockResolvedValueOnce(pgResult([makeProject()]));

    await service.createProject(
      organizationId,
      manager.userId,
      { name: 'Roadmap' },
      manager,
    );

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(publisher.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'project.created', payload: expect.objectContaining({ name: 'Roadmap' }) }),
      ['luie.legacy-domain-bridge'],
    );
  });

  it('writes project updates and their event in one transaction', async () => {
    const existing = makeProject();
    const updated = makeProject({ name: 'Updated roadmap' });
    db.query
      .mockResolvedValueOnce(pgResult([existing]))
      .mockResolvedValueOnce(pgResult([{ updated_at: new Date('2026-11-13T10:00:00.000Z') }]))
      .mockResolvedValueOnce(pgResult([updated]));

    const result = await service.updateProject(
      FIXED_UUID,
      organizationId,
      { name: 'Updated roadmap' },
      manager,
    );

    expect(result).toEqual(updated);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(publisher.append).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'project.updated',
        payload: expect.objectContaining({ name: 'Updated roadmap' }),
      }),
      ['luie.legacy-domain-bridge'],
    );
  });

  it('validates team access when creating a project', async () => {
    db.query.mockResolvedValueOnce(pgResult([]));
    await expect(
      service.createProject(organizationId, manager.userId, { name: 'Roadmap', teamId: FIXED_UUID_3 }, manager),
    ).rejects.toThrow('selected team is unavailable');
  });

  it('uses tenant-safe project/task joins and team visibility', async () => {
    db.query.mockResolvedValueOnce(pgResult([makeProject()]));
    await service.findProjects(organizationId, member);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('t.organization_id = p.organization_id');
    expect(sql).toContain('team_members');
    expect(values).toEqual([organizationId, false, member.userId]);
  });

  it('scopes a project lookup to tenant and team membership', async () => {
    const project = makeProject();
    db.query.mockResolvedValueOnce(pgResult([project]));
    const result = await service.findProjectById(FIXED_UUID_3, organizationId, member);
    expect(result).toEqual(project);
    expect(db.query.mock.calls[0][0]).toContain('team_members');
  });

  it('returns not found for projects outside the actor scope', async () => {
    db.query.mockResolvedValueOnce(pgResult([]));
    await expect(service.findProjectById(FIXED_UUID_3, organizationId, member)).rejects.toThrow(NotFoundException);
  });
});
describe('TasksService V4.12 hardening regressions', () => {
  let service: TasksService;
  let db: ReturnType<typeof createMockDatabaseService>;
  let publisher: { append: jest.Mock };

  const member: TaskAccessContext = { userId: FIXED_UUID, role: 'member' };
  const manager: TaskAccessContext = { userId: FIXED_UUID, role: 'manager' };
  const organizationId = FIXED_UUID_2;

  beforeEach(() => {
    db = createMockDatabaseService();
    publisher = { append: jest.fn().mockResolvedValue({ eventId: FIXED_UUID, duplicate: false, deliveriesInserted: 1 }) };
    db.transaction.mockImplementation(async (callback: (client: { query: typeof db.query }) => Promise<unknown>) => callback({ query: db.query }));
    service = new TasksService(db as never, publisher as never);
  });

  it('V4.12 rejects malformed task identifiers before database access', async () => {
    await expect(
      service.create(organizationId, member.userId, { title: 'Invalid team', teamId: 'not-a-uuid' }, member),
    ).rejects.toThrow('Invalid task team ID.');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('V4.12 rejects invalid due dates before database access', async () => {
    await expect(
      service.create(organizationId, member.userId, { title: 'Invalid date', dueDate: 'not-a-date' }, member),
    ).rejects.toThrow('Invalid task due date.');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('V4.12 rejects task titles longer than the database limit', async () => {
    await expect(
      service.create(organizationId, member.userId, { title: 'x'.repeat(501) }, member),
    ).rejects.toThrow('Task title cannot exceed 500 characters.');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('V4.12 rejects project date ranges in reverse order', async () => {
    await expect(
      service.createProject(organizationId, manager.userId, {
        name: 'Invalid date range', startDate: '2026-12-31', endDate: '2026-01-01',
      }, manager),
    ).rejects.toThrow('Project end date cannot precede its start date.');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('V4.12 restricts project task aggregates to the actor team scope', async () => {
    db.query.mockResolvedValueOnce(pgResult([makeProject()]));
    await service.findProjects(organizationId, member);
    const projectListSql = String(db.query.mock.calls[0][0]);
    expect(projectListSql).toContain('task_scope_member');
    expect(projectListSql).toContain('COALESCE(t.team_id, p.team_id)');
    expect(projectListSql).toContain('task_scope_member.user_id = $3');
    expect(db.query.mock.calls[0][1]).toEqual([organizationId, false, member.userId]);

    db.query.mockResolvedValueOnce(pgResult([makeProject()]));
    await service.findProjectById(FIXED_UUID_3, organizationId, member);
    const projectDetailSql = String(db.query.mock.calls[1][0]);
    expect(projectDetailSql).toContain('task_scope_member');
    expect(projectDetailSql).toContain('COALESCE(t.team_id, p.team_id)');
    expect(projectDetailSql).toContain('task_scope_member.user_id = $4');
    expect(db.query.mock.calls[1][1]).toEqual([FIXED_UUID_3, organizationId, false, member.userId]);
  });
});