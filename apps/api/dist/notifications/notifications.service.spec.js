"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const notifications_service_1 = require("./notifications.service");
const helpers_1 = require("../test/helpers");
jest.mock('uuid', () => ({
    v4: jest.fn().mockReturnValue(helpers_1.FIXED_UUID),
}));
describe('NotificationsService', () => {
    let service;
    let db;
    beforeEach(async () => {
        db = (0, helpers_1.createMockDatabaseService)();
        const module = await testing_1.Test.createTestingModule({
            providers: [
                notifications_service_1.NotificationsService,
                { provide: 'DatabaseService', useValue: db },
            ],
        })
            .overrideProvider(notifications_service_1.NotificationsService)
            .useFactory({
            factory: () => new notifications_service_1.NotificationsService(db),
        })
            .compile();
        service = module.get(notifications_service_1.NotificationsService);
        jest.clearAllMocks();
    });
    describe('create()', () => {
        it('inserts notification and returns the new id', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            const result = await service.create({
                userId: helpers_1.FIXED_UUID,
                organizationId: helpers_1.FIXED_UUID_2,
                type: 'task_assigned',
                title: 'New task: Write tests',
                message: 'Assigned by Alice',
                data: { taskId: helpers_1.FIXED_UUID },
            });
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), [helpers_1.FIXED_UUID, helpers_1.FIXED_UUID, helpers_1.FIXED_UUID_2, 'task_assigned', 'New task: Write tests',
                'Assigned by Alice', JSON.stringify({ taskId: helpers_1.FIXED_UUID })]);
            expect(result).toEqual({ id: helpers_1.FIXED_UUID });
        });
        it('inserts with null message and empty data when omitted', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            await service.create({
                userId: helpers_1.FIXED_UUID,
                organizationId: helpers_1.FIXED_UUID_2,
                type: 'system',
                title: 'System notification',
            });
            expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notifications'), expect.arrayContaining([null, JSON.stringify({})]));
        });
    });
    describe('findAll()', () => {
        it('returns all notifications for a user', async () => {
            const notifications = [(0, helpers_1.makeNotification)(), (0, helpers_1.makeNotification)({ id: helpers_1.FIXED_UUID_2 })];
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)(notifications));
            const result = await service.findAll(helpers_1.FIXED_UUID);
            expect(result).toHaveLength(2);
            const query = db.query.mock.calls[0][0];
            expect(query).not.toContain('read_at IS NULL');
        });
        it('filters unread notifications when unreadOnly is true', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([(0, helpers_1.makeNotification)()]));
            await service.findAll(helpers_1.FIXED_UUID, true);
            const query = db.query.mock.calls[0][0];
            expect(query).toContain('read_at IS NULL');
        });
        it('returns empty array when user has no notifications', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            const result = await service.findAll(helpers_1.FIXED_UUID);
            expect(result).toEqual([]);
        });
        it('limits results to 50', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            await service.findAll(helpers_1.FIXED_UUID);
            const query = db.query.mock.calls[0][0];
            expect(query).toContain('LIMIT 50');
        });
    });
    describe('markRead()', () => {
        it('marks a specific notification as read', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            const result = await service.markRead(helpers_1.FIXED_UUID, helpers_1.FIXED_UUID_2);
            expect(db.query).toHaveBeenCalledWith('UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2', [helpers_1.FIXED_UUID_2, helpers_1.FIXED_UUID]);
            expect(result).toEqual({ read: true });
        });
    });
    describe('markAllRead()', () => {
        it('marks all unread notifications as read for the user', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            const result = await service.markAllRead(helpers_1.FIXED_UUID);
            expect(db.query).toHaveBeenCalledWith('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [helpers_1.FIXED_UUID]);
            expect(result).toEqual({ read: true });
        });
    });
    describe('getUnreadCount()', () => {
        it('returns the unread notification count', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([{ count: '7' }]));
            const result = await service.getUnreadCount(helpers_1.FIXED_UUID);
            expect(result).toEqual({ count: 7 });
            expect(db.query).toHaveBeenCalledWith('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL', [helpers_1.FIXED_UUID]);
        });
        it('returns 0 when there are no unread notifications', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([{ count: '0' }]));
            const result = await service.getUnreadCount(helpers_1.FIXED_UUID);
            expect(result).toEqual({ count: 0 });
        });
        it('returns 0 gracefully when count row is missing', async () => {
            db.query.mockResolvedValueOnce((0, helpers_1.pgResult)([]));
            const result = await service.getUnreadCount(helpers_1.FIXED_UUID);
            expect(result).toEqual({ count: 0 });
        });
    });
});
//# sourceMappingURL=notifications.service.spec.js.map