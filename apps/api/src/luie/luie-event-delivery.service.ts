import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { LuieConsumerRegistry } from './luie-consumer.registry';
import type { LuieClaimedDelivery } from './luie-event.types';
import { LuiePermanentDeliveryError as PermanentDeliveryError } from './luie-event.types';

interface ClaimedDeliveryRow {
  delivery_id: string;
  consumer_name: string;
  attempt_count: number;
  lease_token: string;
  event_id: string;
  organization_id: string;
  event_key: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  actor_id: string | null;
  team_id: string | null;
  source_version: number;
  schema_version: number;
  payload: Record<string, unknown>;
  occurred_at: Date | string;
  created_at: Date | string;
}

interface ClaimedDelivery extends LuieClaimedDelivery {
  /** Unique token for this specific delivery attempt; never passed to a consumer. */
  leaseToken: string;
}

interface OrphanDeliveryRow {
  consumer_name: string;
  pending_count: number | string;
}

@Injectable()
export class LuieEventDeliveryService {
  private readonly logger = new Logger(LuieEventDeliveryService.name);
  private readonly batchSize = 10;
  private readonly maxAttempts = 8;
  private readonly leaseSeconds = 120;
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly registry: LuieConsumerRegistry,
  ) {}

  @Cron('*/10 * * * * *')
  async scheduledDrain(): Promise<void> {
    await this.drain();
  }

  /**
   * Reports persisted deliveries whose consumers are not registered in this API
   * process. These rows are intentionally not claimed; operators must register
   * the consumer or use an explicit replay/backfill procedure.
   */
  @Cron('0 */5 * * * *')
  async scheduledOrphanReport(): Promise<void> {
    await this.reportUnregisteredDeliveries();
  }

  /** Public for controlled operational invocation and deterministic tests. */
  async reportUnregisteredDeliveries(): Promise<void> {
    const registeredNames = this.registry.names();
    try {
      const result = await this.db.query<OrphanDeliveryRow>(
        `SELECT consumer_name, COUNT(*)::integer AS pending_count
           FROM luie_event_deliveries
          WHERE status IN ('pending', 'retry')
            AND NOT (consumer_name = ANY($1::text[]))
          GROUP BY consumer_name
          ORDER BY consumer_name`,
        [registeredNames],
      );

      for (const row of result.rows) {
        this.logger.warn(
          `LUIE has ${Number(row.pending_count)} pending/retry delivery record(s) for unregistered consumer "${row.consumer_name}". Register the consumer or execute an explicitly authorised backfill/recovery procedure.`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Could not inspect LUIE deliveries for unregistered consumers',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async drain(): Promise<void> {
    if (this.running) return;

    const consumerNames = this.registry.names();
    if (consumerNames.length === 0) return;

    this.running = true;
    try {
      const deliveries = await this.claimBatch(consumerNames);
      await Promise.all(
        deliveries.map((delivery) =>
          this.processDelivery(delivery).catch((error: unknown) => {
            this.logger.error(
              `Unexpected LUIE delivery failure for ${delivery.deliveryId}`,
              error instanceof Error ? error.stack : String(error),
            );
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        'LUIE event delivery batch failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  private async claimBatch(consumerNames: string[]): Promise<ClaimedDelivery[]> {
    return this.db.transaction(async (client: PoolClient) => {
      // Expired final attempts cannot be reclaimed and must be terminally closed.
      await client.query(
        `UPDATE luie_event_deliveries
            SET status = 'dead_letter',
                lease_expires_at = NULL,
                worker_id = NULL,
                last_error = COALESCE(last_error, 'Delivery lease expired after maximum attempts.'),
                updated_at = NOW()
          WHERE status = 'processing'
            AND lease_expires_at <= NOW()
            AND attempt_count >= $1`,
        [this.maxAttempts],
      );

      const result = await client.query<ClaimedDeliveryRow>(
        `WITH candidates AS (
           SELECT delivery.id,
                  'luie-' || gen_random_uuid()::text AS lease_token
             FROM luie_event_deliveries delivery
            WHERE delivery.consumer_name = ANY($1::text[])
              AND delivery.attempt_count < $2
              AND (
                (delivery.status IN ('pending', 'retry') AND delivery.next_attempt_at <= NOW())
                OR
                (delivery.status = 'processing' AND delivery.lease_expires_at <= NOW())
              )
            ORDER BY
              CASE
                WHEN delivery.status = 'processing' THEN delivery.lease_expires_at
                ELSE delivery.next_attempt_at
              END ASC,
              delivery.created_at ASC,
              delivery.id ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
         )
         UPDATE luie_event_deliveries delivery
            SET status = 'processing',
                attempt_count = delivery.attempt_count + 1,
                lease_expires_at = NOW() + ($4::integer * INTERVAL '1 second'),
                worker_id = candidates.lease_token,
                last_error = NULL,
                updated_at = NOW()
           FROM candidates, luie_domain_events event
          WHERE delivery.id = candidates.id
            AND event.id = delivery.event_id
         RETURNING
           delivery.id AS delivery_id,
           delivery.consumer_name,
           delivery.attempt_count,
           delivery.worker_id AS lease_token,
           event.id AS event_id,
           event.organization_id,
           event.event_key,
           event.event_type,
           event.aggregate_type,
           event.aggregate_id,
           event.actor_id,
           event.team_id,
           event.source_version,
           event.schema_version,
           event.payload,
           event.occurred_at,
           event.created_at`,
        [consumerNames, this.maxAttempts, this.batchSize, this.leaseSeconds],
      );

      return result.rows.map((row) => this.mapDelivery(row));
    });
  }

  private mapDelivery(row: ClaimedDeliveryRow): ClaimedDelivery {
    return {
      deliveryId: row.delivery_id,
      consumerName: row.consumer_name,
      attemptCount: Number(row.attempt_count),
      leaseToken: row.lease_token,
      id: row.event_id,
      organizationId: row.organization_id,
      eventKey: row.event_key,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      actorId: row.actor_id,
      teamId: row.team_id,
      sourceVersion: Number(row.source_version),
      schemaVersion: Number(row.schema_version),
      payload: row.payload,
      occurredAt: row.occurred_at,
      createdAt: row.created_at,
    };
  }

  private async processDelivery(claimed: ClaimedDelivery): Promise<void> {
    const { leaseToken, ...delivery } = claimed;
    const consumer = this.registry.get(delivery.consumerName);

    if (!consumer) {
      await this.failDelivery(
        claimed,
        new PermanentDeliveryError(`No registered LUIE consumer named "${delivery.consumerName}".`),
      );
      return;
    }

    let supported: boolean;
    try {
      supported = consumer.supports(delivery.eventType);
    } catch (error) {
      await this.failDelivery(
        claimed,
        new PermanentDeliveryError(
          `Consumer "${consumer.name}" supports() threw: ${this.errorMessage(error)}`,
        ),
      );
      return;
    }

    if (!supported) {
      await this.failDelivery(
        claimed,
        new PermanentDeliveryError(
          `Consumer "${consumer.name}" does not support event "${delivery.eventType}".`,
        ),
      );
      return;
    }

    const heartbeatMs = Math.max(10, Math.floor(this.leaseSeconds / 3)) * 1000;
    const heartbeat = setInterval(() => {
      void this.extendLease(delivery.deliveryId, leaseToken)
        .then((stillOwned) => {
          if (!stillOwned) {
            this.logger.warn(
              `LUIE delivery lease ${delivery.deliveryId} is no longer owned by this attempt; the consumer may still be running, but acknowledgement will be rejected.`,
            );
          }
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Could not extend LUIE delivery lease ${delivery.deliveryId}: ${this.errorMessage(error)}`,
          );
        });
    }, heartbeatMs);

    try {
      // Consumers must be idempotent: a process can crash after its side effect
      // succeeds but before this delivery acknowledgement commits.
      await consumer.handle(delivery);

      const acknowledged = await this.db.query(
        `UPDATE luie_event_deliveries
            SET status = 'delivered',
                delivered_at = NOW(),
                lease_expires_at = NULL,
                worker_id = NULL,
                last_error = NULL,
                updated_at = NOW()
          WHERE id = $1::uuid
            AND status = 'processing'
            AND worker_id = $2`,
        [delivery.deliveryId, leaseToken],
      );

      if ((acknowledged.rowCount ?? 0) !== 1) {
        this.logger.warn(
          `LUIE delivery ${delivery.deliveryId} completed its handler but its lease was no longer owned; no acknowledgement was written. A later attempt may execute the consumer again.`,
        );
      }
    } catch (error) {
      await this.failDelivery(claimed, error);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async extendLease(deliveryId: string, leaseToken: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE luie_event_deliveries
          SET lease_expires_at = NOW() + ($3::integer * INTERVAL '1 second'),
              updated_at = NOW()
        WHERE id = $1::uuid
          AND status = 'processing'
          AND worker_id = $2`,
      [deliveryId, leaseToken, this.leaseSeconds],
    );
    return (result.rowCount ?? 0) === 1;
  }

  private async failDelivery(claimed: ClaimedDelivery, error: unknown): Promise<void> {
    const permanent = error instanceof PermanentDeliveryError;
    const deadLetter = permanent || claimed.attemptCount >= this.maxAttempts;
    const status = deadLetter ? 'dead_letter' : 'retry';
    const delaySeconds = Math.min(
      900,
      2 ** Math.max(0, claimed.attemptCount - 1) * 5,
    );
    const message = this.errorMessage(error).slice(0, 4000);

    const result = await this.db.query(
      `UPDATE luie_event_deliveries
          SET status = $3,
              next_attempt_at = CASE
                WHEN $3 = 'retry' THEN NOW() + ($4::integer * INTERVAL '1 second')
                ELSE next_attempt_at
              END,
              lease_expires_at = NULL,
              worker_id = NULL,
              last_error = $5,
              updated_at = NOW()
        WHERE id = $1::uuid
          AND status = 'processing'
          AND worker_id = $2`,
      [claimed.deliveryId, claimed.leaseToken, status, delaySeconds, message],
    );

    if ((result.rowCount ?? 0) !== 1) {
      this.logger.warn(
        `LUIE delivery ${claimed.deliveryId} failure state was not changed because this attempt no longer owns its lease.`,
      );
      return;
    }

    if (deadLetter) {
      this.logger.error(
        `LUIE delivery ${claimed.deliveryId} moved to dead-letter state${permanent ? ' (permanent failure)' : ' (maximum attempts reached)'}: ${message}`,
      );
    } else {
      this.logger.warn(
        `LUIE delivery ${claimed.deliveryId} scheduled for retry in ${delaySeconds}s: ${message}`,
      );
    }
  }

  private errorMessage(error: unknown): string {
    const raw = error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);

    return raw
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(/\b(password|secret|token|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi, '$1=[REDACTED]');
  }
}