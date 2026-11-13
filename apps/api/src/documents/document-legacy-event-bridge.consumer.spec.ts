import { EventEmitter2 } from '@nestjs/event-emitter';
import { LuieConsumerRegistry } from '../luie/luie-consumer.registry';
import { LuieDomainEvent } from '../luie/luie-event.types';
import { DocumentLegacyEventBridgeConsumer } from './document-legacy-event-bridge.consumer';

const baseEvent: LuieDomainEvent = {
  id: 'event-1',
  organizationId: '22222222-2222-4222-8222-222222222222',
  eventKey: 'document.indexed:stable-key',
  eventType: 'document.indexed',
  aggregateType: 'document',
  aggregateId: '11111111-1111-4111-8111-111111111111',
  actorId: '33333333-3333-4333-8333-333333333333',
  teamId: '44444444-4444-4444-8444-444444444444',
  sourceVersion: 1,
  schemaVersion: 1,
  payload: {
    documentId: '11111111-1111-4111-8111-111111111111',
    documentName: 'strategy.txt',
    uploadedById: '33333333-3333-4333-8333-333333333333',
    chunkCount: 4,
  },
  occurredAt: new Date('2026-11-08T10:00:00.000Z'),
  createdAt: new Date('2026-11-08T10:00:00.000Z'),
};

describe('DocumentLegacyEventBridgeConsumer', () => {
  const registry = { register: jest.fn() };
  const eventEmitter = { emit: jest.fn().mockReturnValue(true) };
  let consumer: DocumentLegacyEventBridgeConsumer;

  beforeEach(() => {
    jest.clearAllMocks();
    consumer = new DocumentLegacyEventBridgeConsumer(
      registry as unknown as LuieConsumerRegistry,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('registers with LUIE and supports indexed and terminal failure events only', () => {
    consumer.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(consumer);
    expect(consumer.supports('document.indexed')).toBe(true);
    expect(consumer.supports('document.indexing_failed')).toBe(true);
    expect(consumer.supports('document.deleted')).toBe(false);
  });

  it('preserves the legacy indexed event contract for integrations and notifications', async () => {
    await consumer.handle(baseEvent);
    expect(eventEmitter.emit).toHaveBeenCalledWith('document.indexed', expect.objectContaining({
      documentId: baseEvent.aggregateId,
      documentName: 'strategy.txt',
      uploadedById: baseEvent.actorId,
      actorId: baseEvent.actorId,
      organizationId: baseEvent.organizationId,
      teamId: baseEvent.teamId,
      chunkCount: 4,
      eventId: baseEvent.id,
    }));
  });

  it('maps terminal indexing failure to the legacy failure event without leaking internal errors', async () => {
    const failedEvent: LuieDomainEvent = {
      ...baseEvent,
      eventType: 'document.indexing_failed',
      eventKey: 'document.indexing_failed:stable-key',
      payload: {
        documentId: baseEvent.aggregateId,
        documentName: 'strategy.txt',
        uploadedById: baseEvent.actorId,
        previousIndexRetained: true,
        failureCode: 'document_processing_failed',
        internalError: 'provider secret and raw stack trace',
      },
    };

    await consumer.handle(failedEvent);
    expect(eventEmitter.emit).toHaveBeenCalledWith('document.failed', expect.objectContaining({
      documentId: baseEvent.aggregateId,
      documentName: 'strategy.txt',
      uploadedById: baseEvent.actorId,
      organizationId: baseEvent.organizationId,
      errorMessage: 'The latest indexing attempt failed. The previously indexed version remains available.',
    }));
    expect(JSON.stringify(eventEmitter.emit.mock.calls)).not.toContain('provider secret');
  });
});