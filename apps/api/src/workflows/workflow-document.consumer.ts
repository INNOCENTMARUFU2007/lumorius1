import { Injectable, OnModuleInit } from '@nestjs/common';
import { LuieConsumerRegistry } from '../luie/luie-consumer.registry';
import {
  LuieDomainEvent,
  LuieEventConsumer,
  LuiePermanentDeliveryError,
} from '../luie/luie-event.types';
import { WorkflowsService } from './workflows.service';

const DOCUMENT_WORKFLOW_EVENTS = new Set([
  'document.indexed',
  'document.deleted',
  'document.indexing_failed',
]);

@Injectable()
export class WorkflowDocumentConsumer implements LuieEventConsumer, OnModuleInit {
  readonly name = 'luie.workflow-dispatch';

  constructor(
    private readonly registry: LuieConsumerRegistry,
    private readonly workflows: WorkflowsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(eventType: string): boolean {
    return DOCUMENT_WORKFLOW_EVENTS.has(eventType);
  }

  async handle(event: LuieDomainEvent): Promise<void> {
    const documentId = event.payload?.documentId;
    if (typeof documentId !== 'string' || !documentId.trim()) {
      throw new LuiePermanentDeliveryError(
        `${event.eventType} event is missing its documentId.`,
      );
    }

    const payload: Record<string, unknown> = {
      ...event.payload,
      documentId,
      organizationId: event.organizationId,
      eventId: event.id,
      eventKey: event.id,
      actorId: event.actorId,
      teamId: event.teamId,
    };

    await this.workflows.dispatchEvent(
      event.organizationId,
      event.eventType,
      payload,
      event.id,
      event.actorId,
    );
  }
}