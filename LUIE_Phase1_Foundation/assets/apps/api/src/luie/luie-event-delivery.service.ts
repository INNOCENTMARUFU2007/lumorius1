import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { LuieConsumerRegistry } from './luie-consumer.registry';
import type { LuieClaimedDelivery } from './luie-event.types';

interface ClaimedDeliveryRow {
  delivery_id: string;
  consumer_name: string;
  attempt_count: number;
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

@Injectable()
export class LuieEventDeliveryService {
  private readonly logger = new Logger(LuieEventDeliveryService.name);
  private readonly workerId = `luie-${randomUUID()}`;
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

  /** Public for controlled operational invocation and deterministic tests. */
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

  private async claimBatch(consumerNames: string[]): Promise<LuieClaimedDelivery[]> {
    return this.db.transaction(async (client: PoolClient) => {
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
           SELECT delivery.id
             FROM luie_event_deliveries delivery
            WHERE delivery.consumer_name = ANY($1::text[])
              AND delivery.attempt_count < $2
              AND (
                (delivery.status IN ('pending', 'retry') AND delivery.next_attempt_at <= NOW())
                OR
                (delivery.status = 'processing' AND delivery.lease_expires_at <= NOW())
              )
            ORDER BY delivery.next_attempt_at ASC, delivery.created_at ASC, delivery.id ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
         )
         UPDATE luie_event_deliveries delivery
            SET status = 'processing',
                attempt_count = delivery.attempt_count + 1,
                lease_expires_at = NOW() + ($4::integer * INTERVAL '1 second'),
                worker_id = $5,
                last_error = NULL,
                updated_at = NOW()
           FROM candidates, luie_domain_events event
          WHERE delivery.id = candidates.id
            AND event.id = delivery.event_id
         RETURNING
           delivery.id AS delivery_id,
           delivery.consumer_name,
           delivery.attempt_count,
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
        [consumerNames, this.maxAttempts, this.batchSize, this.leaseSeconds, this.workerId],
      );

      return result.rows.map((row) => this.mapDelivery(row));
    });
  }

  private mapDelivery(row: ClaimedDeliveryRow): LuieClaimedDelivery {
    return {
      deliveryId: row.delivery_id,
      consumerName: row.consumer_name,
      attemptCount: Number(row.attempt_count),
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

  private async processDelivery(delivery: LuieClaimedDelivery): Promise<void> {
    const consumer = this.registry.get(delivery.consumerName);
    if (!consumer) {
      await this.failDelivery(delivery, new Error(`No registered LUIE consumer named "${delivery.consumerName}".`));
      return;
    }
    if (!consumer.supports(delivery.eventType)) {
      await this.failDelivery(delivery, new Error(`Consumer "${consumer.name}" does not support event "${delivery.eventType}".`));
      return;
    }

    const heartbeat = setInterval(() => {
      void this.extendLease(delivery.deliveryId).catch((error: unknown) => {
        this.logger.warn(
          `Could not extend LUIE delivery lease ${delivery.deliveryId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, Math.max(10, Math.floor(this.leaseSeconds / 3)) * 1000);

    try {
      await consumer.handle(delivery);
      await this.db.query(
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
        [delivery.deliveryId, this.workerId],
      );
    } catch (error) {
      await this.failDelivery(delivery, error);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async extendLease(deliveryId: string): Promise<void> {
    await this.db.query(
      `UPDATE luie_event_deliveries
          SET lease_expires_at = NOW() + ($3::integer * INTERVAL '1 second'),
              updated_at = NOW()
        WHERE id = $1::uuid
          AND status = 'processing'
          AND worker_id = $2`,
      [deliveryId, this.workerId, this.leaseSeconds],
    );
  }

  private async failDelivery(delivery: LuieClaimedDelivery, error: unknown): Promise<void> {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 4000);
    const deadLetter = delivery.attemptCount >= this.maxAttempts;
    const delaySeconds = Math.min(900, 2 ** Math.max(0, delivery.attemptCount - 1) * 5);

    await this.db.query(
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
      [delivery.deliveryId, this.workerId, deadLetter ? 'dead_letter' : 'retry', delaySeconds, message],
    );

    if (deadLetter) {
      this.logger.error(`LUIE delivery ${delivery.deliveryId} moved to dead-letter state: ${message}`);
    } else {
      this.logger.warn(`LUIE delivery ${delivery.deliveryId} scheduled for retry: ${message}`);
    }
  }
}
