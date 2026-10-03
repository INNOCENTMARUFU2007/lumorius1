"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const notifications_controller_1 = require("./notifications.controller");
const notifications_service_1 = require("./notifications.service");
const createMockNotificationsService = () => ({
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    delete: jest.fn(),
    getUnreadCount: jest.fn(),
});
const mockUser = {
    id: 'user-1',
    email: 'alice@lumorius.com',
    organization_id: 'org-1',
    role: 'admin',
};
const makeNotif = (overrides = {}) => ({
    id: `notif-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    organization_id: 'org-1',
    type: 'task_assigned',
    title: 'New task assigned',
    message: 'You have been assigned a task',
    read_at: null,
    created_at: new Date(),
    ...overrides,
});
describe('NotificationsController', () => {
    let controller;
    let service;
    beforeEach(async () => {
        service = createMockNotificationsService();
        const module = await testing_1.Test.createTestingModule({
            controllers: [notifications_controller_1.NotificationsController],
            providers: [{ provide: notifications_service_1.NotificationsService, useValue: service }],
        }).compile();
        controller = module.get(notifications_controller_1.NotificationsController);
    });
    describe('findAll()', () => {
        it('returns all notifications for current user', async () => {
            const notifs = [makeNotif(), makeNotif()];
            service.findAll.mockResolvedValue({ data: notifs, total: 2 });
            const result = await controller.findAll(mockUser, {});
            expect(service.findAll).toHaveBeenCalledWith(mockUser.id, {});
            expect(result.data).toHaveLength(2);
        });
        it('passes unread filter to service', async () => {
            service.findAll.mockResolvedValue({ data: [], total: 0 });
            await controller.findAll(mockUser, { unreadOnly: true });
            expect(service.findAll).toHaveBeenCalledWith(mockUser.id, { unreadOnly: true });
        });
    });
    describe('getUnreadCount()', () => {
        it('returns unread count for user', async () => {
            service.getUnreadCount.mockResolvedValue(5);
            const result = await controller.getUnreadCount(mockUser);
            expect(service.getUnreadCount).toHaveBeenCalledWith(mockUser.id);
            expect(result).toEqual({ count: 5 });
        });
        it('returns 0 when no unread notifications', async () => {
            service.getUnreadCount.mockResolvedValue(0);
            const result = await controller.getUnreadCount(mockUser);
            expect(result).toEqual({ count: 0 });
        });
    });
    describe('markRead()', () => {
        it('marks a single notification as read', async () => {
            const notif = makeNotif({ read_at: new Date() });
            service.markRead.mockResolvedValue(notif);
            const result = await controller.markRead('notif-1', mockUser);
            expect(service.markRead).toHaveBeenCalledWith('notif-1', mockUser.id);
            expect(result.read_at).not.toBeNull();
        });
        it('propagates NotFoundException when notif not found', async () => {
            service.markRead.mockRejectedValue(new common_1.HttpException('Notification not found', common_1.HttpStatus.NOT_FOUND));
            await expect(controller.markRead('bad-id', mockUser)).rejects.toThrow(common_1.HttpException);
        });
    });
    describe('markAllRead()', () => {
        it('marks all notifications as read for user', async () => {
            service.markAllRead.mockResolvedValue({ updated: 7 });
            const result = await controller.markAllRead(mockUser);
            expect(service.markAllRead).toHaveBeenCalledWith(mockUser.id);
            expect(result).toEqual({ updated: 7 });
        });
        it('returns updated:0 when nothing was unread', async () => {
            service.markAllRead.mockResolvedValue({ updated: 0 });
            const result = await controller.markAllRead(mockUser);
            expect(result).toEqual({ updated: 0 });
        });
    });
    describe('delete()', () => {
        it('deletes notification by id', async () => {
            service.delete.mockResolvedValue({ deleted: true });
            const result = await controller.delete('notif-1', mockUser);
            expect(service.delete).toHaveBeenCalledWith('notif-1', mockUser.id);
            expect(result).toEqual({ deleted: true });
        });
        it('propagates NotFoundException for unknown notification', async () => {
            service.delete.mockRejectedValue(new common_1.HttpException('Not found', common_1.HttpStatus.NOT_FOUND));
            await expect(controller.delete('bad-id', mockUser)).rejects.toThrow(common_1.HttpException);
        });
    });
});
//# sourceMappingURL=notifications.controller.spec.js.map