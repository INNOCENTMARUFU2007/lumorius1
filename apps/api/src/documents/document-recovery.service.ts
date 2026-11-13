import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bull';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';

interface FailedDocumentRow {
  id: string;
  organization_id: string;
}

interface StorageCleanupRow {
  id: string;
  storage_key: string;
  attempts: number;
}

@Injectable()
export class DocumentRecoveryService {
  private readonly logger = new Logger(DocumentRecoveryService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    @InjectQueue('documents') private readonly documentsQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runRecovery(): Promise<void> {
    try {
      await this.recoverFailedDocumentQueues();
    } catch (error) {
      this.logger.error(
        'Document queue recovery scan failed.',
        error instanceof Error ? error.stack : undefined,
      );
    }
    try {
      await this.recoverStorageCleanup();
    } catch (error) {
      this.logger.error(
        'Document storage cleanup scan failed.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async recoverFailedDocumentQueues(): Promise<void> {
    const result = await this.db.query<FailedDocumentRow>(
      `SELECT id, organization_id
         FROM documents
        WHERE status::text = 'failed'
          AND error_message LIKE 'Document processing queue submission failed after 3 attempts:%'
          AND COALESCE(queue_recovery_attempts, 0) < 5
          AND (queue_next_attempt_at IS NULL OR queue_next_attempt_at <= NOW())
        ORDER BY updated_at ASC, organization_id ASC, id ASC
        LIMIT 25`,
    );

    for (const document of result.rows) {
      try {
        const existingJob = await this.documentsQueue.getJob(document.id);
        let addJob = true;

        if (existingJob) {
          const state = await existingJob.getState();
          if (state === 'failed' || state === 'completed') {
            await existingJob.remove();
          } else {
            // Waiting/active/delayed jobs already provide delivery; do not duplicate them.
            addJob = false;
          }
        }

        if (addJob) {
          await this.documentsQueue.add(
            'process',
            {
              documentId: document.id,
              organizationId: document.organization_id,
            },
            {
              jobId: document.id,
              priority: 1,
              attempts: 3,
              backoff: { type: 'exponential', delay: 5000 },
              removeOnComplete: 500,
              removeOnFail: 200,
            },
          );
        }

        await this.db.query(
          `UPDATE documents
              SET status = 'uploading',
                  error_message = NULL,
                  queue_next_attempt_at = NULL,
                  updated_at = NOW()
            WHERE id = $1::uuid
              AND organization_id = $2::uuid
              AND status::text = 'failed'
              AND error_message LIKE 'Document processing queue submission failed after 3 attempts:%'`,
          [document.id, document.organization_id],
        );
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 3500);
        this.logger.error(
          `Document queue recovery failed for ${document.id}: ${message}`,
        );
        try {
          await this.db.query(
            `UPDATE documents
                SET queue_recovery_attempts = COALESCE(queue_recovery_attempts, 0) + 1,
                    queue_next_attempt_at = NOW() +
                      (LEAST(60, POWER(2, LEAST(COALESCE(queue_recovery_attempts, 0), 6)))::int * INTERVAL '1 minute'),
                    error_message = LEFT(
                      'Document processing queue submission failed after 3 attempts: ' || $1,
                      4000
                    ),
                    updated_at = NOW()
              WHERE id = $2::uuid
                AND organization_id = $3::uuid
                AND status::text = 'failed'`,
            [message, document.id, document.organization_id],
          );
        } catch (persistError) {
          this.logger.error(
            `Could not persist document queue recovery failure for ${document.id}: ${
              persistError instanceof Error ? persistError.message : String(persistError)
            }`,
          );
        }
      }
    }
  }

  async recoverStorageCleanup(): Promise<void> {
    const claimed = await this.db.transaction(async (client) => {
      const due = await client.query<StorageCleanupRow>(
        `SELECT id, storage_key, attempts
           FROM document_storage_cleanup_outbox
          WHERE (status = 'pending' AND next_attempt_at <= NOW())
             OR (status = 'processing' AND lease_expires_at <= NOW())
          ORDER BY next_attempt_at ASC, created_at ASC, id ASC
          LIMIT 25
          FOR UPDATE SKIP LOCKED`,
      );

      for (const row of due.rows) {
        await client.query(
          `UPDATE document_storage_cleanup_outbox
              SET status = 'processing',
                  attempts = attempts + 1,
                  lease_expires_at = NOW() + INTERVAL '5 minutes',
                  updated_at = NOW()
            WHERE id = $1::uuid`,
          [row.id],
        );
      }

      return due.rows.map((row) => ({ ...row, attempts: Number(row.attempts ?? 0) + 1 }));
    });

    for (const item of claimed) {
      try {
        // S3 DeleteObject is idempotent for an already-absent key; this also handles
        // a crash after object deletion but before outbox acknowledgement.
        await this.storage.delete(item.storage_key);
        await this.db.query(
          `DELETE FROM document_storage_cleanup_outbox
            WHERE id = $1::uuid AND status = 'processing'`,
          [item.id],
        );
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 4000);
        this.logger.error(
          `Document storage cleanup retry failed for outbox item ${item.id}: ${message}`,
        );
        try {
          await this.db.query(
            `UPDATE document_storage_cleanup_outbox
                SET status = 'pending',
                    lease_expires_at = NULL,
                    next_attempt_at = NOW() +
                      (LEAST(3600, POWER(2, LEAST(attempts, 10)) * 30)::int * INTERVAL '1 second'),
                    last_error = $2,
                    updated_at = NOW()
              WHERE id = $1::uuid AND status = 'processing'`,
            [item.id, message],
          );
        } catch (persistError) {
          this.logger.error(
            `Could not reschedule storage cleanup item ${item.id}: ${
              persistError instanceof Error ? persistError.message : String(persistError)
            }`,
          );
        }
      }
    }
  }
}