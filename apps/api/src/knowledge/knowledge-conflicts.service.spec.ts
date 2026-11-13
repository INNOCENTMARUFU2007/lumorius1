import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KnowledgeConflictsService } from './knowledge-conflicts.service';

describe('KnowledgeConflictsService', () => {
  let service: KnowledgeConflictsService;
  let db: {
    query: jest.Mock;
    transaction: jest.Mock;
  };

  beforeEach(() => {
    db = {
      query: jest.fn(),
      transaction: jest.fn(),
    };
    service = new KnowledgeConflictsService(db as unknown as DatabaseService);
  });

  it('detects only active claims with matching subject, predicate and value type', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'conflict-1' }], rowCount: 1 });

    const result = await service.detectConflicts('org-1', 'user-1', 'member');

    expect(result.detected).toBe(1);
    expect(result.status).toBe('proposed');
    expect(db.query.mock.calls[0][0]).toContain("a.status = 'active'");
    expect(db.query.mock.calls[0][0]).toContain('b.subject_key = a.subject_key');
    expect(db.query.mock.calls[0][0]).toContain('b.predicate_key = a.predicate_key');
    expect(db.query.mock.calls[0][0]).toContain('b.value_type = a.value_type');
    expect(result.message).toContain('No claim was automatically confirmed');
  });

  it('returns both claims and their evidence while mapping JSON evidence safely', async () => {
    db.query.mockResolvedValue({
      rows: [{
        id: 'conflict-1',
        status: 'proposed',
        conflictType: 'value_mismatch',
        detectionReason: 'Potential mismatch',
        claimAId: 'claim-a',
        claimASubject: 'Lumorius',
        claimAPredicate: 'HAS_MONTHLY_PRICE',
        claimAObject: 'USD 49',
        claimAValueType: 'currency',
        claimAIsNegated: false,
        claimAConfidence: '0.9',
        claimAEvidence: '[{"quote":"price is USD 49"}]',
        claimBId: 'claim-b',
        claimBSubject: 'Lumorius',
        claimBPredicate: 'HAS_MONTHLY_PRICE',
        claimBObject: 'USD 99',
        claimBValueType: 'currency',
        claimBIsNegated: false,
        claimBConfidence: '0.8',
        claimBEvidence: [{ quote: 'price is USD 99' }],
        totalCount: '1',
      }],
    });

    const result = await service.listConflicts('org-1', 'user-1', 'owner');

    expect(result.total).toBe(1);
    expect(result.items[0].claimA.object).toBe('USD 49');
    expect(result.items[0].claimA.evidence).toHaveLength(1);
    expect(result.items[0].claimB.object).toBe('USD 99');
    expect(result.items[0].claimB.evidence).toHaveLength(1);
    expect(db.query.mock.calls[0][1][1]).toBe(true);
  });

  it('rejects unsupported status filters before querying the database', async () => {
    await expect(
      service.listConflicts('org-1', 'user-1', 'member', { status: 'everything' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('records a proposed-to-confirmed review and writes an audit event transactionally', async () => {
    const client = { query: jest.fn() };
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'conflict-1', status: 'proposed' }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'conflict-1',
          status: 'confirmed',
          reviewed_at: new Date('2026-11-01T00:00:00Z'),
          resolution_note: null,
        }],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    db.transaction.mockImplementation(async (callback: (value: unknown) => Promise<unknown>) => callback(client));

    const result = await service.reviewConflict(
      'conflict-1', 'org-1', 'user-1', 'member', 'confirmed', 'Two sources disagree.',
    );

    expect(result.status).toBe('confirmed');
    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[2][0]).toContain('INSERT INTO knowledge_conflict_reviews');
  });

  it('does not allow a dismissed conflict to be confirmed again', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({
        rows: [{ id: 'conflict-1', status: 'dismissed' }],
      }),
    };
    db.transaction.mockImplementation(async (callback: (value: unknown) => Promise<unknown>) => callback(client));

    await expect(
      service.reviewConflict('conflict-1', 'org-1', 'user-1', 'member', 'confirmed'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('requires an explanation before resolving a confirmed conflict', async () => {
    await expect(
      service.reviewConflict('conflict-1', 'org-1', 'user-1', 'member', 'resolved', 'no'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('retrieves the review audit trail using organization and evidence access scope', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'review-1', newStatus: 'confirmed' }] });

    const result = await service.getReviewHistory(
      'conflict-1', 'org-1', 'user-1', 'member',
    );

    expect(result).toHaveLength(1);
    expect(db.query.mock.calls[0][0]).toContain('accessible_documents');
    expect(db.query.mock.calls[0][0]).toContain('review.conflict_id = $4::uuid');
  });
});