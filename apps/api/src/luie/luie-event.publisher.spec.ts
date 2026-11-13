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

const existingEventId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('LuieEventPublisher', () => {
  let publisher: LuieEventPublisher;
  let clientQuery: jest.Mock;
  let client: PoolClient;

  beforeEach(() => {
    publisher = new LuieEventPublisher();
    clientQuery = jest.fn();
    client = { query: clientQuery } as unknown as PoolClient;
  });

  it('persists the event and its initial recipient set through the supplied transaction client', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [{ id: existingEventId }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 });

    const result = await publisher.append(client, validEvent, ['luie.search', 'luie.analytics']);

    expect(result).toEqual({
      eventId: existingEventId,
      duplicate: false,
      deliveriesInserted: 2,
    });
    expect(clientQuery).toHaveBeenCalledTimes(2);
    expect(String(clientQuery.mock.calls[0][0])).toContain('INSERT INTO luie_domain_events');
    expect(String(clientQuery.mock.calls[1][0])).toContain('INSERT INTO luie_event_deliveries');
    expect(clientQuery.mock.calls[1][1][1]).toEqual(['luie.analytics', 'luie.search']);
  });

  it('returns an identical event without inserting or replaying deliveries', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: existingEventId, same_envelope: true }] })
      .mockResolvedValueOnce({ rows: [{ consumer_names: ['luie.search'] }] });

    const result = await publisher.append(client, validEvent, ['luie.search']);

    expect(result).toEqual({
      eventId: existingEventId,
      duplicate: true,
      deliveriesInserted: 0,
    });
    expect(clientQuery).toHaveBeenCalledTimes(3);
    expect(String(clientQuery.mock.calls[1][0])).toContain('payload = $10::jsonb');
    expect(String(clientQuery.mock.calls[1][0])).toContain('actor_id IS NOT DISTINCT FROM $6::uuid');
    expect(clientQuery.mock.calls[1][1][10]).toBeNull();
    expect(String(clientQuery.mock.calls[2][0])).toContain('array_agg(consumer_name ORDER BY consumer_name)');
    expect(String(clientQuery.mock.calls[2][0])).not.toContain('INSERT INTO');
  });

  it('rejects an idempotency key reused with a different event envelope', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: existingEventId, same_envelope: false }] });

    await expect(publisher.append(
      client,
      { ...validEvent, payload: { title: 'A materially different event' } },
      ['luie.search'],
    )).rejects.toBeInstanceOf(ConflictException);

    expect(clientQuery).toHaveBeenCalledTimes(2);
  });

  it('rejects an idempotency key reused with a different original recipient set', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: existingEventId, same_envelope: true }] })
      .mockResolvedValueOnce({ rows: [{ consumer_names: ['luie.search'] }] });

    await expect(publisher.append(
      client,
      validEvent,
      ['luie.search', 'luie.analytics'],
    )).rejects.toBeInstanceOf(ConflictException);

    expect(clientQuery).toHaveBeenCalledTimes(3);
  });

  it('compares an explicitly supplied occurrence timestamp on duplicate events', async () => {
    const occurredAt = '2026-11-08T10:00:00.000Z';
    clientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: existingEventId, same_envelope: true }] })
      .mockResolvedValueOnce({ rows: [{ consumer_names: ['luie.search'] }] });

    await publisher.append(client, { ...validEvent, occurredAt }, ['luie.search']);

    expect(clientQuery.mock.calls[1][1][10]).toBe(occurredAt);
  });

  it('rejects an oversized payload before database access', async () => {
    await expect(publisher.append(
      client,
      { ...validEvent, payload: { content: 'x'.repeat(70 * 1024) } },
      ['luie.search'],
    )).rejects.toThrow('cannot exceed 64 KB');
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('rejects payloads that do not serialise to a JSON object', async () => {
    const payload = { toJSON: () => undefined };

    await expect(publisher.append(
      client,
      { ...validEvent, payload },
      ['luie.search'],
    )).rejects.toThrow('serialise to a JSON object');
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('requires at least one consumer', async () => {
    await expect(publisher.append(client, validEvent, []))
      .rejects.toThrow('At least one LUIE event consumer');
    expect(clientQuery).not.toHaveBeenCalled();
  });
});
