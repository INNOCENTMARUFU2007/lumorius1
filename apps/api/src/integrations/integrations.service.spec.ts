import { IntegrationsService } from './integrations.service';

describe('IntegrationsService sync completion events', () => {
  it('records sync completion and its durable LUIE event in one transaction', async () => {
    const connection = {
      provider: 'google-drive',
      status: 'connected',
      account_email: 'owner@example.test',
      encrypted_credentials: 'encrypted',
      connected_by_user_id: 'user-1',
      last_synced_at: null,
    };
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [{ provider: 'google-drive' }] }),
    };
    const db = {
      // First query is the plan check (Google Drive is paid-plan only); the rest return the connection.
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ plan_id: 'growth', trial_ends_at: null, created_at: new Date().toISOString() }] })
        .mockResolvedValue({ rows: [connection] }),
      transaction: jest.fn(async (callback: (transactionClient: typeof client) => Promise<unknown>) =>
        callback(client)),
    };
    const publisher = { append: jest.fn().mockResolvedValue(undefined) };
    const service = new IntegrationsService(
      db as never,
      {} as never,
      {} as never,
      publisher as never,
    );
    Object.assign(service, {
      ensureFreshCredentials: jest.fn().mockResolvedValue({ access_token: 'token' }),
      fetchRemoteItems: jest.fn().mockResolvedValue([]),
    });

    const result = await service.syncForUser({
      organizationId: 'org-1',
      sub: 'user-1',
      role: 'owner',
    } as never, 'google-drive');

    expect(result).toMatchObject({
      provider: 'google-drive',
      fetched: 0,
      imported: 0,
      skipped: 0,
      unsupported: 0,
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE integration_connections'),
      expect.arrayContaining(['org-1', 'google-drive']),
    );
    expect(publisher.append).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        organizationId: 'org-1',
        eventType: 'integration.sync_completed',
        aggregateType: 'integration_sync',
        actorId: 'user-1',
        payload: { provider: 'google-drive', fetched: 0, imported: 0, skipped: 0, unsupported: 0 },
      }),
      ['luie.legacy-domain-bridge'],
    );
  });

  it('audits integration credential changes without recording webhook secrets', async () => {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    };
    const db = {
      transaction: jest.fn(async (callback: (transactionClient: typeof client) => Promise<unknown>) =>
        callback(client)),
    };
    const service = new IntegrationsService(
      db as never,
      {} as never,
      {} as never,
      {} as never,
    );
    Object.assign(service, {
      encrypt: jest.fn().mockReturnValue('encrypted-credential'),
    });

    await service.configureConnector({
      organizationId: 'org-1',
      sub: 'user-1',
      role: 'admin',
    } as never, 'zapier', {
      webhookUrl: 'https://hooks.zapier.com/services/secret',
    });

    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls[0][0]).toContain('INSERT INTO integration_connections');
    expect(client.query.mock.calls[1][0]).toContain('INSERT INTO audit_logs');
    expect(client.query.mock.calls[1][1]).toEqual([
      'org-1',
      'user-1',
      'zapier',
      JSON.stringify({ provider: 'zapier' }),
    ]);
  });
});
