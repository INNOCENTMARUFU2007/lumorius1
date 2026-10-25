import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// â”€â”€ Mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  sub:             'user-1',
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

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ findAll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('findAll()', () => {
    it('returns all notifications for current user', async () => {
      const notifs = [makeNotif(), makeNotif()];
      service.findAll.mockResolvedValue(notifs);

      const result = await controller.findAll(mockUser as any);

      expect(service.findAll).toHaveBeenCalledWith(mockUser.sub, false);
      expect(result).toHaveLength(2);
    });

    it('passes unread filter to service', async () => {
      service.findAll.mockResolvedValue([]);

      await controller.findAll(mockUser as any, 'true');

      expect(service.findAll).toHaveBeenCalledWith(mockUser.sub, true);
    });
  });

  // â”€â”€ getUnreadCount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('getUnreadCount()', () => {
    it('returns unread count for user', async () => {
      service.getUnreadCount.mockResolvedValue({ count: 5 });

      const result = await controller.getUnreadCount(mockUser as any);

      expect(service.getUnreadCount).toHaveBeenCalledWith(mockUser.sub);
      expect(result).toEqual({ count: 5 });
    });

    it('returns 0 when no unread notifications', async () => {
      service.getUnreadCount.mockResolvedValue({ count: 0 });
      const result = await controller.getUnreadCount(mockUser as any);
      expect(result).toEqual({ count: 0 });
    });
  });

  // â”€â”€ markRead â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('markRead()', () => {
    it('marks a single notification as read', async () => {

      service.markRead.mockResolvedValue({ read: true });

      const result = await controller.markRead(mockUser as any, 'notif-1');

      expect(service.markRead).toHaveBeenCalledWith(mockUser.sub, 'notif-1');
      expect(result).toEqual({ read: true });
    });

    it('propagates NotFoundException when notif not found', async () => {
      service.markRead.mockRejectedValue(
        new HttpException('Notification not found', HttpStatus.NOT_FOUND),
      );

      await expect(
        controller.markRead(mockUser as any, 'bad-id'),
      ).rejects.toThrow(HttpException);
    });
  });

  // â”€â”€ markAllRead â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('markAllRead()', () => {
    it('marks all notifications as read for user', async () => {
      service.markAllRead.mockResolvedValue({ read: true, updated: 7 });

      const result = await controller.markAllRead(mockUser as any);

      expect(service.markAllRead).toHaveBeenCalledWith(mockUser.sub);
      expect(result).toEqual({ read: true, updated: 7 });
    });

    it('returns updated:0 when nothing was unread', async () => {
      service.markAllRead.mockResolvedValue({ read: true, updated: 0 });
      const result = await controller.markAllRead(mockUser as any);
      expect(result).toEqual({ read: true, updated: 0 });
    });
  });

  // â”€â”€ delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('delete()', () => {
    it('deletes notification by id', async () => {
      service.delete.mockResolvedValue({ deleted: true, id: 'notif-1' });

      const result = await controller.delete(mockUser as any, 'notif-1');

      expect(service.delete).toHaveBeenCalledWith(mockUser.sub, 'notif-1');
      expect(result).toEqual({ deleted: true, id: 'notif-1' });
    });

    it('propagates NotFoundException for unknown notification', async () => {
      service.delete.mockRejectedValue(
        new HttpException('Not found', HttpStatus.NOT_FOUND),
      );

      await expect(
        controller.delete(mockUser as any, 'bad-id'),
      ).rejects.toThrow(HttpException);
    });
  });
});

