import { DocumentsService } from './documents.service';

describe('DocumentsService deletion reliability with LUIE', () => {
  let service: DocumentsService;
  let db: any;
  let client: any;
  let storage: any;
  let publisher: any;

  beforeEach(() => {
    client = { query: jest.fn() };
    db = {
      query: jest.fn(),
      transaction: jest.fn(async (callback: (client: any) => Promise<any>) => callback(client)),
    };
    storage = {
      delete: jest.fn().mockResolvedValue(undefined),
      upload: jest.fn().mockResolvedValue(undefined),
    };
    publisher = { append: jest.fn().mockResolvedValue({ eventId: 'deleted-event', duplicate: false, deliveriesInserted: 1 }) };
    service = new DocumentsService(db, storage, {} as any, {} as any, publisher, undefined);
    jest.spyOn(service, 'findById').mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      storage_key: 'orgs/org-1/documents/doc-1/report.pdf',
      size_bytes: 1234,
    } as any);
  });

  it('records storage cleanup, quota, deletion and LUIE event in one transaction', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{
        id: '11111111-1111-4111-8111-111111111111',
        storage_key: 'orgs/org-1/documents/doc-1/report.pdf',
        size_bytes: 1234,
        team_id: '44444444-4444-4444-8444-444444444444',
      }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111' }], rowCount: 1 });

    const transactionOrder: string[] = [];
    db.transaction.mockImplementation(async (callback: (client: any) => Promise<any>) => {
      transactionOrder.push('begin');
      const result = await callback(client);
      transactionOrder.push('commit');
      return result;
    });
    publisher.append.mockImplementation(async (passedClient: any, input: any, consumers: string[]) => {
      expect(passedClient).toBe(client);
      transactionOrder.push('event');
      expect(input).toEqual(expect.objectContaining({
        organizationId: '22222222-2222-4222-8222-222222222222',
        eventKey: 'document.deleted:11111111-1111-4111-8111-111111111111:1',
        eventType: 'document.deleted',
        aggregateType: 'document',
        aggregateId: '11111111-1111-4111-8111-111111111111',
        actorId: '33333333-3333-4333-8333-333333333333',
        teamId: '44444444-4444-4444-8444-444444444444',
        payload: expect.objectContaining({
          documentId: '11111111-1111-4111-8111-111111111111',
          teamId: '44444444-4444-4444-8444-444444444444',
        }),
      }));
      expect(consumers).toEqual(['luie.workflow-dispatch']);
      return { eventId: 'deleted-event', duplicate: false, deliveriesInserted: 1 };
    });

    await expect(service.delete(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      { userId: '33333333-3333-4333-8333-333333333333', role: 'owner' },
    )).resolves.toEqual({ deleted: true, storageCleanup: 'queued' });

    const sql = client.query.mock.calls.map((call: any[]) => String(call[0]));
    const outboxIndex = sql.findIndex((query: string) => query.includes('INSERT INTO document_storage_cleanup_outbox'));
    const quotaIndex = sql.findIndex((query: string) => query.includes('UPDATE organizations'));
    const deleteIndex = sql.findIndex((query: string) => query.includes('DELETE FROM documents'));
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(outboxIndex).toBeGreaterThanOrEqual(0);
    expect(quotaIndex).toBeGreaterThan(outboxIndex);
    expect(deleteIndex).toBeGreaterThan(quotaIndex);
    expect(transactionOrder).toEqual(['begin', 'event', 'commit']);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('does not publish the deletion event or delete the object after a failed database transaction', async () => {
    db.transaction.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.delete(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      { userId: '33333333-3333-4333-8333-333333333333', role: 'owner' },
    )).rejects.toThrow('database unavailable');

    expect(publisher.append).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('rejects uploads to teams the uploader does not belong to before writing to storage', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    const file = {
      buffer: Buffer.from('%PDF-1.7 document'),
      size: 17,
      mimetype: 'application/pdf',
      originalname: 'report.pdf',
    } as Express.Multer.File;

    await expect(service.upload(
      file,
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      { teamId: '44444444-4444-4444-8444-444444444444', role: 'member' },
    )).rejects.toThrow('selected team does not belong');

    expect(db.query.mock.calls[0][0]).toContain('team_members');
    expect(db.query.mock.calls[0][1]).toEqual([
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
      false,
      '33333333-3333-4333-8333-333333333333',
    ]);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('scopes Company Brain facets to the current user team memberships', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ type: 'pdf', count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ tag: 'strategy', count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ count: '1' }] });

    const result = await service.getSearchFacets(
      '22222222-2222-4222-8222-222222222222',
      { userId: '33333333-3333-4333-8333-333333333333', role: 'member' },
    );

    expect(result.total).toBe(1);
    for (const [sql, values] of db.query.mock.calls) {
      expect(String(sql)).toContain('team_members');
      expect(values).toEqual([
        '22222222-2222-4222-8222-222222222222',
        false,
        '33333333-3333-4333-8333-333333333333',
      ]);
    }
  });
});