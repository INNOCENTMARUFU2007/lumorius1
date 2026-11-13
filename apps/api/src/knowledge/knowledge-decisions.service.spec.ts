import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KnowledgeDecisionsService } from './knowledge-decisions.service';

describe('KnowledgeDecisionsService', () => {
  let service: KnowledgeDecisionsService;
  let db: { query: jest.Mock; transaction: jest.Mock };
  let publisher: { append: jest.Mock };

  beforeEach(() => {
    db = { query: jest.fn(), transaction: jest.fn() };
    publisher = { append: jest.fn().mockResolvedValue({ eventId: 'event-1', duplicate: false, deliveriesInserted: 1 }) };
    service = new KnowledgeDecisionsService(db as unknown as DatabaseService, publisher as never);
  });

  it('rejects an empty decision title', async () => {
    await expect(service.createDecision('org-1', 'user-1', 'member', { title: '  ' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('prevents viewers from creating decisions', async () => {
    await expect(service.createDecision('org-1', 'user-1', 'viewer', { title: 'Budget approval' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('normalizes supported decision categories before persistence', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'decision-1',
          title: 'Market expansion',
          decision_type: 'strategic',
          priority: 'high',
          status: 'draft',
          created_by_id: 'user-1',
          owner_id: null,
          team_id: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    db.transaction.mockImplementation(
      async (callback: (value: unknown) => Promise<unknown>) =>
        callback(client),
    );

    await service.createDecision('org-1', 'user-1', 'member', {
      title: 'Market expansion',
      decisionType: ' Strategic ',
      priority: ' HIGH ',
    });

    expect(client.query.mock.calls[0][1][4]).toBe('strategic');
    expect(client.query.mock.calls[0][1][5]).toBe('high');
  });

  it('rejects invalid decision status filters', async () => {
    await expect(service.listDecisions('org-1', 'user-1', 'member', { status: 'complete' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('lists decisions with organisation and team visibility filters', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'decision-1', total_count: 1 }] });
    const result = await service.listDecisions('org-1', 'user-1', 'member');
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(db.query.mock.calls[0][0]).toContain('decision.organization_id = $1::uuid');
    expect(db.query.mock.calls[0][0]).toContain('team_members');
  });

  it('filters decisions by type and priority across the full query', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'decision-1', total_count: 1 }] });
    const result = await service.listDecisions('org-1', 'user-1', 'member', { decisionType: 'strategic', priority: 'high' });
    expect(result.total).toBe(1);
    expect(db.query.mock.calls[0][0]).toContain('decision.decision_type = $6');
    expect(db.query.mock.calls[0][0]).toContain('decision.priority = $7');
    expect(db.query.mock.calls[0][1]).toEqual(['org-1', false, 'user-1', null, null, 'strategic', 'high', 25, 0]);
  });

  it('rejects unsupported decision type and priority filters', async () => {
    await expect(service.listDecisions('org-1', 'user-1', 'member', { decisionType: 'unknown' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.listDecisions('org-1', 'user-1', 'member', { priority: 'urgent' })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('returns a bounded, ordered page of decision lifecycle history', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'decision-1',
          organization_id: 'org-1',
          title: 'Decision',
          status: 'proposed',
          created_by_id: 'user-1',
          owner_id: null,
          team_id: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ total: '30' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'review-26' }] });

    const result = await service.getHistoryPage(
      'decision-1',
      'org-1',
      'user-1',
      'member',
      { limit: '5', offset: '25' },
    );

    expect(result).toEqual({
      items: [{ id: 'review-26' }],
      total: 30,
      limit: 5,
      offset: 25,
    });
    expect(db.query.mock.calls[2][0]).toContain(
      'ORDER BY review.created_at DESC, review.id DESC',
    );
    expect(db.query.mock.calls[2][0]).toContain('LIMIT $3 OFFSET $4');
    expect(db.query.mock.calls[2][1]).toEqual([
      'org-1',
      'decision-1',
      5,
      25,
    ]);
  });

  it('rejects invalid decision history pagination values', async () => {
    await expect(
      service.getHistoryPage(
        'decision-1',
        'org-1',
        'user-1',
        'member',
        { offset: '-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('records approval and an audit event in one transaction', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'decision-1', status: 'proposed', created_by_id: 'user-1', owner_id: null, team_id: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'decision-1', status: 'approved' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    db.transaction.mockImplementation(async (callback: (value: unknown) => Promise<unknown>) => callback(client));
    const result = await service.transitionDecision('decision-1', 'org-1', 'user-1', 'member', 'approved');
    expect(result.status).toBe('approved');
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[2][0]).toContain('INSERT INTO knowledge_decision_reviews');
    expect(publisher.append).toHaveBeenCalledWith(client, expect.objectContaining({ eventType: 'decision.approved', aggregateId: 'decision-1' }), ['luie.legacy-domain-bridge']);
  });

  it('rejects invalid lifecycle transitions', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'decision-1', status: 'draft', created_by_id: 'user-1', owner_id: null, team_id: null }] }) };
    db.transaction.mockImplementation(async (callback: (value: unknown) => Promise<unknown>) => callback(client));
    await expect(service.transitionDecision('decision-1', 'org-1', 'user-1', 'member', 'approved'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('requires an explanation before rejecting a decision', async () => {
    await expect(service.transitionDecision('decision-1', 'org-1', 'user-1', 'member', 'rejected', 'no'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects unsupported evidence link types', async () => {
    await expect(service.addLink('decision-1', 'org-1', 'user-1', 'member', 'email', 'link-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each(['goal', 'objective'])(
    'resolves %s links against Founder OS objectives',
    async (linkType) => {
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'd1ba8d1e-15e6-4c5b-8c6e-7f5468ece9f6',
            status: 'draft',
            created_by_id: 'user-1',
            owner_id: null,
            team_id: null,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ label: 'Founder objective' }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'link-1',
            linkType,
            linkedId: '4b09e05b-7c12-4df1-9e13-7a2c8a6d59b1',
            linkLabel: 'Founder objective',
          }],
        });

      const result = await service.addLink(
        'd1ba8d1e-15e6-4c5b-8c6e-7f5468ece9f6',
        'org-1',
        'user-1',
        'member',
        linkType,
        '4b09e05b-7c12-4df1-9e13-7a2c8a6d59b1',
      );

      expect(db.query).toHaveBeenCalledTimes(3);
      expect(db.query.mock.calls[1][0]).toContain('FROM objectives');
      expect(db.query.mock.calls[1][0]).not.toContain('FROM goals');
      expect(db.query.mock.calls[1][1]).toEqual(['org-1', '4b09e05b-7c12-4df1-9e13-7a2c8a6d59b1']);
      expect(result.linkLabel).toBe('Founder objective');
      expect(result.linkType).toBe(linkType);
    },
  );
  it('rejects malformed linked record UUID before querying the database', async () => {
    await expect(
      service.addLink(
        'd1ba8d1e-15e6-4c5b-8c6e-7f5468ece9f6',
        'org-1',
        'user-1',
        'member',
        'objective',
        'not-a-valid-uuid',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects malformed decision UUID before querying the database', async () => {
    await expect(
      service.addLink(
        'not-a-valid-uuid',
        'org-1',
        'user-1',
        'member',
        'objective',
        'd1ba8d1e-15e6-4c5b-8c6e-7f5468ece9f6',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.query).not.toHaveBeenCalled();
  });
  it('returns live execution metrics from linked task records', async () => {
    const decisionId = 'd1ba8d1e-15e6-4c5b-8c6e-7f5468ece9f6';
    const completedTaskId = '11111111-1111-4111-8111-111111111111';
    const overdueTaskId = '22222222-2222-4222-8222-222222222222';

    const decision = {
      id: decisionId,
      organization_id: 'org-1',
      title: 'Launch strategic initiative',
      status: 'approved',
      created_by_id: 'user-1',
      owner_id: null,
      team_id: null,
    };

    const pastDue = new Date(Date.now() - 86400000);

    db.query
      .mockResolvedValueOnce({ rows: [decision] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'link-1',
            linkType: 'task',
            linkedId: completedTaskId,
            linkLabel: 'Completed task',
          },
          {
            id: 'link-2',
            linkType: 'task',
            linkedId: overdueTaskId,
            linkLabel: 'Overdue task',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ label: 'Completed task' }] })
      .mockResolvedValueOnce({ rows: [{ label: 'Overdue task' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: completedTaskId,
            title: 'Completed task',
            status: 'done',
            priority: 'high',
            assignee_id: null,
            assignee_name: null,
            due_date: pastDue,
            completed_at: new Date(),
          },
          {
            id: overdueTaskId,
            title: 'Overdue task',
            status: 'todo',
            priority: 'medium',
            assignee_id: null,
            assignee_name: null,
            due_date: pastDue,
            completed_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [decision] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.getDecision(
      decisionId,
      'org-1',
      'user-1',
      'member',
    );

    expect(result.execution.total).toBe(2);
    expect(result.execution.completed).toBe(1);
    expect(result.execution.inProgress).toBe(0);
    expect(result.execution.todo).toBe(1);
    expect(result.execution.overdue).toBe(1);
    expect(result.execution.completionPercent).toBe(50);
    expect(result.execution.tasks).toHaveLength(2);

    const overdueTask = result.execution.tasks.find(
      task => task.id === overdueTaskId,
    );

    const completedTask = result.execution.tasks.find(
      task => task.id === completedTaskId,
    );

    expect(overdueTask?.is_overdue).toBe(true);
    expect(completedTask?.is_overdue).toBe(false);

    const executionQuery = db.query.mock.calls[4];

    expect(executionQuery[0]).toContain('JOIN tasks task');
    expect(executionQuery[0]).toContain('task.organization_id = $1::uuid');
    expect(executionQuery[0]).toContain('team_members');
    expect(executionQuery[1]).toEqual([
      'org-1',
      decisionId,
      false,
      'user-1',
    ]);
  });
it('classifies linked tasks and creates decision-level execution risk alerts', async () => {
    const decisionId = 'd1ba8d1e-15e6-4c5b-8c6e-7f5468ece9f6';
    const stalledTaskId = '33333333-3333-4333-8333-333333333333';
    const unassignedTaskId = '44444444-4444-4444-8444-444444444444';
    const completedTaskId = '55555555-5555-4555-8555-555555555555';
    const decision = {
      id: decisionId,
      organization_id: 'org-1',
      title: 'Launch strategic initiative',
      status: 'approved',
      created_by_id: 'user-1',
      owner_id: null,
      team_id: null,
    };
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const twoDaysAhead = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    db.query
      .mockResolvedValueOnce({ rows: [decision] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: stalledTaskId,
            title: 'Stalled task',
            status: 'in_progress',
            priority: 'high',
            assignee_id: 'user-2',
            assignee_name: 'Team member',
            due_date: twoDaysAhead,
            completed_at: null,
            updated_at: eightDaysAgo,
            created_at: eightDaysAgo,
          },
          {
            id: unassignedTaskId,
            title: 'Unassigned overdue task',
            status: 'todo',
            priority: 'medium',
            assignee_id: null,
            assignee_name: null,
            due_date: yesterday,
            completed_at: null,
            updated_at: yesterday,
            created_at: yesterday,
          },
          {
            id: completedTaskId,
            title: 'Completed task',
            status: 'done',
            priority: 'low',
            assignee_id: null,
            assignee_name: null,
            due_date: yesterday,
            completed_at: new Date(),
            updated_at: eightDaysAgo,
            created_at: eightDaysAgo,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [decision] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.getDecision(
      decisionId,
      'org-1',
      'user-1',
      'member',
    );

    expect(result.execution.total).toBe(3);
    expect(result.execution.completed).toBe(1);
    expect(result.execution.inProgress).toBe(1);
    expect(result.execution.todo).toBe(1);
    expect(result.execution.overdue).toBe(1);
    expect(result.execution.stalled).toBe(1);
    expect(result.execution.unassigned).toBe(1);
    expect(result.execution.onTrack).toBe(0);
    expect(result.execution.health).toBe('at_risk');
    expect(result.execution.completionPercent).toBe(33);
    expect(result.execution.alerts.map(alert => alert.type).sort()).toEqual([
      'overdue',
      'stalled',
      'unassigned',
    ]);

    const stalledTask = result.execution.tasks.find(task => task.id === stalledTaskId);
    const unassignedTask = result.execution.tasks.find(task => task.id === unassignedTaskId);
    const completedTask = result.execution.tasks.find(task => task.id === completedTaskId);

    expect(stalledTask?.health).toBe('stalled');
    expect(stalledTask?.is_stalled).toBe(true);
    expect(unassignedTask?.health).toBe('overdue');
    expect(unassignedTask?.is_overdue).toBe(true);
    expect(unassignedTask?.is_unassigned).toBe(true);
    expect(completedTask?.health).toBe('completed');
    expect(completedTask?.is_overdue).toBe(false);
    expect(completedTask?.is_unassigned).toBe(false);

    const executionQuery = db.query.mock.calls[2];
    expect(executionQuery[0]).toContain('task.updated_at');
    expect(executionQuery[0]).toContain('task.created_at');
    expect(executionQuery[0]).toContain('team_members');
  });

  it('requires an explicit assessment and actual outcome before completing a review', async () => {
    await expect(
      service.transitionDecision(
        'decision-1', 'org-1', 'user-1', 'member', 'reviewed',
        'Outcome review completed', 'The target was achieved successfully.',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('persists an explicit outcome assessment in the decision and audit history', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{
        id: 'decision-1', status: 'implemented', created_by_id: 'user-1', owner_id: null, team_id: null,
      }] })
      .mockResolvedValueOnce({ rows: [{ id: 'decision-1', status: 'reviewed', outcome_assessment: 'achieved' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    db.transaction.mockImplementation(async (callback: (value: unknown) => Promise<unknown>) => callback(client));

    const result = await service.transitionDecision(
      'decision-1', 'org-1', 'user-1', 'member', 'reviewed',
      'Outcome review completed', 'The expected target was achieved successfully.', 'achieved',
    );

    expect(result.outcome_assessment).toBe('achieved');
    expect(client.query.mock.calls[1][0]).toContain('outcome_assessment');
    expect(client.query.mock.calls[1][1]).toContain('achieved');
    expect(client.query.mock.calls[2][0]).toContain('outcome_assessment');
    expect(client.query.mock.calls[2][1]).toContain('achieved');
  });

  it('calculates team-scoped outcome rates and returns the review queue', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{
        implemented: 4,
        reviewed: 3,
        assessed: 3,
        achieved: 1,
        partially_achieved: 1,
        not_achieved: 1,
        inconclusive: 0,
        overdue_reviews: 2,
        due_soon_reviews: 1,
        missing_review_date: 1,
        missing_expected_outcome: 0,
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'decision-2',
        title: 'Review regional launch',
        priority: 'high',
        reviewDueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        expectedOutcome: 'Reach target adoption',
        ownerName: 'Decision owner',
      }] });

    const result = await service.getOutcomeAnalytics('org-1', 'user-1', 'member');

    expect(result.implemented).toBe(4);
    expect(result.assessed).toBe(3);
    expect(result.achievementRate).toBe(33);
    expect(result.positiveOutcomeRate).toBe(67);
    expect(result.overdueReviews).toBe(2);
    expect(result.reviewQueue).toHaveLength(1);
    expect(result.reviewQueue[0].isOverdue).toBe(true);
    expect(db.query.mock.calls[0][0]).toContain('decision.organization_id = $1::uuid');
    expect(db.query.mock.calls[0][0]).toContain('team_members');
    expect(db.query.mock.calls[0][1]).toEqual(['org-1', false, 'user-1']);
  });});
