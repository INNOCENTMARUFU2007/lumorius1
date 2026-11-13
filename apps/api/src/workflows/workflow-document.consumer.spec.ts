import { LuieConsumerRegistry } from '../luie/luie-consumer.registry';
import { LuieDomainEvent } from '../luie/luie-event.types';
import { WorkflowsService } from './workflows.service';
import { WorkflowDocumentConsumer } from './workflow-document.consumer';

const event: LuieDomainEvent = {
  id: 'event-1',
  organizationId: '22222222-2222-4222-8222-222222222222',
  eventKey: 'document.deleted:one',
  eventType: 'document.deleted',
  aggregateType: 'document',
  aggregateId: '11111111-1111-4111-8111-111111111111',
  actorId: '33333333-3333-4333-8333-333333333333',
  teamId: '44444444-4444-4444-8444-444444444444',
  sourceVersion: 1,
  schemaVersion: 1,
  payload: { documentId: '11111111-1111-4111-8111-111111111111' },
  occurredAt: new Date('2026-11-08T10:00:00.000Z'),
  createdAt: new Date('2026-11-08T10:00:00.000Z'),
};

describe('WorkflowDocumentConsumer', () => {
  const registry = { register: jest.fn() };
  const workflows = { dispatchEvent: jest.fn().mockResolvedValue({ matched: 1, outcomes: [] }) };
  let consumer: WorkflowDocumentConsumer;

  beforeEach(() => {
    jest.clearAllMocks();
    consumer = new WorkflowDocumentConsumer(
      registry as unknown as LuieConsumerRegistry,
      workflows as unknown as WorkflowsService,
    );
  });

  it('registers itself and supports all three document lifecycle workflow events', () => {
    consumer.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(consumer);
    expect(consumer.supports('document.indexed')).toBe(true);
    expect(consumer.supports('document.deleted')).toBe(true);
    expect(consumer.supports('document.indexing_failed')).toBe(true);
    expect(consumer.supports('meeting.completed')).toBe(false);
  });

  it('dispatches using the LUIE event ID as the workflow idempotency key', async () => {
    await consumer.handle(event);
    expect(workflows.dispatchEvent).toHaveBeenCalledWith(
      event.organizationId,
      'document.deleted',
      expect.objectContaining({
        documentId: '11111111-1111-4111-8111-111111111111',
        organizationId: event.organizationId,
        eventId: 'event-1',
        eventKey: 'event-1',
        actorId: event.actorId,
        teamId: event.teamId,
      }),
      'event-1',
      event.actorId,
    );
  });
});