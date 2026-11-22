import { ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { LuieEventPublisher } from './luie-event.publisher';

const validEvent = {
  organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  eventKey: 'task.created:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:1',
  eventType: 'task.created',
  aggregateType: 'task',
  aggregateId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  actorId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  teamId: null,
  sourceVersion: 1,
  schemaVersion: 1,
  payload: { title: 'Prepare launch plan' },
};

describe('LuieEventPublisher', () => {
  let publisher: LuieEventPublisher;
  let clientQuery: jest.Mock;
  let client: PoolClient;

  beforeEach(() => {
    publisher = new LuieEventPublisher();
    clientQuery = jest.fn();
    client = { query: clientQuery } as unknown as PoolClient;
  });

  it('persists the event and independent consumer deliveries through the supplied transaction client', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 });

    const result = await publisher.append(client, validEvent, ['luie.search', 'luie.analytics']);

    expect(result).toEqual({
      eventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      duplicate: false,
      deliveriesInserted: 2,
    });
    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(String(clientQuery.mock.calls[0][0])).toContain('INSERT INTO luie_domain_events');
    expect(String(clientQuery.mock.calls[1][0])).toContain('INSERT INTO luie_event_deliveries');
    expect(clientQuery.mock.calls[1][1][1]).toEqual(['luie.analytics', 'luie.search']);
  });

  it('reuses an existing event for an identical idempotency key without duplicating deliveries', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        event_type: 'task.created',
        aggregate_type: 'task',
        aggregate_id: validEvent.aggregateId,
        source_version: 1,
        schema_version: 1,
      }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await publisher.append(client, validEvent, ['luie.search']);

    expect(result.duplicate).toBe(true);
    expect(result.deliveriesInserted).toBe(0);
    expect(clientQuery).toHaveBeenCalledTimes(3);
  });

  it('rejects an idempotency key reused for a different event identity', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        event_type: 'task.updated',
        aggregate_type: 'task',
        aggregate_id: validEvent.aggregateId,
        source_version: 1,
        schema_version: 1,
      }] });

    await expect(publisher.append(client, validEvent, ['luie.search']))
      .rejects.toBeInstanceOf(ConflictException);
    expect(clientQuery).toHaveBeenCalledTimes(2);
  });

  it('rejects an oversized payload before database access', async () => {
    await expect(publisher.append(
      client,
      { ...validEvent, payload: { content: 'x'.repeat(70 * 1024) } },
      ['luie.search'],
    )).rejects.toThrow('cannot exceed 64 KB');
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('requires at least one consumer', async () => {
    await expect(publisher.append(client, validEvent, [])).rejects.toThrow('At least one LUIE event consumer');
    expect(clientQuery).not.toHaveBeenCalled();
  });
});
