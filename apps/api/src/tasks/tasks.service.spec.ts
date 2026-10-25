import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import {
  createMockDatabaseService,
  createMockEventEmitter,
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

describe('TasksService', () => {
  let service: TasksService;
  let db: ReturnType<typeof createMockDatabaseService>;
  let eventEmitter: ReturnType<typeof createMockEventEmitter>;

  beforeEach(async () => {
    db = createMockDatabaseService();
    eventEmitter = createMockEventEmitter();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: 'DatabaseService', useValue: db },
        { provide: 'EventEmitter2', useValue: eventEmitter },
      ],
    })
      .overrideProvider(TasksService)
      .useFactory({
        factory: () =>
          new (TasksService as new (...args: unknown[]) => TasksService)(
            db as never,
            eventEmitter as never,
          ),
      })
      .compile();

    service = module.get<TasksService>(TasksService);
    jest.clearAllMocks();
  });

  // â”€â”€ create â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('create()', () => {
    const orgId = FIXED_UUID_2;
    const creatorId = FIXED_UUID;
    const assigneeId = FIXED_UUID_3;

    it('inserts task and returns it', async () => {
      const task = makeTask();
      db.query.mockResolvedValueOnce(pgResult([])); // INSERT
      db.query.mockResolvedValueOnce(pgResult([task])); // findById SELECT

      const result = await service.create(orgId, creatorId, {
        title: 'Write tests',
        priority: 'medium',
      });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tasks'),
        expect.arrayContaining([FIXED_UUID, 'Write tests', null, 'medium', orgId, creatorId]),
      );
      expect(result).toEqual(task);
    });

    it('emits task.assigned when assignee differs from creator', async () => {
      const task = makeTask({ assignee_id: assigneeId });
      const creator = makeUser({ id: creatorId, name: 'Alice Tester' });

      db.query.mockResolvedValueOnce(pgResult([]));    // INSERT
      db.findOne.mockResolvedValueOnce(creator);        // fetch creator name
      db.query.mockResolvedValueOnce(pgResult([task])); // findById

      await service.create(orgId, creatorId, {
        title: 'New task',
        assigneeId,
        priority: 'high',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('task.assigned', {
        taskId: FIXED_UUID,
        taskTitle: 'New task',
        assigneeId,
        assignerName: 'Alice Tester',
        organizationId: orgId,
        priority: 'high',
        dueDate: undefined,
      });
    });

    it('does NOT emit task.assigned when creator assigns to themselves', async () => {
      const task = makeTask({ assignee_id: creatorId });
      db.query.mockResolvedValueOnce(pgResult([]));
      db.query.mockResolvedValueOnce(pgResult([task]));

      await service.create(orgId, creatorId, {
        title: 'Self-task',
        assigneeId: creatorId, // same as creator
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does NOT emit task.assigned when no assignee', async () => {
      const task = makeTask();
      db.query
        .mockResolvedValueOnce(pgResult([]))
        .mockResolvedValueOnce(pgResult([task]));

      await service.create(orgId, creatorId, { title: 'Unassigned task' });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('defaults priority to medium when not specified', async () => {
      const task = makeTask();
      db.query.mockResolvedValueOnce(pgResult([])).mockResolvedValueOnce(pgResult([task]));

      await service.create(orgId, creatorId, { title: 'No priority given' });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tasks'),
        expect.arrayContaining(['medium']),
      );
    });
  });

  // â”€â”€ findAll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('findAll()', () => {
    it('returns paginated tasks with total count', async () => {
      const tasks = [makeTask(), makeTask({ id: FIXED_UUID_2 })];
      db.query
        .mockResolvedValueOnce(pgResult([{ count: '2' }]))
        .mockResolvedValueOnce(pgResult(tasks));

      const result = await service.findAll(FIXED_UUID_2, {});

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
      expect(result.totalPages).toBe(1);
    });

    it('applies status filter when provided', async () => {
      db.query
        .mockResolvedValueOnce(pgResult([{ count: '0' }]))
        .mockResolvedValueOnce(pgResult([]));

      await service.findAll(FIXED_UUID_2, { status: 'done' });

      const [countCall] = db.query.mock.calls;
      expect(countCall[0]).toContain('t.status = $');
      expect(countCall[1]).toContain('done');
    });

    it('applies search filter with ILIKE', async () => {
      db.query
        .mockResolvedValueOnce(pgResult([{ count: '0' }]))
        .mockResolvedValueOnce(pgResult([]));

      await service.findAll(FIXED_UUID_2, { search: 'deploy' });

      const [countCall] = db.query.mock.calls;
      expect(countCall[1]).toContain('%deploy%');
    });

    it('applies correct offset for page 2', async () => {
      db.query
        .mockResolvedValueOnce(pgResult([{ count: '110' }]))
        .mockResolvedValueOnce(pgResult([]));

      const result = await service.findAll(FIXED_UUID_2, { page: 2, pageSize: 50 });

      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(3);
      // OFFSET 50 should appear in the data query
      const dataQuery = db.query.mock.calls[1][0] as string;
      expect(dataQuery).toContain('OFFSET 50');
    });

    it('returns empty result when no tasks exist', async () => {
      db.query
        .mockResolvedValueOnce(pgResult([{ count: '0' }]))
        .mockResolvedValueOnce(pgResult([]));

      const result = await service.findAll(FIXED_UUID_2, {});

      expect(result.total).toBe(0);
      expect(result.data).toHaveLength(0);
      expect(result.totalPages).toBe(0);
    });
  });

  // â”€â”€ findById â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('findById()', () => {
    it('returns task when found', async () => {
      const task = makeTask();
      db.query.mockResolvedValueOnce(pgResult([task]));

      const result = await service.findById(FIXED_UUID, FIXED_UUID_2);

      expect(result).toEqual(task);
    });

    it('throws NotFoundException when task does not exist', async () => {
      db.query.mockResolvedValueOnce(pgResult([]));

      await expect(service.findById('not-a-real-id', FIXED_UUID_2)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // â”€â”€ update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('update()', () => {
    it('returns existing task when dto is empty (no-op)', async () => {
      const task = makeTask();
      // findById is called first to get the existing task
      db.query.mockResolvedValueOnce(pgResult([task]));

      const result = await service.update(FIXED_UUID, FIXED_UUID_2, {});

      expect(result).toEqual(task);
      // No UPDATE query should be issued
      const updateCalls = db.query.mock.calls.filter((c) =>
        (c[0] as string).includes('UPDATE tasks'),
      );
      expect(updateCalls).toHaveLength(0);
    });

    it('sets completed_at when status changes to done', async () => {
      const existingTask = makeTask();
      const updatedTask = makeTask({ status: 'done', completed_at: new Date() });
      db.query
        .mockResolvedValueOnce(pgResult([existingTask])) // initial findById
        .mockResolvedValueOnce(pgResult([]))              // UPDATE
        .mockResolvedValueOnce(pgResult([updatedTask]));  // findById after update

      await service.update(FIXED_UUID, FIXED_UUID_2, { status: 'done' });

      const updateCall = db.query.mock.calls.find((c) =>
        (c[0] as string).includes('UPDATE tasks'),
      );
      expect(updateCall?.[0]).toContain('completed_at = NOW()');
    });

    it('clears completed_at when status changes away from done', async () => {
      const existingTask = makeTask({ status: 'done', completed_at: new Date() });
      const updatedTask = makeTask({ status: 'in_progress', completed_at: null });
      db.query
        .mockResolvedValueOnce(pgResult([existingTask]))
        .mockResolvedValueOnce(pgResult([]))
        .mockResolvedValueOnce(pgResult([updatedTask]));

      await service.update(FIXED_UUID, FIXED_UUID_2, { status: 'in_progress' });

      const updateCall = db.query.mock.calls.find((c) =>
        (c[0] as string).includes('UPDATE tasks'),
      );
      expect(updateCall?.[0]).toContain('completed_at = NULL');
    });

    it('emits task.assigned when assignee changes to a new person', async () => {
      const existingTask = makeTask({ assignee_id: null, created_by_id: FIXED_UUID });
      const updatedTask = makeTask({ assignee_id: FIXED_UUID_3 });
      const creator = makeUser({ id: FIXED_UUID, name: 'Alice Tester' });

      db.query
        .mockResolvedValueOnce(pgResult([existingTask]))  // initial findById
        .mockResolvedValueOnce(pgResult([]))               // UPDATE
        .mockResolvedValueOnce(pgResult([updatedTask]));   // findById after update
      db.findOne.mockResolvedValueOnce(creator);           // fetch updater name

      await service.update(FIXED_UUID, FIXED_UUID_2, { assigneeId: FIXED_UUID_3 });

      expect(eventEmitter.emit).toHaveBeenCalledWith('task.assigned', expect.objectContaining({
        taskId: FIXED_UUID,
        assigneeId: FIXED_UUID_3,
        assignerName: 'Alice Tester',
        organizationId: FIXED_UUID_2,
      }));
    });

    it('does NOT emit task.assigned when assignee stays the same', async () => {
      const existingTask = makeTask({ assignee_id: FIXED_UUID_3 });
      const updatedTask = makeTask({ assignee_id: FIXED_UUID_3, title: 'Updated title' });

      db.query
        .mockResolvedValueOnce(pgResult([existingTask]))
        .mockResolvedValueOnce(pgResult([]))
        .mockResolvedValueOnce(pgResult([updatedTask]));

      // No assigneeId in the update DTO â€” same assignee
      await service.update(FIXED_UUID, FIXED_UUID_2, { title: 'Updated title' });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  // â”€â”€ delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('delete()', () => {
    it('deletes the task and returns confirmation', async () => {
      db.query.mockResolvedValueOnce(pgResult([]));

      const result = await service.delete(FIXED_UUID, FIXED_UUID_2);

      expect(db.query).toHaveBeenCalledWith(
        'DELETE FROM tasks WHERE id = $1 AND organization_id = $2',
        [FIXED_UUID, FIXED_UUID_2],
      );
      expect(result).toEqual({ deleted: true });
    });
  });

  // â”€â”€ Projects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('createProject()', () => {
    it('inserts project and returns it', async () => {
      const project = makeProject();
      db.query
        .mockResolvedValueOnce(pgResult([]))       // INSERT
        .mockResolvedValueOnce(pgResult([project])); // findProjectById

      const result = await service.createProject(FIXED_UUID_2, FIXED_UUID, {
        name: 'Q1 Roadmap',
        description: 'Q1 work',
      });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        expect.any(Array),
      );
      expect(result).toEqual(project);
    });
  });

  describe('findProjects()', () => {
    it('returns all projects with task counts', async () => {
      const projects = [makeProject(), makeProject({ id: FIXED_UUID_3, name: 'Q2 Roadmap' })];
      db.query.mockResolvedValueOnce(pgResult(projects));

      const result = await service.findProjects(FIXED_UUID_2);

      expect(result).toHaveLength(2);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM projects'),
        [FIXED_UUID_2],
      );
    });
  });

  describe('findProjectById()', () => {
    it('returns project when found', async () => {
      const project = makeProject();
      db.query.mockResolvedValueOnce(pgResult([project]));

      const result = await service.findProjectById(FIXED_UUID, FIXED_UUID_2);
      expect(result).toEqual(project);
    });

    it('throws NotFoundException when project does not exist', async () => {
      db.query.mockResolvedValueOnce(pgResult([]));

      await expect(service.findProjectById('ghost-id', FIXED_UUID_2)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});


