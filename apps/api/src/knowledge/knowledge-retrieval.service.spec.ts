import { KnowledgeRetrievalService } from './knowledge-retrieval.service';

describe('KnowledgeRetrievalService AI usage metering', () => {
  let service: KnowledgeRetrievalService;
  let db: { query: jest.Mock };
  let ai: { createEmbedding: jest.Mock };

  beforeEach(() => {
    db = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };
    ai = {
      createEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.001)),
    };
    service = new KnowledgeRetrievalService(db as never, ai as never);
  });

  it('records retrieval embeddings against the requesting organization and user', async () => {
    await service.retrieve({
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'member',
      query: 'Revenue forecast',
    });

    expect(ai.createEmbedding).toHaveBeenCalledWith('Revenue forecast', {
      organizationId: 'org-1',
      userId: 'user-1',
      feature: 'knowledge_retrieval',
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('continues with full-text retrieval when embedding generation fails', async () => {
    ai.createEmbedding.mockRejectedValueOnce(new Error('Embedding provider unavailable'));

    const result = await service.retrieve({
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'member',
      query: 'Revenue forecast',
    });

    expect(result.retrievalMode).toBe('full_text');
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('rejects missing user context before making AI or database calls', async () => {
    await expect(service.retrieve({
      organizationId: 'org-1',
      userId: '',
      role: 'member',
      query: 'Revenue forecast',
    })).rejects.toThrow('Authenticated organization and user context are required.');

    expect(ai.createEmbedding).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('combines document evidence with team-scoped operational sources', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        source_type: 'task',
        source_id: 'task-1',
        title: 'Renew customer contract',
        excerpt: 'Status: in progress',
        updated_at: new Date('2026-11-13T10:00:00.000Z'),
        team_id: 'team-1',
        relevance_score: 0.75,
      }] });

    const result = await service.retrieveUnified({
      organizationId: 'org-1',
      userId: 'user-1',
      role: 'member',
      teamId: 'team-1',
      query: 'customer contract',
      limit: 6,
    });

    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][0]).toContain('FROM tasks task');
    expect(db.query.mock.calls[1][0]).toContain('FROM meetings meeting');
    expect(db.query.mock.calls[1][0]).toContain('FROM knowledge_decisions decision');
    expect(db.query.mock.calls[1][0]).toContain('AND $3::boolean = TRUE');
    expect(db.query.mock.calls[1][1]).toEqual([
      'org-1', 'customer contract', false, 'user-1', 'team-1', 6,
    ]);
    expect(result.sources).toEqual([
      expect.objectContaining({
        citationId: 'S1',
        sourceType: 'task',
        sourceId: 'task-1',
      }),
    ]);
  });
});