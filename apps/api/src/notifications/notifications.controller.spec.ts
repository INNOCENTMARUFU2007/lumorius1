import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// ── Mocks ─────────────────────────────────────────────────────

const createMockNotificationsService = () => ({
  create:          jest.fn(),
  findAll:         jest.fn(),
  findById:        jest.fn(),
  markRead:        jest.fn(),
  markAllRead:     jest.fn(),
  delete:          jest.fn(),
  getUnreadCount:  jest.fn(),
});

const mockUser = {
  id:              'user-1',
  email:           'alice@lumorius.com',
  organization_id: 'org-1',
  role:            'admin',
};

const makeNotif = (overrides: Record<string, unknown> = {}) => ({
  id:              `notif-${Math.random().toString(36).slice(2)}`,
  user_id:         'user-1',
  organization_id: 'org-1',
  type:            'task_assigned',
  title:           'New task assigned',
  message:         'You have been assigned a task',
  read_at:         null,
  created_at:      new Date(),
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: ReturnType<typeof createMockNotificationsService>;

  beforeEach(async () => {
    service = createMockNotificationsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: service }],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  // ── findAll ───────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns all notifications for current user', async () => {
      const notifs = [makeNotif(), makeNotif()];
      service.findAll.mockResolvedValue({ data: notifs, total: 2 });

      const result = await controller.findAll(mockUser as any, {});

      expect(service.findAll).toHaveBeenCalledWith(mockUser.id, {});
      expect(result.data).toHaveLength(2);
    });

    it('passes unread filter to service', async () => {
      service.findAll.mockResolvedValue({ data: [], total: 0 });

      await controller.findAll(mockUser as any, { unreadOnly: true } as any);

      expect(service.findAll).toHaveBeenCalledWith(mockUser.id, { unreadOnly: true });
    });
  });

  // ── getUnreadCount ────────────────────────────────────────────

  describe('getUnreadCount()', () => {
    it('returns unread count for user', async () => {
      service.getUnreadCount.mockResolvedValue(5);

      const result = await controller.getUnreadCount(mockUser as any);

      expect(service.getUnreadCount).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual({ count: 5 });
    });

    it('returns 0 when no unread notifications', async () => {
      service.getUnreadCount.mockResolvedValue(0);
      const result = await controller.getUnreadCount(mockUser as any);
      expect(result).toEqual({ count: 0 });
    });
  });

  // ── markRead ──────────────────────────────────────────────────

  describe('markRead()', () => {
    it('marks a single notification as read', async () => {
      const notif = makeNotif({ read_at: new Date() });
      service.markRead.mockResolvedValue(notif);

      const result = await controller.markRead('notif-1', mockUser as any);

      expect(service.markRead).toHaveBeenCalledWith('notif-1', mockUser.id);
      expect(result.read_at).not.toBeNull();
    });

    it('propagates NotFoundException when notif not found', async () => {
      service.markRead.mockRejectedValue(
        new HttpException('Notification not found', HttpStatus.NOT_FOUND),
      );

      await expect(
        controller.markRead('bad-id', mockUser as any),
      ).rejects.toThrow(HttpException);
    });
  });

  // ── markAllRead ───────────────────────────────────────────────

  describe('markAllRead()', () => {
    it('marks all notifications as read for user', async () => {
      service.markAllRead.mockResolvedValue({ updated: 7 });

      const result = await controller.markAllRead(mockUser as any);

      expect(service.markAllRead).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual({ updated: 7 });
    });

    it('returns updated:0 when nothing was unread', async () => {
      service.markAllRead.mockResolvedValue({ updated: 0 });
      const result = await controller.markAllRead(mockUser as any);
      expect(result).toEqual({ updated: 0 });
    });
  });

  // ── delete ────────────────────────────────────────────────────

  describe('delete()', () => {
    it('deletes notification by id', async () => {
      service.delete.mockResolvedValue({ deleted: true });

      const result = await controller.delete('notif-1', mockUser as any);

      expect(service.delete).toHaveBeenCalledWith('notif-1', mockUser.id);
      expect(result).toEqual({ deleted: true });
    });

    it('propagates NotFoundException for unknown notification', async () => {
      service.delete.mockRejectedValue(
        new HttpException('Not found', HttpStatus.NOT_FOUND),
      );

      await expect(
        controller.delete('bad-id', mockUser as any),
      ).rejects.toThrow(HttpException);
    });
  });
});
