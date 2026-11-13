import { DocumentRecoveryService } from './document-recovery.service';

describe('DocumentRecoveryService', () => {
  let service: DocumentRecoveryService;
  let db: any;
  let storage: any;
  let queue: any;
  let client: any;

  beforeEach(() => {
    client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    db = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
      transaction: jest.fn(async (callback: (client: any) => Promise<any>) => callback(client)),
    };
    storage = { delete: jest.fn().mockResolvedValue(undefined) };
    queue = {
      getJob: jest.fn().mockResolvedValue(null),
      add: jest.fn().mockResolvedValue({}),
    };
    service = new DocumentRecoveryService(db, storage, queue);
  });

  it('requeues a failed initial document submission with the stable job ID', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'doc-1', organization_id: 'org-1' }],
    });

    await service.recoverFailedDocumentQueues();

    expect(queue.add).toHaveBeenCalledWith(
      'process',
      { documentId: 'doc-1', organizationId: 'org-1' },
      expect.objectContaining({ jobId: 'doc-1', attempts: 3 }),
    );
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('does not add a duplicate when a document job is already active', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'doc-2', organization_id: 'org-1' }],
    });
    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('active'),
      remove: jest.fn(),
    });

    await service.recoverFailedDocumentQueues();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('deletes storage objects claimed from the transactional cleanup outbox', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: 'outbox-1', storage_key: 'orgs/org-1/documents/doc-1/a.pdf', attempts: 0 }],
    });

    await service.recoverStorageCleanup();

    expect(storage.delete).toHaveBeenCalledWith('orgs/org-1/documents/doc-1/a.pdf');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM document_storage_cleanup_outbox'),
      ['outbox-1'],
    );
  });

  it('reschedules storage cleanup when object storage fails', async () => {
    client.query.mockResolvedValueOnce({
      rows: [{ id: 'outbox-2', storage_key: 'orgs/org-1/documents/doc-2/b.pdf', attempts: 1 }],
    });
    storage.delete.mockRejectedValueOnce(new Error('temporary storage outage'));

    await service.recoverStorageCleanup();

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'pending'"),
      ['outbox-2', 'temporary storage outage'],
    );
  });
});