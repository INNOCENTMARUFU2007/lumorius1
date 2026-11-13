import { ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { GdprService } from './gdpr.service';

describe('GdprService', () => {
  it('exports only records owned by the user in their current organization', async () => {
    type ClientMock = { query: jest.Mock };
    const client: ClientMock = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({
          rows: [{ id: 'user-a', organization_id: 'organization-a' }],
        })
        .mockResolvedValue({ rows: [] }),
      transaction: jest.fn((callback: (transactionClient: ClientMock) => Promise<unknown>) => callback(client)),
    };
    const service = new GdprService(db as unknown as DatabaseService);

    await service.exportUserData('user-a');

    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('uploaded_by_id = $1'),
      ['user-a', 'organization-a'],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('m.created_by_id = $1'),
      ['user-a', 'organization-a'],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('created_by_id = $1'),
      ['user-a', 'organization-a'],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('created_by_id = $1'),
      ['user-a', 'organization-a'],
    );
    expect(client.query.mock.calls[0][1]).toContain('gdpr.data_export');
  });

  it('rejects duplicate account deletion requests instead of reporting a false success', async () => {
    type ClientMock = { query: jest.Mock };
    const client: ClientMock = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{ organization_id: 'organization-a', deletion_scheduled_at: new Date(), is_active: true }],
      }),
    };
    const db = {
      transaction: jest.fn((callback: (transactionClient: ClientMock) => Promise<unknown>) => callback(client)),
    };
    const service = new GdprService(db as unknown as DatabaseService);

    await expect(service.requestDeletion('user-a')).rejects.toBeInstanceOf(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
