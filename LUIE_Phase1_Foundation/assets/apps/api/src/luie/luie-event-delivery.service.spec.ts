import { DatabaseService } from '../database/database.service';
import { LuieConsumerRegistry } from './luie-consumer.registry';
import { LuieEventDeliveryService } from './luie-event-delivery.service';
import type { LuieEventConsumer } from './luie-event.types';

const eventRow = {
  delivery_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  consumer_name: 'luie.test',
  attempt_count: 1,
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

describe('LuieEventDeliveryService', () => {
  it('delivers a claimed event to its named consumer and acknowledges it', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    const registry = new LuieConsumerRegistry();
    const consumer: LuieEventConsumer = { name: 'luie.test', supports: () => true, handle: handler };
    registry.register(consumer);

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [eventRow] });
    const db = {
      transaction: jest.fn(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) =>
        callback({ query: clientQuery })),
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    };

    const service = new LuieEventDeliveryService(db as unknown as DatabaseService, registry);
    await service.drain();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      id: eventRow.event_id,
      eventType: 'task.created',
      organizationId: eventRow.organization_id,
      payload: eventRow.payload,
      deliveryId: eventRow.delivery_id,
    }));
    expect(String(db.query.mock.calls[0][0])).toContain("SET status = 'delivered'");
  });

  it('schedules a failed consumer delivery for retry', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('temporary provider failure'));
    const registry = new LuieConsumerRegistry();
    registry.register({ name: 'luie.test', supports: () => true, handle: handler });

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [eventRow] });
    const db = {
      transaction: jest.fn(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) =>
        callback({ query: clientQuery })),
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    };

    const service = new LuieEventDeliveryService(db as unknown as DatabaseService, registry);
    await service.drain();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(String(db.query.mock.calls[0][0])).toContain('SET status = $3');
    expect(db.query.mock.calls[0][1]).toEqual([
      eventRow.delivery_id,
      expect.any(String),
      'retry',
      5,
      'temporary provider failure',
    ]);
  });

  it('does not claim database work when no consumers are registered', async () => {
    const registry = new LuieConsumerRegistry();
    const db = {
      transaction: jest.fn(),
      query: jest.fn(),
    };
    const service = new LuieEventDeliveryService(db as unknown as DatabaseService, registry);
    await service.drain();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
