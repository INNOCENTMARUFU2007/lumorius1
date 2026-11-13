import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { KnowledgeExtractionService } from './knowledge-extraction.service';

interface DocumentIndexedPayload {
  documentId: string;
  organizationId: string;
  documentName?: string;
  uploadedById?: string;
  chunkCount?: number;
}

@Injectable()
export class KnowledgeDocumentListener {
  private readonly logger = new Logger(KnowledgeDocumentListener.name);

  constructor(
    private readonly extractionService: KnowledgeExtractionService,
  ) {}

  @OnEvent('document.indexed', { async: true })
  async handleDocumentIndexed(
    event: DocumentIndexedPayload,
  ): Promise<void> {
    if (!event?.documentId || !event?.organizationId) {
      this.logger.warn(
        'Ignored document.indexed event: missing document or organization ID.',
      );
      return;
    }

    try {
      await this.extractionService.processDocument({
        documentId: event.documentId,
        organizationId: event.organizationId,
        documentName: event.documentName,
      });

      this.logger.log(
        `Knowledge extraction listener completed for ${event.documentId}.`,
      );
    } catch (error) {
      this.logger.error(
        `Knowledge extraction listener failed for ${event.documentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}