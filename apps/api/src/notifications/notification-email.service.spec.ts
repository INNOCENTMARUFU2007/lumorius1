import { Test, TestingModule } from '@nestjs/testing';
import { NotificationEmailService } from './notification-email.service';
import {
  createMockDatabaseService,
  createMockEmailService,
  createMockNotificationsService,
  pgResult,
  makeUser,
  FIXED_UUID,
  FIXED_UUID_2,
  FIXED_UUID_3,
} from '../test/helpers';

describe('NotificationEmailService', () => {
  let service: NotificationEmailService;
  let db: ReturnType<typeof createMockDatabaseService>;
  let emailService: ReturnType<typeof createMockEmailService>;
  let notificationsService: ReturnType<typeof createMockNotificationsService>;

  const defaultUser = makeUser({ id: FIXED_UUID, email: 'alice@example.com', name: 'Alice Tester', is_active: true });

  beforeEach(async () => {
    db = createMockDatabaseService();
    emailService = createMockEmailService();
    notificationsService = createMockNotificationsService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEmailService,
        { provide: 'DatabaseService', useValue: db },
        { provide: 'EmailService', useValue: emailService },
        { provide: 'NotificationsService', useValue: notificationsService },
      ],
    })
      .overrideProvider(NotificationEmailService)
      .useFactory({
        factory: () =>
          new (NotificationEmailService as new (...args: unknown[]) => NotificationEmailService)(
            db as never,
            emailService as never,
            notificationsService as never,
          ),
      })
      .compile();

    service = module.get<NotificationEmailService>(NotificationEmailService);
    jest.clearAllMocks();
  });

  // ── handleTaskAssigned ────────────────────────────────────

  describe('handleTaskAssigned()', () => {
    const payload = {
      taskId: FIXED_UUID,
      taskTitle: 'Write integration tests',
      assigneeId: FIXED_UUID,
      assignerName: 'Bob Manager',
      organizationId: FIXED_UUID_2,
      priority: 'high',
      dueDate: '2026-07-01',
    };

    it('sends task assignment email and creates in-app notification', async () => {
      db.findOne.mockResolvedValueOnce(defaultUser);

      await service.handleTaskAssigned(payload);

      expect(emailService.sendTaskAssigned).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice Tester',
        'Write integration tests',
        FIXED_UUID,
        'Bob Manager',
        'high',
        '2026-07-01',
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: FIXED_UUID,
          organizationId: FIXED_UUID_2,
          type: 'task_assigned',
          title: expect.stringContaining('Write integration tests'),
          message: expect.stringContaining('Bob Manager'),
        }),
      );
    });

    it('silently skips when assignee user is not found', async () => {
      db.findOne.mockResolvedValueOnce(null);

      await service.handleTaskAssigned(payload);

      expect(emailService.sendTaskAssigned).not.toHaveBeenCalled();
      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('handles email failure gracefully without throwing', async () => {
      db.findOne.mockResolvedValueOnce(defaultUser);
      emailService.sendTaskAssigned.mockRejectedValueOnce(new Error('SMTP timeout'));

      // Should not throw — errors are caught internally
      await expect(service.handleTaskAssigned(payload)).resolves.not.toThrow();
    });
  });

  // ── handleMeetingCompleted ────────────────────────────────

  describe('handleMeetingCompleted()', () => {
    const payload = {
      meetingId: FIXED_UUID,
      meetingTitle: 'Q2 Planning',
      userId: FIXED_UUID,
      organizationId: FIXED_UUID_2,
      summary: 'We discussed roadmap priorities and assigned owners.',
      actionItemCount: 5,
    };

    it('sends meeting ready email and creates notification', async () => {
      db.findOne.mockResolvedValueOnce(defaultUser);

      await service.handleMeetingCompleted(payload);

      expect(emailService.sendMeetingReady).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice Tester',
        'Q2 Planning',
        FIXED_UUID,
        'We discussed roadmap priorities and assigned owners.',
        5,
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'meeting_processed',
          title: expect.stringContaining('Q2 Planning'),
          message: expect.stringContaining('5 action items'),
        }),
      );
    });

    it('uses correct singular for 1 action item', async () => {
      db.findOne.mockResolvedValueOnce(defaultUser);

      await service.handleMeetingCompleted({ ...payload, actionItemCount: 1 });

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('1 action item'),
        }),
      );
      // Should NOT say "1 action items"
      const callArgs = notificationsService.create.mock.calls[0][0];
      expect(callArgs.message).not.toContain('1 action items');
    });

    it('silently skips when user is not found', async () => {
      db.findOne.mockResolvedValueOnce(null);

      await service.handleMeetingCompleted(payload);

      expect(emailService.sendMeetingReady).not.toHaveBeenCalled();
    });
  });

  // ── handleDocumentIndexed ─────────────────────────────────

  describe('handleDocumentIndexed()', () => {
    const payload = {
      documentId: FIXED_UUID,
      documentName: 'Q4 Strategy.pdf',
      uploadedById: FIXED_UUID,
      organizationId: FIXED_UUID_2,
      chunkCount: 42,
    };

    it('sends indexed email and creates notification', async () => {
      db.findOne.mockResolvedValueOnce(defaultUser);

      await service.handleDocumentIndexed(payload);

      expect(emailService.sendDocumentIndexed).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice Tester',
        'Q4 Strategy.pdf',
        FIXED_UUID,
        42,
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'document_indexed',
          title: expect.stringContaining('Q4 Strategy.pdf'),
          message: expect.stringContaining('42'),
          data: expect.objectContaining({ documentId: FIXED_UUID, chunkCount: 42 }),
        }),
      );
    });

    it('silently skips when uploader user is not found', async () => {
      db.findOne.mockResolvedValueOnce(null);

      await service.handleDocumentIndexed(payload);

      expect(emailService.sendDocumentIndexed).not.toHaveBeenCalled();
    });
  });

  // ── handleDocumentFailed ──────────────────────────────────

  describe('handleDocumentFailed()', () => {
    const payload = {
      documentId: FIXED_UUID,
      documentName: 'Corrupted.pdf',
      uploadedById: FIXED_UUID,
      organizationId: FIXED_UUID_2,
      errorMessage: 'PDF is password-protected',
    };

    it('sends failure email and creates notification', async () => {
      db.findOne.mockResolvedValueOnce(defaultUser);

      await service.handleDocumentFailed(payload);

      expect(emailService.sendDocumentFailed).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice Tester',
        'Corrupted.pdf',
        'PDF is password-protected',
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'document_failed',
          title: expect.stringContaining('Corrupted.pdf'),
          data: expect.objectContaining({
            documentId: FIXED_UUID,
            error: 'PDF is password-protected',
          }),
        }),
      );
    });

    it('silently skips when uploader user is not found', async () => {
      db.findOne.mockResolvedValueOnce(null);

      await service.handleDocumentFailed(payload);

      expect(emailService.sendDocumentFailed).not.toHaveBeenCalled();
    });
  });

  // ── handleGoalAchieved ────────────────────────────────────

  describe('handleGoalAchieved()', () => {
    const payload = {
      goalId: FIXED_UUID,
      goalTitle: 'Reach $1M ARR',
      ownerId: FIXED_UUID,
      organizationId: FIXED_UUID_2,
    };

    it('sends goal achieved email and creates notification', async () => {
      db.findOne.mockResolvedValueOnce(defaultUser);

      await service.handleGoalAchieved(payload);

      expect(emailService.sendGoalAchieved).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice Tester',
        'Reach $1M ARR',
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'goal_achieved',
          title: expect.stringContaining('Reach $1M ARR'),
          data: expect.objectContaining({ goalId: FIXED_UUID }),
        }),
      );
    });

    it('silently skips when goal owner is not found', async () => {
      db.findOne.mockResolvedValueOnce(null);

      await service.handleGoalAchieved(payload);

      expect(emailService.sendGoalAchieved).not.toHaveBeenCalled();
    });
  });

  // ── sendOverdueTaskReminders (cron) ───────────────────────

  describe('sendOverdueTaskReminders()', () => {
    it('sends overdue summary to each unique assignee', async () => {
      const overdueTasks = [
        {
          user_id: FIXED_UUID,
          email: 'alice@example.com',
          name: 'Alice Tester',
          organization_id: FIXED_UUID_2,
          task_id: FIXED_UUID_3,
          task_title: 'Ship feature X',
          due_date: '2026-06-01',
          priority: 'high',
        },
        {
          user_id: FIXED_UUID,
          email: 'alice@example.com',
          name: 'Alice Tester',
          organization_id: FIXED_UUID_2,
          task_id: FIXED_UUID_2,
          task_title: 'Fix critical bug',
          due_date: '2026-06-05',
          priority: 'urgent',
        },
      ];
      db.query.mockResolvedValueOnce(pgResult(overdueTasks));

      await service.sendOverdueTaskReminders();

      expect(emailService.sendOverdueTasksSummary).toHaveBeenCalledTimes(1);
      expect(emailService.sendOverdueTasksSummary).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice Tester',
        expect.arrayContaining([
          expect.objectContaining({ title: 'Ship feature X' }),
          expect.objectContaining({ title: 'Fix critical bug' }),
        ]),
      );
    });

    it('does nothing when no overdue tasks exist', async () => {
      db.query.mockResolvedValueOnce(pgResult([]));

      await service.sendOverdueTaskReminders();

      expect(emailService.sendOverdueTasksSummary).not.toHaveBeenCalled();
    });

    it('sends separate emails to different assignees', async () => {
      const overdueTasks = [
        {
          user_id: FIXED_UUID,
          email: 'alice@example.com',
          name: 'Alice Tester',
          organization_id: FIXED_UUID_2,
          task_id: FIXED_UUID_3,
          task_title: 'Alice task',
          due_date: '2026-06-01',
          priority: 'high',
        },
        {
          user_id: FIXED_UUID_2,
          email: 'bob@example.com',
          name: 'Bob Smith',
          organization_id: FIXED_UUID_2,
          task_id: FIXED_UUID_2,
          task_title: 'Bob task',
          due_date: '2026-06-02',
          priority: 'medium',
        },
      ];
      db.query.mockResolvedValueOnce(pgResult(overdueTasks));

      await service.sendOverdueTaskReminders();

      expect(emailService.sendOverdueTasksSummary).toHaveBeenCalledTimes(2);
    });

    it('handles cron DB failure gracefully', async () => {
      db.query.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(service.sendOverdueTaskReminders()).resolves.not.toThrow();
    });
  });

  // ── sendWeeklyDigests (cron) ──────────────────────────────

  describe('sendWeeklyDigests()', () => {
    const mockOrgOwner = { id: FIXED_UUID, email: 'alice@example.com', name: 'Alice Tester' };

    it('sends weekly digest to org owners', async () => {
      // 1. Active orgs query
      db.query
        .mockResolvedValueOnce(pgResult([{ id: FIXED_UUID_2, name: 'Test Corp' }]))
        // 2. owners for that org
        .mockResolvedValueOnce(pgResult([mockOrgOwner]))
        // 3. task stats
        .mockResolvedValueOnce(pgResult([{ completed_this_week: '5', open: '12', urgent_open: '2', overdue: '1' }]))
        // 4. doc stats
        .mockResolvedValueOnce(pgResult([{ uploaded_this_week: '3', total_indexed: '47' }]))
        // 5. meeting stats
        .mockResolvedValueOnce(pgResult([{ this_week: '4', completed: '4' }]))
        // 6. goal stats
        .mockResolvedValueOnce(pgResult([{ active: '6', achieved_this_week: '1' }]));

      await service.sendWeeklyDigests();

      expect(emailService.sendWeeklyDigest).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice Tester',
        'Test Corp',
        {
          tasksCompletedThisWeek: 5,
          openTasks: 12,
          urgentOpenTasks: 2,
          overdueTasks: 1,
          docsUploadedThisWeek: 3,
          totalDocsIndexed: 47,
          meetingsThisWeek: 4,
          meetingsCompleted: 4,
          activeGoals: 6,
          goalsAchievedThisWeek: 1,
        },
      );
    });

    it('sends digest to each owner when org has multiple admins', async () => {
      const owner2 = { id: FIXED_UUID_3, email: 'bob@example.com', name: 'Bob Owner' };

      db.query
        .mockResolvedValueOnce(pgResult([{ id: FIXED_UUID_2, name: 'Multi Corp' }]))
        .mockResolvedValueOnce(pgResult([mockOrgOwner, owner2]))
        .mockResolvedValueOnce(pgResult([{ completed_this_week: '0', open: '0', urgent_open: '0', overdue: '0' }]))
        .mockResolvedValueOnce(pgResult([{ uploaded_this_week: '0', total_indexed: '0' }]))
        .mockResolvedValueOnce(pgResult([{ this_week: '0', completed: '0' }]))
        .mockResolvedValueOnce(pgResult([{ active: '0', achieved_this_week: '0' }]));

      await service.sendWeeklyDigests();

      expect(emailService.sendWeeklyDigest).toHaveBeenCalledTimes(2);
      expect(emailService.sendWeeklyDigest).toHaveBeenCalledWith(
        'alice@example.com', 'Alice Tester', 'Multi Corp', expect.any(Object),
      );
      expect(emailService.sendWeeklyDigest).toHaveBeenCalledWith(
        'bob@example.com', 'Bob Owner', 'Multi Corp', expect.any(Object),
      );
    });

    it('skips orgs gracefully when no active owners exist', async () => {
      db.query
        .mockResolvedValueOnce(pgResult([{ id: FIXED_UUID_2, name: 'Ghost Corp' }]))
        .mockResolvedValueOnce(pgResult([]))  // no owners
        .mockResolvedValueOnce(pgResult([{ completed_this_week: '0', open: '0', urgent_open: '0', overdue: '0' }]))
        .mockResolvedValueOnce(pgResult([{ uploaded_this_week: '0', total_indexed: '0' }]))
        .mockResolvedValueOnce(pgResult([{ this_week: '0', completed: '0' }]))
        .mockResolvedValueOnce(pgResult([{ active: '0', achieved_this_week: '0' }]));

      await service.sendWeeklyDigests();

      expect(emailService.sendWeeklyDigest).not.toHaveBeenCalled();
    });

    it('does nothing when no orgs have active admins', async () => {
      db.query.mockResolvedValueOnce(pgResult([]));

      await service.sendWeeklyDigests();

      expect(emailService.sendWeeklyDigest).not.toHaveBeenCalled();
    });

    it('handles cron DB failure gracefully', async () => {
      db.query.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(service.sendWeeklyDigests()).resolves.not.toThrow();
    });

    it('continues to next owner when one email send fails', async () => {
      const owner2 = { id: FIXED_UUID_3, email: 'bob@example.com', name: 'Bob Owner' };

      db.query
        .mockResolvedValueOnce(pgResult([{ id: FIXED_UUID_2, name: 'Test Corp' }]))
        .mockResolvedValueOnce(pgResult([mockOrgOwner, owner2]))
        .mockResolvedValueOnce(pgResult([{ completed_this_week: '0', open: '0', urgent_open: '0', overdue: '0' }]))
        .mockResolvedValueOnce(pgResult([{ uploaded_this_week: '0', total_indexed: '0' }]))
        .mockResolvedValueOnce(pgResult([{ this_week: '0', completed: '0' }]))
        .mockResolvedValueOnce(pgResult([{ active: '0', achieved_this_week: '0' }]));

      emailService.sendWeeklyDigest
        .mockRejectedValueOnce(new Error('SMTP error'))   // Alice fails
        .mockResolvedValueOnce(undefined);                  // Bob succeeds

      await expect(service.sendWeeklyDigests()).resolves.not.toThrow();
      expect(emailService.sendWeeklyDigest).toHaveBeenCalledTimes(2);
    });
  });
});
