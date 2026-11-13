import { KnowledgeExtractionService } from './knowledge-extraction.service';

describe('KnowledgeExtractionService extraction validation', () => {
  let service: KnowledgeExtractionService;
  let db: any;
  let ai: any;

  const chunks = [{
    chunk_id: '33333333-3333-4333-8333-333333333333',
    chunk_index: 0,
    content: 'Lumorius is an enterprise operating intelligence platform.',
  }];

  beforeEach(() => {
    db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) };
    ai = {
      chat: jest.fn().mockResolvedValue(
        '{"entities":[],"relationships":[],"claims":[]}',
      ),
    };
    service = new KnowledgeExtractionService(db, ai, {} as any, {
      proposeFinancialCandidates: jest.fn().mockResolvedValue({ created: 0 }),
    } as any);
  });

  it('accepts a structurally valid empty extraction response', async () => {
    const result = await (service as any).extract(
      chunks, 'doc-1', 'worker-1', 'org-1', 'user-1',
    );
    expect(result).toEqual({ entities: [], relationships: [], claims: [] });
  });

  it('rejects a response with missing required arrays', async () => {
    ai.chat.mockResolvedValueOnce('{"entities":[]}');
    await expect((service as any).extract(
      chunks, 'doc-1', 'worker-1', 'org-1', 'user-1',
    )).rejects.toThrow('missing one or more required arrays');
  });

  it('rejects malformed JSON instead of silently skipping the batch', async () => {
    ai.chat.mockResolvedValueOnce('{not-valid-json}');
    await expect((service as any).extract(
      chunks, 'doc-1', 'worker-1', 'org-1', 'user-1',
    )).rejects.toThrow('malformed extraction JSON');
  });

  it('rejects a batch with no JSON object', async () => {
    ai.chat.mockResolvedValueOnce('No structured output was returned.');
    await expect((service as any).extract(
      chunks, 'doc-1', 'worker-1', 'org-1', 'user-1',
    )).rejects.toThrow('no valid JSON object');
  });

  it('scans failed and expired knowledge extraction runs for bounded retries', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      document_id: 'doc-2',
      organization_id: 'org-2',
    }] });
    const processSpy = jest.spyOn(service, 'processDocument').mockResolvedValue(undefined);

    await service.recoverFailedExtractions();

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("run.status = 'failed'"));
    expect(db.query.mock.calls[0][0]).toContain('run.attempt_count < 5');
    expect(processSpy).toHaveBeenCalledWith({
      documentId: 'doc-2',
      organizationId: 'org-2',
    });
  });
});