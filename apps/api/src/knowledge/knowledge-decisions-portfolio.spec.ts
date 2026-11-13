import { DatabaseService } from '../database/database.service';
import { KnowledgeDecisionsService } from './knowledge-decisions.service';

describe('KnowledgeDecisionsService portfolio analytics', () => {
  let service: KnowledgeDecisionsService;
  let db: { query: jest.Mock };

  beforeEach(() => {
    db = { query: jest.fn() };
    service = new KnowledgeDecisionsService(db as unknown as DatabaseService, { append: jest.fn().mockResolvedValue({ eventId: 'event-1', duplicate: false, deliveriesInserted: 1 }) } as never);
  });

  it('returns portfolio KPIs, lifecycle velocity, category and team metrics, trends and bottlenecks', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        summary: {
          total: 12, draft: 1, proposed: 2, approved: 1, rejected: 1,
          implemented: 3, reviewed: 3, withdrawn: 1, active: 6,
          assessed: 3, achieved: 1, partially_achieved: 1,
          not_achieved: 1, inconclusive: 0,
        },
        velocity: {
          proposal_to_approval_hours: '12.5',
          approval_to_implementation_hours: '48.0',
          implementation_to_review_hours: null,
        },
        categories: [{
          decisionType: 'strategic', decisions: 5, assessed: 2, achieved: 1,
          partiallyAchieved: 1, notAchieved: 0, inconclusive: 0,
          positiveOutcomeRate: 100,
        }],
        teams: [{
          teamId: 'team-1', teamName: 'Engineering', decisions: 4,
          implemented: 2, reviewed: 2, assessed: 2, achieved: 1,
          partiallyAchieved: 1, positiveOutcomeRate: 100,
        }],
        monthly_trend: [{
          month: '2026-11', label: 'Nov 26', created: 2, proposed: 1,
          approved: 1, implemented: 1, reviewed: 1,
        }],
        bottlenecks: {
          overdue_decisions: 2, overdue_reviews: 1, unassigned_active: 1,
          missing_review_dates: 1, missing_expected_outcomes: 2,
          pending_approval: 2, awaiting_implementation: 1,
        },
      }],
    });

    const result = await service.getPortfolioAnalytics('org-1', 'user-1', 'member');

    expect(result.summary.total).toBe(12);
    expect(result.summary.positiveOutcomeRate).toBe(67);
    expect(result.velocity.proposalToApprovalHours).toBe(12.5);
    expect(result.velocity.approvalToImplementationHours).toBe(48);
    expect(result.velocity.implementationToReviewHours).toBeNull();
    expect(result.categories[0].decisionType).toBe('strategic');
    expect(result.teams[0].teamName).toBe('Engineering');
    expect(result.monthlyTrend[0].created).toBe(2);
    expect(result.bottlenecks.overdueDecisions).toBe(2);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('knowledge_decision_reviews');
    expect(sql).toContain('team_members');
    expect(sql).toContain('generate_series');
    expect(sql).toContain('decision.organization_id = $1::uuid');
    expect(params).toEqual(['org-1', false, 'user-1']);
  });

  it('returns safe zero-value defaults when the aggregate query has no row', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const result = await service.getPortfolioAnalytics('org-1', 'user-1', 'viewer');

    expect(result.summary.total).toBe(0);
    expect(result.summary.positiveOutcomeRate).toBeNull();
    expect(result.categories).toEqual([]);
    expect(result.teams).toEqual([]);
    expect(result.monthlyTrend).toEqual([]);
    expect(result.bottlenecks.overdueDecisions).toBe(0);
    expect(db.query.mock.calls[0][1]).toEqual(['org-1', false, 'user-1']);
  });
});
