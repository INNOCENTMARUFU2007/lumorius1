import { Job } from 'bull';
import { AiService } from '../ai/ai.service';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { LuieEventPublisher } from '../luie/luie-event.publisher';
import { DocumentsProcessor } from './documents.processor';
import { EmbeddingService } from './embedding.service';

const DOCUMENT_ID = '11111111-1111-4111-8111-111111111111';
const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const TEAM_ID = '44444444-4444-4444-8444-444444444444';
const JOB_TIMESTAMP = 1794150000000;

const makeVector = () => new Array(1536).fill(0.125);

describe('DocumentsProcessor LUIE document lifecycle', () => {
  const document = {
    id: DOCUMENT_ID,
    organization_id: ORGANIZATION_ID,
    name: 'strategy.txt',
    type: 'txt',
    storage_key: `orgs/${ORGANIZATION_ID}/documents/${DOCUMENT_ID}/strategy.txt`,
    uploaded_by_id: USER_ID,
    status: 'uploading',
    team_id: TEAM_ID,
  };

  const db = { query: jest.fn(), transaction: jest.fn() };
  const client = { query: jest.fn() };
  const storage = { download: jest.fn() };
  const embeddingService = {
    extractText: jest.fn(),
    chunkText: jest.fn(),
  };
  const aiService = { createEmbeddings: jest.fn() };
  const publisher = { append: jest.fn().mockResolvedValue({ eventId: 'event-1', duplicate: false, deliveriesInserted: 2 }) };
  let processor: DocumentsProcessor;
  let job: Job<{ documentId: string; organizationId: string }>;
  let transactionActive: boolean;

  beforeEach(() => {
    jest.clearAllMocks();
    transactionActive = false;
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, organization_id, name, type, storage_key')) {
        return { rows: [{ ...document }] };
      }
      if (sql.includes("SET status = 'processing'")) {
        return { rows: [{ id: DOCUMENT_ID }] };
      }
      return { rows: [] };
    });
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes("SET status = 'indexed'")) {
        return { rows: [{ id: DOCUMENT_ID }], rowCount: 1 };
      }
      if (sql.includes('SET status = CASE')) {
        return { rows: [{ status: 'indexed' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    db.transaction.mockImplementation(async (callback: (value: typeof client) => Promise<unknown>) => {
      transactionActive = true;
      try {
        return await callback(client);
      } finally {
        transactionActive = false;
      }
    });
    publisher.append.mockImplementation(async (passedClient: unknown) => {
      expect(transactionActive).toBe(true);
      expect(passedClient).toBe(client);
      return { eventId: 'event-1', duplicate: false, deliveriesInserted: 2 };
    });
    storage.download.mockResolvedValue(Buffer.from('company strategy evidence'));
    embeddingService.extractText.mockResolvedValue('company strategy evidence');
    embeddingService.chunkText.mockReturnValue([
      { text: 'company strategy evidence', tokenCount: 6 },
      { text: 'second evidence chunk', tokenCount: 5 },
    ]);
    aiService.createEmbeddings.mockResolvedValue([makeVector(), makeVector()]);
    job = {
      id: DOCUMENT_ID,
      timestamp: JOB_TIMESTAMP,
      opts: { attempts: 3 },
      attemptsMade: 0,
      data: { documentId: DOCUMENT_ID, organizationId: ORGANIZATION_ID },
      progress: jest.fn().mockResolvedValue(undefined),
    } as unknown as Job<{ documentId: string; organizationId: string }>;
    processor = new DocumentsProcessor(
      db as unknown as DatabaseService,
      storage as unknown as StorageService,
      embeddingService as unknown as EmbeddingService,
      aiService as unknown as AiService,
      publisher as unknown as LuieEventPublisher,
    );
  });

  it('scopes document lookup and index writes to the job organisation', async () => {
    await processor.processDocument(job);

    expect(db.query.mock.calls[0][0]).toContain('AND organization_id = $2::uuid');
    expect(db.query.mock.calls[0][1]).toEqual([DOCUMENT_ID, ORGANIZATION_ID]);
    expect(db.query.mock.calls[0][0]).toContain('team_id');
    expect(client.query.mock.calls[0][0]).toContain('DELETE FROM document_chunks');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO document_chunks'),
      expect.arrayContaining([DOCUMENT_ID]),
    );
  });

  it('meters embedding batches against the organisation and uploader', async () => {
    await processor.processDocument(job);

    expect(aiService.createEmbeddings).toHaveBeenCalledWith(
      ['company strategy evidence', 'second evidence chunk'],
      {
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
        feature: 'document_indexing',
      },
    );
  });

  it('appends document.indexed through the same transaction as the index commit', async () => {
    await processor.processDocument(job);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(publisher.append).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        eventKey: `document.indexed:${DOCUMENT_ID}:${DOCUMENT_ID}:${JOB_TIMESTAMP}`,
        eventType: 'document.indexed',
        aggregateType: 'document',
        aggregateId: DOCUMENT_ID,
        actorId: USER_ID,
        teamId: TEAM_ID,
        occurredAt: new Date(JOB_TIMESTAMP),
        payload: expect.objectContaining({
          documentId: DOCUMENT_ID,
          organizationId: ORGANIZATION_ID,
          teamId: TEAM_ID,
          actorId: USER_ID,
          chunkCount: 2,
        }),
      }),
      ['luie.document-legacy-bridge', 'luie.knowledge-extraction', 'luie.workflow-dispatch'],
    );
    expect(job.progress).toHaveBeenLastCalledWith(100);
  });

  it('publishes indexing failure only on the final Bull attempt and retains an old index', async () => {
    embeddingService.extractText.mockResolvedValue('   ');
    job.attemptsMade = 2;

    await expect(processor.processDocument(job)).rejects.toThrow('no readable text');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('RETURNING status'),
      expect.arrayContaining([expect.any(String), DOCUMENT_ID, ORGANIZATION_ID]),
    );
    expect(publisher.append).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        eventKey: `document.indexing_failed:${DOCUMENT_ID}:${DOCUMENT_ID}:${JOB_TIMESTAMP}`,
        eventType: 'document.indexing_failed',
        aggregateType: 'document',
        aggregateId: DOCUMENT_ID,
        actorId: USER_ID,
        teamId: TEAM_ID,
        occurredAt: new Date(JOB_TIMESTAMP),
        payload: expect.objectContaining({
          documentId: DOCUMENT_ID,
          failureCode: 'document_processing_failed',
          previousIndexRetained: true,
        }),
      }),
      ['luie.document-legacy-bridge', 'luie.workflow-dispatch'],
    );
    expect(JSON.stringify(publisher.append.mock.calls[0][1].payload)).not.toContain('no readable text');
  });

  it('does not publish indexing failure on a transient Bull attempt', async () => {
    embeddingService.extractText.mockResolvedValue('   ');
    job.attemptsMade = 0;

    await expect(processor.processDocument(job)).rejects.toThrow('no readable text');

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('SET status = CASE'))).toBe(true);
    expect(publisher.append).not.toHaveBeenCalled();
  });

  it('rejects invalid embedding dimensions without publishing an indexing event', async () => {
    aiService.createEmbeddings.mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]);

    await expect(processor.processDocument(job)).rejects.toThrow('Embedding dimensions or values are invalid');

    expect(publisher.append).not.toHaveBeenCalled();
  });

  it('does not download a document belonging to a different organisation', async () => {
    db.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, organization_id, name, type, storage_key')) return { rows: [] };
      return { rows: [] };
    });

    await expect(processor.processDocument(job)).rejects.toThrow('not found in the specified organization');

    expect(storage.download).not.toHaveBeenCalled();
    expect(publisher.append).not.toHaveBeenCalled();
  });
});