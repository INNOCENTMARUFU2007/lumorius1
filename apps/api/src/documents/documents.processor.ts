import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { EmbeddingService } from './embedding.service';
import { AiService } from '../ai/ai.service';

@Processor('documents')
export class DocumentsProcessor {
  private readonly logger = new Logger(DocumentsProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly embeddingService: EmbeddingService,
    private readonly aiService: AiService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Process('process')
  async processDocument(job: Job<{ documentId: string; organizationId: string }>) {
    const { documentId, organizationId } = job.data;
    this.logger.log(`Processing document ${documentId}`);

    try {
      await this.db.query(
        "UPDATE documents SET status = 'processing' WHERE id = $1",
        [documentId],
      );

      const doc = await this.db.findOne<Record<string, unknown>>('documents', { id: documentId });
      if (!doc) throw new Error('Document not found');

      const buffer = await this.storage.download(doc.storage_key as string);
      const text = await this.embeddingService.extractText(buffer, doc.type as string, doc.name as string);

      const chunks = this.embeddingService.chunkText(text, 1000, 200);
      this.logger.log(`Split document into ${chunks.length} chunks`);

      const batchSize = 20;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const embeddings = await this.aiService.createEmbeddings(batch.map((c) => c.text));

        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = embeddings[j];
          await this.db.query(
            `INSERT INTO document_chunks (id, document_id, content, chunk_index, token_count, embedding)
             VALUES ($1, $2, $3, $4, $5, $6::vector)`,
            [
              uuidv4(), documentId, chunk.text, i + j,
              chunk.tokenCount, `[${embedding.join(',')}]`,
            ],
          );
        }
        await job.progress(Math.round(((i + batchSize) / chunks.length) * 90));
      }

      await this.db.query(
        `UPDATE documents SET status = 'indexed', chunk_count = $1, updated_at = NOW() WHERE id = $2`,
        [chunks.length, documentId],
      );

      await job.progress(100);
      this.logger.log(`Document ${documentId} indexed successfully`);

      // Emit real-time notification event
      this.eventEmitter.emit('document.indexed', {
        documentId,
        documentName: doc.name as string,
        uploadedById: doc.uploaded_by_id as string,
        organizationId,
        chunkCount: chunks.length,
      });
    } catch (error) {
      this.logger.error(`Failed to process document ${documentId}`, error);
      await this.db.query(
        `UPDATE documents SET status = 'failed', error_message = $1 WHERE id = $2`,
        [String(error), documentId],
      );

      // Emit failure notification event
      const doc = await this.db.findOne<Record<string, unknown>>('documents', { id: documentId });
      if (doc) {
        this.eventEmitter.emit('document.failed', {
          documentId,
          documentName: doc.name as string,
          uploadedById: doc.uploaded_by_id as string,
          organizationId,
          errorMessage: String(error),
        });
      }

      throw error;
    }
  }
}
