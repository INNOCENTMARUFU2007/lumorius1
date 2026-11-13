import { Injectable, OnModuleInit } from '@nestjs/common';
import { LuieConsumerRegistry } from '../luie/luie-consumer.registry';
import {
  LuieDomainEvent,
  LuieEventConsumer,
  LuiePermanentDeliveryError,
} from '../luie/luie-event.types';
import { KnowledgeExtractionService } from './knowledge-extraction.service';

@Injectable()
export class KnowledgeDocumentConsumer implements LuieEventConsumer, OnModuleInit {
  readonly name = 'luie.knowledge-extraction';

  constructor(
    private readonly registry: LuieConsumerRegistry,
    private readonly extractionService: KnowledgeExtractionService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(eventType: string): boolean {
    return eventType === 'document.indexed';
  }

  async handle(event: LuieDomainEvent): Promise<void> {
    const documentId = event.payload?.documentId;
    if (typeof documentId !== 'string' || !documentId.trim()) {
      throw new LuiePermanentDeliveryError(
        'document.indexed event is missing its documentId.',
      );
    }

    await this.extractionService.processDocument({
      documentId,
      organizationId: event.organizationId,
      documentName: typeof event.payload.documentName === 'string'
        ? event.payload.documentName
        : undefined,
    });
  }
}