import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LuieConsumerRegistry } from '../luie/luie-consumer.registry';
import { LuieOperationsService } from './luie-operations.service';

describe('LuieOperationsService', () => {
  let service: LuieOperationsService;
  let db: { query: jest.Mock; transaction: jest.Mock };
  let client: { query: jest.Mock };
  const registry = { names: jest.fn().mockReturnValue(['luie.consumer']) };

  beforeEach(() => {
    client = { query: jest.fn() };
    db = {
      query: jest.fn(),
      transaction: jest.fn(async (callback: (client: typeof client) => Promise<unknown>) => callback(client)),
    };
    registry.names.mockReturnValue(['luie.consumer']);
    service = new LuieOperationsService(db as unknown as DatabaseService, registry as unknown as LuieConsumerRegistry);
  });

  it('scopes delivery listing to the requested organisation and bounds pagination', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ delivery_id: 'delivery-1' }] });
    const result = await service.listDeliveries('org-1', { status: 'dead_letter', limit: '500', offset: '-1' });
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(0);
    expect(db.query.mock.calls[0][0]).toContain('evt.organization_id = $1::uuid');
    expect(db.query.mock.calls[0][1]).toEqual(['org-1', 'dead_letter', 100, 0]);
  });

  it('rejects unsupported delivery status filters', async () => {
    await expect(service.listDeliveries('org-1', { status: 'queued' })).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('retries a dead letter and writes the operator audit row in the same transaction', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'delivery-1', consumer_name: 'luie.consumer', status: 'dead_letter', attempt_count: 8, last_error: 'provider failed', event_type: 'task.assigned', event_key: 'task.assigned:1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'delivery-1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await service.retryDeadLetter('org-1', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Provider outage has been resolved');

    expect(result).toEqual(expect.objectContaining({ retried: true, attemptsReset: true }));
    expect(client.query.mock.calls[0][0]).toContain('evt.organization_id = $2::uuid');
    expect(client.query.mock.calls[1][0]).toContain("SET status = 'retry', attempt_count = 0");
    expect(client.query.mock.calls[2][0]).toContain('INSERT INTO luie_operator_audit');
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('does not retry a delivery that is not dead-lettered', async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: 'delivery-1', status: 'retry' }] });
    await expect(service.retryDeadLetter('org-1', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'Please retry this delivery')).rejects.toBeInstanceOf(ConflictException);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('does not expose delivery IDs across organisations', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.getDelivery('org-1', '11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(NotFoundException);
  });
});