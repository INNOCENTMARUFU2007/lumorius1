import { Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LuieConsumerRegistry } from './luie-consumer.registry';
import { LuieEventDeliveryService } from './luie-event-delivery.service';
import type { LuieEventConsumer } from './luie-event.types';
import { LuiePermanentDeliveryError } from './luie-event.types';

const eventRow = {
  delivery_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  consumer_name: 'luie.test',
  attempt_count: 1,
  lease_token: 'luie-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  event_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  organization_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  event_key: 'task.created:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:1',
  event_type: 'task.created',
  aggregate_type: 'task',
  aggregate_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  actor_id: null,
  team_id: null,
  source_version: 1,
  schema_version: 1,
  payload: { title: 'Prepare launch plan' },
  occurred_at: new Date('2026-11-08T10:00:00.000Z'),
  created_at: new Date('2026-11-08T10:00:00.000Z'),
};

function buildHarness(options: {
  consumer?: LuieEventConsumer;
  rows?: Array<typeof eventRow>;
  ackRowCount?: number;
  failRowCount?: number;
} = {}) {
  const registry = new LuieConsumerRegistry();
  if (options.consumer) registry.register(options.consumer);

  const clientQuery = jest.fn()
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: options.rows ?? [eventRow], rowCount: (options.rows ?? [eventRow]).length });

  const dbQuery = jest.fn().mockImplementation((sql: string) => {
    if (String(sql).includes("SET status = 'delivered'")) {
      return Promise.resolve({ rows: [], rowCount: options.ackRowCount ?? 1 });
    }
    return Promise.resolve({ rows: [], rowCount: options.failRowCount ?? 1 });
  });

  const db = {
    transaction: jest.fn(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) =>
      callback({ query: clientQuery })),
    query: dbQuery,
  };

  const service = new LuieEventDeliveryService(db as unknown as DatabaseService, registry);
  return { service, registry, db, dbQuery, clientQuery };
}

describe('LuieEventDeliveryService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('delivers a claimed event and acknowledges it with the unique per-attempt lease token', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer: LuieEventConsumer = { name: 'luie.test', supports: () => true, handle: handler };
    const { service, dbQuery, clientQuery } = buildHarness({ consumer });

    await service.drain();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      id: eventRow.event_id,
      eventType: 'task.created',
      organizationId: eventRow.organization_id,
      payload: eventRow.payload,
      deliveryId: eventRow.delivery_id,
    }));
    expect(handler.mock.calls[0][0]).not.toHaveProperty('leaseToken');
    expect(String(clientQuery.mock.calls[1][0])).toContain("'luie-' || gen_random_uuid()::text AS lease_token");
    expect(String(dbQuery.mock.calls[0][0])).toContain("SET status = 'delivered'");
    expect(dbQuery.mock.calls[0][1]).toEqual([eventRow.delivery_id, eventRow.lease_token]);
  });

  it('retries transient consumer failures with exponential backoff and the attempt lease token', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('temporary provider failure'));
    const consumer: LuieEventConsumer = { name: 'luie.test', supports: () => true, handle: handler };
    const { service, dbQuery } = buildHarness({ consumer });

    await service.drain();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(String(dbQuery.mock.calls[0][0])).toContain("WHERE id = $1::uuid");
    expect(String(dbQuery.mock.calls[0][0])).toContain('AND worker_id = $2');
    expect(dbQuery.mock.calls[0][1]).toEqual([
      eventRow.delivery_id,
      eventRow.lease_token,
      'retry',
      5,
      'Error: temporary provider failure',
    ]);
  });

  it('dead-letters permanent consumer errors immediately without retrying', async () => {
    const handler = jest.fn().mockRejectedValue(new LuiePermanentDeliveryError('invalid event contract'));
    const consumer: LuieEventConsumer = { name: 'luie.test', supports: () => true, handle: handler };
    const { service, dbQuery } = buildHarness({ consumer });

    await service.drain();

    expect(dbQuery).toHaveBeenCalledTimes(1);
    expect(dbQuery.mock.calls[0][1]).toEqual([
      eventRow.delivery_id,
      eventRow.lease_token,
      'dead_letter',
      5,
      'LuiePermanentDeliveryError: invalid event contract',
    ]);
  });

  it('dead-letters unsupported event types immediately', async () => {
    const handler = jest.fn();
    const consumer: LuieEventConsumer = { name: 'luie.test', supports: () => false, handle: handler };
    const { service, dbQuery } = buildHarness({ consumer });

    await service.drain();

    expect(handler).not.toHaveBeenCalled();
    expect(dbQuery.mock.calls[0][1][2]).toBe('dead_letter');
    expect(dbQuery.mock.calls[0][1][4]).toContain('does not support event');
  });

  it('dead-letters a supports() exception rather than leaving the lease to expire', async () => {
    const handler = jest.fn();
    const consumer: LuieEventConsumer = {
      name: 'luie.test',
      supports: () => { throw new Error('routing registry unavailable'); },
      handle: handler,
    };
    const { service, dbQuery } = buildHarness({ consumer });

    await service.drain();

    expect(handler).not.toHaveBeenCalled();
    expect(dbQuery.mock.calls[0][1][2]).toBe('dead_letter');
    expect(dbQuery.mock.calls[0][1][4]).toContain('supports() threw');
  });

  it('dead-letters a transient failure when the final configured attempt is exhausted', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('still failing'));
    const finalAttemptRow = { ...eventRow, attempt_count: 8 };
    const consumer: LuieEventConsumer = { name: 'luie.test', supports: () => true, handle: handler };
    const { service, dbQuery } = buildHarness({ consumer, rows: [finalAttemptRow] });

    await service.drain();

    expect(dbQuery.mock.calls[0][1][2]).toBe('dead_letter');
  });

  it('does not claim work when there are no registered consumers', async () => {
    const { service, db } = buildHarness();
    await service.drain();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('reports pending deliveries for consumers not registered in this process', async () => {
    const { service, registry, dbQuery } = buildHarness();
    dbQuery.mockResolvedValueOnce({
      rows: [{ consumer_name: 'luie.retired', pending_count: 3 }],
      rowCount: 1,
    });
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await service.reportUnregisteredDeliveries();

    expect(String(dbQuery.mock.calls[0][0])).toContain('NOT (consumer_name = ANY($1::text[]))');
    expect(dbQuery.mock.calls[0][1]).toEqual([registry.names()]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('luie.retired'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('3 pending/retry'));
  });

  it('does not acknowledge a delivery after lease ownership has changed', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const consumer: LuieEventConsumer = { name: 'luie.test', supports: () => true, handle: handler };
    const { service, dbQuery } = buildHarness({ consumer, ackRowCount: 0 });
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await service.drain();

    expect(dbQuery.mock.calls[0][1]).toEqual([eventRow.delivery_id, eventRow.lease_token]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('lease was no longer owned'));
  });

  it('guards retry transitions against stale lease ownership', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('transient'));
    const consumer: LuieEventConsumer = { name: 'luie.test', supports: () => true, handle: handler };
    const { service, dbQuery } = buildHarness({ consumer, failRowCount: 0 });
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await service.drain();

    expect(String(dbQuery.mock.calls[0][0])).toContain('AND worker_id = $2');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no longer owns its lease'));
  });
});