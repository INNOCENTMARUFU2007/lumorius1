import { KnowledgeAnalyticsService } from './knowledge-analytics.service';
import { DatabaseService } from '../database/database.service';

describe('KnowledgeAnalyticsService', () => {
  let service: KnowledgeAnalyticsService;
  let db: { query: jest.Mock };

  const sampleRow = {
    indexedDocuments: '12',
    entities: '40',
    relationships: '68',
    evidenceRecords: '155',
    activeEvidence: '140',
    disputedEvidence: '3',
    supersededEvidence: '12',
    entityAliases: '35',
    completedExtractions: '10',
    pendingExtractions: '1',
    failedExtractions: '1',
    extractionCoveragePercent: '83.3',
    evidenceLast7Days: '20',
    evidenceLast30Days: '70',
    entityTypes: [
      { type: 'organization', count: 5 },
      { type: 'product', count: 12 },
    ],
  };

  beforeEach(() => {
    db = {
      query: jest.fn().mockResolvedValue({
        rows: [sampleRow],
      }),
    };

    service = new KnowledgeAnalyticsService(
      db as unknown as DatabaseService,
    );
  });

  it('returns normalized analytics counts and entity types', async () => {
    const result = await service.getAnalytics(
      'organization-id',
      'user-id',
      'member',
    );

    expect(result.indexedDocuments).toBe(12);
    expect(result.entities).toBe(40);
    expect(result.relationships).toBe(68);
    expect(result.evidenceRecords).toBe(155);
    expect(result.extractionCoveragePercent).toBe(83.3);
    expect(result.entityTypes).toEqual([
      { type: 'organization', count: 5 },
      { type: 'product', count: 12 },
    ]);
  });

  it('uses organization-wide visibility for privileged roles', async () => {
    await service.getAnalytics(
      'organization-id',
      'owner-id',
      'owner',
    );

    const values = db.query.mock.calls[0][1];

    expect(values).toEqual([
      'organization-id',
      true,
      'owner-id',
    ]);
  });

  it('restricts ordinary users to their accessible teams', async () => {
    await service.getAnalytics(
      'organization-id',
      'member-id',
      'member',
    );

    const values = db.query.mock.calls[0][1];

    expect(values).toEqual([
      'organization-id',
      false,
      'member-id',
    ]);

    expect(db.query.mock.calls[0][0]).toContain('team_members');
  });

  it('returns no fabricated counts when there is no result row', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.getAnalytics(
        'organization-id',
        'user-id',
        'member',
      ),
    ).rejects.toThrow('Knowledge analytics query returned no result.');
  });
});