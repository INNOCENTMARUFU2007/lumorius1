import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import {
  createMockDatabaseService,
  pgResult,
  makeNotification,
  FIXED_UUID,
  FIXED_UUID_2,
} from '../test/helpers';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
}));

describe('NotificationsService', () => {
  let service: NotificationsService;
  let db: ReturnType<typeof createMockDatabaseService>;

  beforeEach(async () => {
    db = createMockDatabaseService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: 'DatabaseService', useValue: db },
      ],
    })
      .overrideProvider(NotificationsService)
      .useFactory({
        factory: () =>
          new (NotificationsService as new (...args: unknown[]) => NotificationsService)(
            db as never,
          ),
      })
      .compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  // â”€â”€ create â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('create()', () => {
    it('inserts notification and returns the new id', async () => {
      db.query.mockResolvedValueOnce(pgResult([]));

      const result = await service.create({
        userId: FIXED_UUID,
        organizationId: FIXED_UUID_2,
        type: 'task_assigned',
        title: 'New task: Write tests',
        message: 'Assigned by Alice',
        data: { taskId: FIXED_UUID },
      });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        [FIXED_UUID, FIXED_UUID, FIXED_UUID_2, 'task_assigned', 'New task: Write tests',
         'Assigned by Alice', null, JSON.stringify({ taskId: FIXED_UUID })],
      );
      expect(result).toEqual({ id: FIXED_UUID });
    });

    it('inserts with null message and empty data when omitted', async () => {
      db.query.mockResolvedValueOnce(pgResult([]));

      await service.create({
        userId: FIXED_UUID,
        organizationId: FIXED_UUID_2,
        type: 'system',
        title: 'System notification',
      });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        expect.arrayContaining([null, JSON.stringify({})]),
      );
    });
  });

  // â”€â”€ findAll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('findAll()', () => {
    it('returns all notifications for a user', async () => {
      const notifications = [makeNotification(), makeNotification({ id: FIXED_UUID_2 })];
      db.query.mockResolvedValueOnce(pgResult(notifications));

      const result = await service.findAll(FIXED_UUID);

      expect(result).toHaveLength(2);
      const query = db.query.mock.calls[0][0] as string;
      expect(query).not.toContain('read_at IS NULL');
    });

    it('filters unread notifications when unreadOnly is true', async () => {
      db.query.mockResolvedValueOnce(pgResult([makeNotification()]));

      await service.findAll(FIXED_UUID, true);

      const query = db.query.mock.calls[0][0] as string;
      expect(query).toContain('read_at IS NULL');
    });

    it('returns empty array when user has no notifications', async () => {
      db.query.mockResolvedValueOnce(pgResult([]));

      const result = await service.findAll(FIXED_UUID);

      expect(result).toEqual([]);
    });

    it('limits results to 50', async () => {
      db.query.mockResolvedValueOnce(pgResult([]));

      await service.findAll(FIXED_UUID);

      const query = db.query.mock.calls[0][0] as string;
      expect(query).toContain('LIMIT 50');
    });
  });

  // â”€â”€ markRead â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('markRead()', () => {
    it('marks a specific notification as read', async () => {
      db.query.mockResolvedValueOnce(pgResult([{ id: FIXED_UUID_2 }]));

      const result = await service.markRead(FIXED_UUID, FIXED_UUID_2);

      const updateSql = db.query.mock.calls[0][0] as string;
      expect(updateSql.replace(/\s+/g, ' ').trim()).toBe(
        'UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND user_id = $2 RETURNING id',
      );
      expect(db.query.mock.calls[0][1]).toEqual([FIXED_UUID_2, FIXED_UUID]);
      expect(result).toEqual({ read: true });
    });
  });

  // â”€â”€ markAllRead â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('markAllRead()', () => {
    it('marks all unread notifications as read for the user', async () => {
      db.query.mockResolvedValueOnce({ ...pgResult([]), rowCount: 4 });

      const result = await service.markAllRead(FIXED_UUID);

      const updateSql = db.query.mock.calls[0][0] as string;
      expect(updateSql.replace(/\s+/g, ' ').trim()).toBe(
        'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
      );
      expect(db.query.mock.calls[0][1]).toEqual([FIXED_UUID]);
      expect(result).toEqual({ read: true, updated: 4 });
    });
  });

  // â”€â”€ getUnreadCount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('getUnreadCount()', () => {
    it('returns the unread notification count', async () => {
      db.query.mockResolvedValueOnce(pgResult([{ count: '7' }]));

      const result = await service.getUnreadCount(FIXED_UUID);

      expect(result).toEqual({ count: 7 });
      const countSql = db.query.mock.calls[0][0] as string;
      expect(countSql.replace(/\s+/g, ' ').trim()).toBe(
        'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      );
      expect(db.query.mock.calls[0][1]).toEqual([FIXED_UUID]);
    });

    it('returns 0 when there are no unread notifications', async () => {
      db.query.mockResolvedValueOnce(pgResult([{ count: '0' }]));

      const result = await service.getUnreadCount(FIXED_UUID);

      expect(result).toEqual({ count: 0 });
    });

    it('returns 0 gracefully when count row is missing', async () => {
      db.query.mockResolvedValueOnce(pgResult([]));

      const result = await service.getUnreadCount(FIXED_UUID);

      expect(result).toEqual({ count: 0 });
    });
  });
});


