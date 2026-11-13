import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LuieConsumerRegistry } from '../luie/luie-consumer.registry';
import {
  LuieDomainEvent,
  LuieEventConsumer,
  LuiePermanentDeliveryError,
} from '../luie/luie-event.types';

@Injectable()
export class DocumentLegacyEventBridgeConsumer implements LuieEventConsumer, OnModuleInit {
  readonly name = 'luie.document-legacy-bridge';

  constructor(
    private readonly registry: LuieConsumerRegistry,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(eventType: string): boolean {
    return eventType === 'document.indexed' || eventType === 'document.indexing_failed';
  }

  async handle(event: LuieDomainEvent): Promise<void> {
    const documentId = event.payload?.documentId;
    if (typeof documentId !== 'string' || !documentId.trim()) {
      throw new LuiePermanentDeliveryError(
        `${event.eventType} event is missing its documentId.`,
      );
    }

    const documentName = typeof event.payload.documentName === 'string' && event.payload.documentName.trim()
      ? event.payload.documentName
      : 'Document';
    const uploadedById = typeof event.payload.uploadedById === 'string'
      ? event.payload.uploadedById
      : event.actorId ?? '';

    if (event.eventType === 'document.indexed') {
      const chunkCount = typeof event.payload.chunkCount === 'number' &&
        Number.isSafeInteger(event.payload.chunkCount) && event.payload.chunkCount >= 0
        ? event.payload.chunkCount
        : 0;

      this.eventEmitter.emit('document.indexed', {
        documentId,
        documentName,
        uploadedById,
        actorId: event.actorId,
        organizationId: event.organizationId,
        teamId: event.teamId,
        chunkCount,
        eventId: event.id,
        eventKey: event.eventKey,
      });
      return;
    }

    const previousIndexRetained = event.payload.previousIndexRetained === true;
    this.eventEmitter.emit('document.failed', {
      documentId,
      documentName,
      uploadedById,
      actorId: event.actorId,
      organizationId: event.organizationId,
      teamId: event.teamId,
      eventId: event.id,
      eventKey: event.eventKey,
      errorMessage: previousIndexRetained
        ? 'The latest indexing attempt failed. The previously indexed version remains available.'
        : 'Document processing failed after all configured retry attempts.',
    });
  }
}