import { LuieConsumerRegistry } from '../luie/luie-consumer.registry';
import { LuieDomainEvent } from '../luie/luie-event.types';
import { KnowledgeExtractionService } from './knowledge-extraction.service';
import { KnowledgeDocumentConsumer } from './knowledge-document.consumer';

const event: LuieDomainEvent = {
  id: 'event-1',
  organizationId: '22222222-2222-4222-8222-222222222222',
  eventKey: 'document.indexed:one',
  eventType: 'document.indexed',
  aggregateType: 'document',
  aggregateId: '11111111-1111-4111-8111-111111111111',
  actorId: null,
  teamId: null,
  sourceVersion: 1,
  schemaVersion: 1,
  payload: { documentId: '11111111-1111-4111-8111-111111111111' },
  occurredAt: new Date('2026-11-08T10:00:00.000Z'),
  createdAt: new Date('2026-11-08T10:00:00.000Z'),
};

describe('KnowledgeDocumentConsumer', () => {
  const registry = { register: jest.fn() };
  const extraction = { processDocument: jest.fn().mockResolvedValue(undefined) };
  let consumer: KnowledgeDocumentConsumer;

  beforeEach(() => {
    jest.clearAllMocks();
    consumer = new KnowledgeDocumentConsumer(
      registry as unknown as LuieConsumerRegistry,
      extraction as unknown as KnowledgeExtractionService,
    );
  });

  it('registers itself with LUIE and supports only document.indexed', () => {
    consumer.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(consumer);
    expect(consumer.supports('document.indexed')).toBe(true);
    expect(consumer.supports('document.deleted')).toBe(false);
  });

  it('delegates the document and organisation identifiers to the existing extraction service', async () => {
    await consumer.handle(event);
    expect(extraction.processDocument).toHaveBeenCalledWith({
      documentId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      documentName: undefined,
    });
  });
});