import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { EmbeddingService } from './embedding.service';
import { AiService } from '../ai/ai.service';
import { LuieEventPublisher } from '../luie/luie-event.publisher';

const EXPECTED_EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH_SIZE = 20;

@Processor('documents')
export class DocumentsProcessor {
  private readonly logger = new Logger(DocumentsProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly embeddingService: EmbeddingService,
    private readonly aiService: AiService,
    private readonly luiePublisher: LuieEventPublisher,
  ) {}

  @Process('process')
  async processDocument(job: Job<{ documentId: string; organizationId: string }>) {
    const { documentId, organizationId } = job.data;
    this.logger.log(`Processing document ${documentId} in organization ${organizationId}`);

    let document: Record<string, unknown> | undefined;
    let indexCommitted = false;

    const jobTimestamp = Number(job.timestamp);
    const jobId = String(job.id ?? '').trim();
    if (!Number.isSafeInteger(jobTimestamp) || jobTimestamp <= 0 || !jobId || jobId.length > 100) {
      throw new Error('Document job is missing a valid, stable Bull job identity.');
    }
    const eventOccurredAt = new Date(jobTimestamp);
    const eventIdentity = `${documentId}:${jobId}:${jobTimestamp}`;
    const configuredAttempts = Number(job.opts?.attempts ?? 1);
    const maxAttempts = Number.isSafeInteger(configuredAttempts) && configuredAttempts > 0
      ? configuredAttempts
      : 1;
    const attemptsMade = Number.isSafeInteger(job.attemptsMade) && job.attemptsMade >= 0
      ? job.attemptsMade
      : 0;
    const isTerminalAttempt = attemptsMade + 1 >= maxAttempts;

    try {
      const documentResult = await this.db.query<Record<string, unknown>>(
        `SELECT id, organization_id, name, type, storage_key, uploaded_by_id, status, team_id
           FROM documents
          WHERE id = $1::uuid
            AND organization_id = $2::uuid
          LIMIT 1`,
        [documentId, organizationId],
      );
      document = documentResult.rows[0];

      if (!document) {
        throw new Error('Document not found in the specified organization.');
      }

      const processingResult = await this.db.query(
        `UPDATE documents
            SET status = 'processing', error_message = NULL, updated_at = NOW()
          WHERE id = $1::uuid AND organization_id = $2::uuid
          RETURNING id`,
        [documentId, organizationId],
      );
      if (!processingResult.rows[0]) {
        throw new Error('Document processing claim failed; the document may have been removed.');
      }

      const storageKey = String(document.storage_key ?? '').trim();
      if (!storageKey) throw new Error('Document has no storage key.');

      const buffer = await this.storage.download(storageKey);
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Document storage returned an empty file.');
      }

      const extractedText = await this.embeddingService.extractText(
        buffer,
        String(document.type ?? ''),
        String(document.name ?? documentId),
      );
      if (!extractedText || !extractedText.trim()) {
        throw new Error('Document extraction produced no readable text.');
      }

      const chunks = this.embeddingService.chunkText(extractedText, 1000, 200);
      if (chunks.length === 0) {
        throw new Error('Document extraction produced no indexable chunks.');
      }
      this.logger.log(`Document ${documentId} produced ${chunks.length} chunks`);

      const userId = typeof document.uploaded_by_id === 'string'
        ? document.uploaded_by_id
        : undefined;
      const embeddings: number[][] = [];

      for (let offset = 0; offset < chunks.length; offset += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(offset, offset + EMBEDDING_BATCH_SIZE);
        const batchEmbeddings = await this.aiService.createEmbeddings(
          batch.map((chunk) => chunk.text),
          {
            organizationId,
            userId,
            feature: 'document_indexing',
          },
        );

        if (!Array.isArray(batchEmbeddings) || batchEmbeddings.length !== batch.length) {
          throw new Error(`Embedding provider returned an incomplete batch for document ${documentId}.`);
        }

        for (const embedding of batchEmbeddings) {
          if (
            !Array.isArray(embedding) ||
            embedding.length !== EXPECTED_EMBEDDING_DIMENSIONS ||
            embedding.some((value) => !Number.isFinite(value))
          ) {
            throw new Error(
              `Embedding dimensions or values are invalid for document ${documentId}; expected ${EXPECTED_EMBEDDING_DIMENSIONS} finite values.`,
            );
          }
          embeddings.push(embedding);
        }

        const completed = Math.min(offset + batch.length, chunks.length);
        await job.progress(Math.min(90, Math.round((completed / chunks.length) * 90)));
      }

      if (embeddings.length !== chunks.length) {
        throw new Error(`Embedding count mismatch for document ${documentId}.`);
      }

      // Replace the previous index only after extraction and every embedding succeeded.
      // The delete, inserts, and indexed status transition commit as one transaction.
      await this.db.transaction(async (client) => {
        await client.query(
          `DELETE FROM document_chunks dc
            USING documents d
           WHERE dc.document_id = d.id
             AND d.id = $1::uuid
             AND d.organization_id = $2::uuid`,
          [documentId, organizationId],
        );

        for (let index = 0; index < chunks.length; index += 1) {
          const chunk = chunks[index];
          const embedding = embeddings[index];
          await client.query(
            `INSERT INTO document_chunks
               (id, document_id, content, chunk_index, token_count, embedding)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::vector)`,
            [
              uuidv4(),
              documentId,
              chunk.text,
              index,
              chunk.tokenCount,
              `[${embedding.join(',')}]`,
            ],
          );
        }

        const indexed = await client.query(
          `UPDATE documents
              SET status = 'indexed',
                  chunk_count = $1,
                  error_message = NULL,
                  updated_at = NOW()
            WHERE id = $2::uuid
              AND organization_id = $3::uuid
            RETURNING id`,
          [chunks.length, documentId, organizationId],
        );

        if (!indexed.rows[0]) {
          throw new Error('Document disappeared before the new index could be committed.');
        }

        const teamId = typeof document.team_id === 'string' ? document.team_id : null;
        await this.luiePublisher.append(client, {
          organizationId,
          eventKey: `document.indexed:${eventIdentity}`,
          eventType: 'document.indexed',
          aggregateType: 'document',
          aggregateId: documentId,
          actorId: userId ?? null,
          teamId,
          occurredAt: eventOccurredAt,
          payload: {
            documentId,
            documentName: String(document.name ?? ''),
            uploadedById: userId ?? null,
            actorId: userId ?? null,
            organizationId,
            teamId,
            chunkCount: chunks.length,
          },
        }, ['luie.document-legacy-bridge', 'luie.knowledge-extraction', 'luie.workflow-dispatch']);
      });
      indexCommitted = true;

      await job.progress(100);
      this.logger.log(`Document ${documentId} indexed successfully`);


    } catch (error) {
      const errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, 4000);
      this.logger.error(
        `Failed to process document ${documentId}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      if (!indexCommitted) {
        try {
          // If a previous complete index exists, retain it. The indexing transaction
          // prevents a partially replaced set of chunks from becoming visible.
          await this.db.transaction(async (client) => {
            const failureState = await client.query<{ status: string }>(
              `UPDATE documents
                  SET status = CASE
                        WHEN EXISTS (
                          SELECT 1 FROM document_chunks dc
                           WHERE dc.document_id = documents.id
                        ) THEN 'indexed'
                        ELSE 'failed'
                      END,
                      error_message = $1,
                      updated_at = NOW()
                WHERE id = $2::uuid AND organization_id = $3::uuid
                RETURNING status`,
              [errorMessage, documentId, organizationId],
            );

            const persistedStatus = failureState.rows[0]?.status;
            if (document && persistedStatus && isTerminalAttempt) {
              const teamId = typeof document.team_id === 'string' ? document.team_id : null;
              const userId = typeof document.uploaded_by_id === 'string'
                ? document.uploaded_by_id
                : null;
              await this.luiePublisher.append(client, {
                organizationId,
                eventKey: `document.indexing_failed:${eventIdentity}`,
                eventType: 'document.indexing_failed',
                aggregateType: 'document',
                aggregateId: documentId,
                actorId: userId,
                teamId,
                occurredAt: eventOccurredAt,
                payload: {
                  documentId,
                  documentName: String(document.name ?? ''),
                  uploadedById: userId,
                  organizationId,
                  teamId,
                  failureCode: 'document_processing_failed',
                  previousIndexRetained: persistedStatus === 'indexed',
                },
              }, ['luie.document-legacy-bridge', 'luie.workflow-dispatch']);
            }
          });
        } catch (statusError) {
          this.logger.error(
            `Could not persist document failure status for ${documentId}: ${
              statusError instanceof Error ? statusError.message : String(statusError)
            }`,
          );
        }


      } else {
        this.logger.warn(
          `Document ${documentId} was indexed successfully, but a post-commit operation failed; preserving the committed index.`,
        );
      }

      throw error;
    }
  }
}