import { DatabaseService } from '../database/database.service';
import { LuieConsumerRegistry } from './luie-consumer.registry';
import { LuieDomainEvent } from './luie-event.types';
import { LuieLegacyDomainBridgeConsumer } from './luie-legacy-domain-bridge.consumer';

describe('LuieLegacyDomainBridgeConsumer', () => {
  const registry = { register: jest.fn() };
  const db = { query: jest.fn() };
  const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
  let consumer: LuieLegacyDomainBridgeConsumer;

  beforeEach(() => {
    jest.clearAllMocks();
    consumer = new LuieLegacyDomainBridgeConsumer(
      registry as unknown as LuieConsumerRegistry,
      db as unknown as DatabaseService,
      eventEmitter as never,
    );
  });

  it('registers once with the LUIE consumer registry', () => {
    consumer.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(consumer);
    expect(consumer.name).toBe('luie.legacy-domain-bridge');
  });

  it('forwards task assignment metadata to existing EventEmitter subscribers', async () => {
    const event = {
      id: 'event-1', organizationId: 'org-1', eventKey: 'task.assigned:1',
      eventType: 'task.assigned', aggregateType: 'task', aggregateId: 'task-1',
      actorId: 'user-1', teamId: 'team-1', sourceVersion: 1, schemaVersion: 1,
      payload: { taskId: 'task-1', assigneeId: 'user-2' }, occurredAt: new Date(), createdAt: new Date(),
    } as unknown as LuieDomainEvent;

    await consumer.handle(event);

    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('task.assigned', expect.objectContaining({
      taskId: 'task-1', assigneeId: 'user-2', organizationId: 'org-1',
      actorId: 'user-1', teamId: 'team-1', eventKey: 'task.assigned:1', eventId: 'event-1',
    }));
  });

  it('loads a meeting summary under the event organisation without storing it in the event', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ summary: 'Quarterly review complete', action_items: [{ id: 'a' }, { id: 'b' }] }] });
    const event = {
      id: 'event-2', organizationId: 'org-1', eventKey: 'meeting.completed:2',
      eventType: 'meeting.completed', aggregateType: 'meeting', aggregateId: 'meeting-1',
      actorId: 'user-1', teamId: null, sourceVersion: 1, schemaVersion: 1,
      payload: { meetingId: 'meeting-1', meetingTitle: 'Quarterly review', userId: 'user-1' },
      occurredAt: new Date(), createdAt: new Date(),
    } as unknown as LuieDomainEvent;

    await consumer.handle(event);

    expect(db.query.mock.calls[0][1]).toEqual(['org-1', 'meeting-1']);
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith('meeting.completed', expect.objectContaining({
      summary: 'Quarterly review complete', actionItemCount: 2, userId: 'user-1',
    }));
  });

  it('does not claim support for unrelated events', () => {
    expect(consumer.supports('billing.payment_failed')).toBe(false);
  });
});