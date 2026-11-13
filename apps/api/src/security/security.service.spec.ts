import { BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';
import { SecurityService } from './security.service';

describe('SecurityService API keys and audit logs', () => {
  it('creates a key and one secret-free audit event atomically', async () => {
    type ClientMock = { query: jest.Mock };
    const client: ClientMock = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const db = {
      query: jest.fn(),
      findOne: jest.fn().mockResolvedValue({
        email: 'owner@example.test',
        name: 'Owner',
      }),
      transaction: jest.fn((callback: (transactionClient: ClientMock) => Promise<unknown>) => callback(client)),
    };
    const email = { sendApiKeyCreated: jest.fn().mockResolvedValue(undefined) };
    const service = new SecurityService(
      db as unknown as DatabaseService,
      email as unknown as EmailService,
    );

    const result = await service.createApiKey('org-a', 'user-a', {
      name: '  Deploy key  ',
      scopes: ['documents:read'],
    });

    expect(result.key).toMatch(/^nxs_[a-f0-9]{64}$/);
    expect(result.name).toBe('Deploy key');
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls[0][0]).toContain('INSERT INTO api_keys');
    expect(client.query.mock.calls[0][1]).not.toContain(result.key);
    expect(client.query.mock.calls[1][0]).toContain('INSERT INTO audit_logs');
    expect(client.query.mock.calls[1][1]).not.toContain(result.key);
  });

  it('rejects unsupported scopes before writing any key or audit row', async () => {
    const db = {
      query: jest.fn(),
      transaction: jest.fn(),
      findOne: jest.fn(),
    };
    const service = new SecurityService(
      db as unknown as DatabaseService,
      {} as EmailService,
    );

    await expect(
      service.createApiKey('org-a', 'user-a', {
        name: 'Read key',
        scopes: ['organizations:delete'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('removes secret fields from audit-log metadata before returning it', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          metadata: {
            key_hash: 'stored-hash',
            access_token: 'provider-token',
            keyPrefix: 'nxs_12345678',
          },
        }],
      }),
    };
    const service = new SecurityService(
      db as unknown as DatabaseService,
      {} as EmailService,
    );

    const result = await service.getAuditLogs('org-a', {});

    expect((result[0] as Record<string, unknown>).metadata).toEqual({ keyPrefix: 'nxs_12345678' });
  });
});
