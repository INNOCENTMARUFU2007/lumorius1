"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const tasks_service_1 = require("./tasks.service");
const helpers_1 = require("../test/helpers");
jest.mock('uuid', () => ({
    v4: jest.fn().mockReturnValue(helpers_1.FIXED_UUID),
}));
describe('TasksService', () => {
    let service;
    let db;
    let eventEmitter;
    beforeEach(async () => {
        db = (0, helpers_1.createMockDatabaseService)();
        eventEmitter = (0, helpers_1.createMockEventEmitter)();
        const module = await testing_1.Test.createTestingModule({
            providers: [
                tasks_service_1.TasksService,
                { provide: 'DatabaseService', useValue: db },
                { provide: 'EventEmitter2', useValue: eventEmitter },
            ],
        })
            .overrideProvider(tasks_service_1.TasksService)
            .useFactory({
            factory: () => new tasks_service_1.TasksService(db, eventEmitter),
        })
            .compile();
        service = module.get(tasks_service_1.TasksService);
        jest.clearAllMocks();
    });
    describe('create()', () => {
        const orgId = helpers_1.FIXED_UUID_2;
        const creatorId = helpers_1.FIXED_UUID;
        const assigneeId = helpers_1.FIXED_UUID_3;
        it('inserts task and returns it', async () => {
            const task = (0, helpers_1.makeTask)();
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([task]));
            const result = await service.create(orgId, creatorId, {
                title: 'Write tests',
                priority: 'medium',
            });
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tasks'), expect.arrayContaining([helpers_1.FIXED_UUID, 'Write tests', undefined, 'medium', orgId, creatorId]));
            expect(result).toEqual(task);
        });
        it('emits task.assigned when assignee differs from creator', async () => {
            const task = (0, helpers_1.makeTask)({ assignee_id: assigneeId });
            const creator = (0, helpers_1.makeUser)({ id: creatorId, name: 'Alice Tester' });
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            db.findOne.mockResolvedValueOnce(creator);
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([task]));
            await service.create(orgId, creatorId, {
                title: 'New task',
                assigneeId,
                priority: 'high',
            });
            expect(eventEmitter.emit).toHaveBeenCalledWith('task.assigned', {
                taskId: helpers_1.FIXED_UUID,
                taskTitle: 'New task',
                assigneeId,
                assignerName: 'Innocent Tester',
                organizationId: orgId,
                priority: 'high',
                dueDate: undefined,
            });
        });
        it('does NOT emit task.assigned when creator assigns to themselves', async () => {
            const task = (0, helpers_1.makeTask)({ assignee_id: creatorId });
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([task]));
            await service.create(orgId, creatorId, {
                title: 'Self-task',
                assigneeId: creatorId,
            });
            expect(eventEmitter.emit).not.toHaveBeenCalled();
        });
        it('does NOT emit task.assigned when no assignee', async () => {
            const task = (0, helpers_1.makeTask)();
            db.query
                .mockResolvedValueOnce((0, helpers_1.pgResult)([]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([task]));
            await service.create(orgId, creatorId, { title: 'Unassigned task' });
            expect(eventEmitter.emit).not.toHaveBeenCalled();
        });
        it('defaults priority to medium when not specified', async () => {
            const task = (0, helpers_1.makeTask)();
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([])).mockResolvedValueOnce((0, helpers_1.pgResult)([task]));
            await service.create(orgId, creatorId, { title: 'No priority given' });
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tasks'), expect.arrayContaining(['medium']));
        });
    });
    describe('findAll()', () => {
        it('returns paginated tasks with total count', async () => {
            const tasks = [(0, helpers_1.makeTask)(), (0, helpers_1.makeTask)({ id: helpers_1.FIXED_UUID_2 })];
            db.query
                .mockResolvedValueOnce((0, helpers_1.pgResult)([{ count: '2' }]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)(tasks));
            const result = await service.findAll(helpers_1.FIXED_UUID_2, {});
            expect(result.total).toBe(2);
            expect(result.data).toHaveLength(2);
            expect(result.page).toBe(1);
            expect(result.pageSize).toBe(50);
            expect(result.totalPages).toBe(1);
        });
        it('applies status filter when provided', async () => {
            db.query
                .mockResolvedValueOnce((0, helpers_1.pgResult)([{ count: '0' }]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            await service.findAll(helpers_1.FIXED_UUID_2, { status: 'done' });
            const [countCall] = db.query.mock.calls;
            expect(countCall[0]).toContain('t.status = $');
            expect(countCall[1]).toContain('done');
        });
        it('applies search filter with ILIKE', async () => {
            db.query
                .mockResolvedValueOnce((0, helpers_1.pgResult)([{ count: '0' }]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            await service.findAll(helpers_1.FIXED_UUID_2, { search: 'deploy' });
            const [countCall] = db.query.mock.calls;
            expect(countCall[1]).toContain('%deploy%');
        });
        it('applies correct offset for page 2', async () => {
            db.query
                .mockResolvedValueOnce((0, helpers_1.pgResult)([{ count: '110' }]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            const result = await service.findAll(helpers_1.FIXED_UUID_2, { page: 2, pageSize: 50 });
            expect(result.page).toBe(2);
            expect(result.totalPages).toBe(3);
            const dataQuery = db.query.mock.calls[1][0];
            expect(dataQuery).toContain('OFFSET 50');
        });
        it('returns empty result when no tasks exist', async () => {
            db.query
                .mockResolvedValueOnce((0, helpers_1.pgResult)([{ count: '0' }]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            const result = await service.findAll(helpers_1.FIXED_UUID_2, {});
            expect(result.total).toBe(0);
            expect(result.data).toHaveLength(0);
            expect(result.totalPages).toBe(0);
        });
    });
    describe('findById()', () => {
        it('returns task when found', async () => {
            const task = (0, helpers_1.makeTask)();
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([task]));
            const result = await service.findById(helpers_1.FIXED_UUID, helpers_1.FIXED_UUID_2);
            expect(result).toEqual(task);
        });
        it('throws NotFoundException when task does not exist', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            await expect(service.findById('not-a-real-id', helpers_1.FIXED_UUID_2)).rejects.toThrow(common_1.NotFoundException);
        });
    });
    describe('update()', () => {
        it('returns existing task when dto is empty (no-op)', async () => {
            const task = (0, helpers_1.makeTask)();
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([task]));
            const result = await service.update(helpers_1.FIXED_UUID, helpers_1.FIXED_UUID_2, {});
            expect(result).toEqual(task);
            const updateCalls = db.query.mock.calls.filter((c) => c[0].includes('UPDATE tasks'));
            expect(updateCalls).toHaveLength(0);
        });
        it('sets completed_at when status changes to done', async () => {
            const existingTask = (0, helpers_1.makeTask)();
            const updatedTask = (0, helpers_1.makeTask)({ status: 'done', completed_at: new Date() });
            db.query
                .mockResolvedValueOnce((0, helpers_1.pgResult)([existingTask]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([updatedTask]));
            await service.update(helpers_1.FIXED_UUID, helpers_1.FIXED_UUID_2, { status: 'done' });
            const updateCall = db.query.mock.calls.find((c) => c[0].includes('UPDATE tasks'));
            expect(updateCall?.[0]).toContain('completed_at = NOW()');
        });
        it('clears completed_at when status changes away from done', async () => {
            const existingTask = (0, helpers_1.makeTask)({ status: 'done', completed_at: new Date() });
            const updatedTask = (0, helpers_1.makeTask)({ status: 'in_progress', completed_at: null });
            db.query
                .mockResolvedValueOnce((0, helpers_1.pgResult)([existingTask]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([updatedTask]));
            await service.update(helpers_1.FIXED_UUID, helpers_1.FIXED_UUID_2, { status: 'in_progress' });
            const updateCall = db.query.mock.calls.find((c) => c[0].includes('UPDATE tasks'));
            expect(updateCall?.[0]).toContain('completed_at = NULL');
        });
        it('emits task.assigned when assignee changes to a new person', async () => {
            const existingTask = (0, helpers_1.makeTask)({ assignee_id: null, created_by_id: helpers_1.FIXED_UUID });
            const updatedTask = (0, helpers_1.makeTask)({ assignee_id: helpers_1.FIXED_UUID_3 });
            const creator = (0, helpers_1.makeUser)({ id: helpers_1.FIXED_UUID, name: 'Alice Tester' });
            db.query
                .mockResolvedValueOnce((0, helpers_1.pgResult)([existingTask]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([updatedTask]));
            db.findOne.mockResolvedValueOnce(creator);
            await service.update(helpers_1.FIXED_UUID, helpers_1.FIXED_UUID_2, { assigneeId: helpers_1.FIXED_UUID_3 });
            expect(eventEmitter.emit).toHaveBeenCalledWith('task.assigned', expect.objectContaining({
                taskId: helpers_1.FIXED_UUID,
                assigneeId: helpers_1.FIXED_UUID_3,
                assignerName: 'Innocent Tester',
                organizationId: helpers_1.FIXED_UUID_2,
            }));
        });
        it('does NOT emit task.assigned when assignee stays the same', async () => {
            const existingTask = (0, helpers_1.makeTask)({ assignee_id: helpers_1.FIXED_UUID_3 });
            const updatedTask = (0, helpers_1.makeTask)({ assignee_id: helpers_1.FIXED_UUID_3, title: 'Updated title' });
            db.query
                .mockResolvedValueOnce((0, helpers_1.pgResult)([existingTask]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([updatedTask]));
            await service.update(helpers_1.FIXED_UUID, helpers_1.FIXED_UUID_2, { title: 'Updated title' });
            expect(eventEmitter.emit).not.toHaveBeenCalled();
        });
    });
    describe('delete()', () => {
        it('deletes the task and returns confirmation', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            const result = await service.delete(helpers_1.FIXED_UUID, helpers_1.FIXED_UUID_2);
            expect(db.query).toHaveBeenCalledWith('DELETE FROM tasks WHERE id = $1 AND organization_id = $2', [helpers_1.FIXED_UUID, helpers_1.FIXED_UUID_2]);
            expect(result).toEqual({ deleted: true });
        });
    });
    describe('createProject()', () => {
        it('inserts project and returns it', async () => {
            const project = (0, helpers_1.makeProject)();
            db.query
                .mockResolvedValueOnce((0, helpers_1.pgResult)([]))
                .mockResolvedValueOnce((0, helpers_1.pgResult)([project]));
            const result = await service.createProject(helpers_1.FIXED_UUID_2, helpers_1.FIXED_UUID, {
                name: 'Q1 Roadmap',
                description: 'Q1 work',
            });
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO projects'), expect.any(Array));
            expect(result).toEqual(project);
        });
    });
    describe('findProjects()', () => {
        it('returns all projects with task counts', async () => {
            const projects = [(0, helpers_1.makeProject)(), (0, helpers_1.makeProject)({ id: helpers_1.FIXED_UUID_3, name: 'Q2 Roadmap' })];
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)(projects));
            const result = await service.findProjects(helpers_1.FIXED_UUID_2);
            expect(result).toHaveLength(2);
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM projects'), [helpers_1.FIXED_UUID_2]);
        });
    });
    describe('findProjectById()', () => {
        it('returns project when found', async () => {
            const project = (0, helpers_1.makeProject)();
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([project]));
            const result = await service.findProjectById(helpers_1.FIXED_UUID, helpers_1.FIXED_UUID_2);
            expect(result).toEqual(project);
        });
        it('throws NotFoundException when project does not exist', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            await expect(service.findProjectById('ghost-id', helpers_1.FIXED_UUID_2)).rejects.toThrow(common_1.NotFoundException);
        });
    });
});
//# sourceMappingURL=tasks.service.spec.js.map