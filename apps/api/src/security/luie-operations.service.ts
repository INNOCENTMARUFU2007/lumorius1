import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LuieConsumerRegistry } from '../luie/luie-consumer.registry';

const DELIVERY_STATUSES = new Set(['pending', 'processing', 'retry', 'delivered', 'dead_letter']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DeliveryFilters = { status?: string; consumerName?: string; eventType?: string; limit?: string | number; offset?: string | number };

@Injectable()
export class LuieOperationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly registry: LuieConsumerRegistry,
  ) {}

  async getSummary(organizationId: string) {
    const [statuses, consumers, health, orphaned] = await Promise.all([
      this.db.query<{ status: string; count: number | string }>(
        `SELECT delivery.status, COUNT(*)::integer AS count
           FROM luie_event_deliveries delivery
           JOIN luie_domain_events evt ON evt.id = delivery.event_id
          WHERE evt.organization_id = $1::uuid
          GROUP BY delivery.status`, [organizationId]),
      this.db.query(
        `SELECT delivery.consumer_name,
                COUNT(*)::integer AS total_count,
                COUNT(*) FILTER (WHERE delivery.status = 'dead_letter')::integer AS dead_letter_count,
                COUNT(*) FILTER (WHERE delivery.status IN ('pending','retry'))::integer AS ready_count,
                COUNT(*) FILTER (WHERE delivery.status = 'processing')::integer AS processing_count
           FROM luie_event_deliveries delivery
           JOIN luie_domain_events evt ON evt.id = delivery.event_id
          WHERE evt.organization_id = $1::uuid
          GROUP BY delivery.consumer_name
          ORDER BY delivery.consumer_name`, [organizationId]),
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE delivery.status IN ('pending','retry'))::integer AS ready_count,
           MIN(delivery.created_at) FILTER (WHERE delivery.status IN ('pending','retry')) AS oldest_ready_at,
           COUNT(*) FILTER (WHERE delivery.status = 'processing' AND delivery.lease_expires_at <= NOW())::integer AS expired_lease_count
         FROM luie_event_deliveries delivery
         JOIN luie_domain_events evt ON evt.id = delivery.event_id
        WHERE evt.organization_id = $1::uuid`, [organizationId]),
      this.db.query<{ consumer_name: string; count: number | string }>(
        `SELECT delivery.consumer_name, COUNT(*)::integer AS count
           FROM luie_event_deliveries delivery
           JOIN luie_domain_events evt ON evt.id = delivery.event_id
          WHERE evt.organization_id = $1::uuid
            AND delivery.status IN ('pending','retry')
            AND NOT (delivery.consumer_name = ANY($2::text[]))
          GROUP BY delivery.consumer_name
          ORDER BY delivery.consumer_name`, [organizationId, this.registry.names()]),
    ]);

    const counts: Record<string, number> = {
      pending: 0, processing: 0, retry: 0, delivered: 0, dead_letter: 0,
    };
    for (const row of statuses.rows) {
      if (Object.prototype.hasOwnProperty.call(counts, row.status)) counts[row.status] = Number(row.count);
    }
    const healthRow = (health.rows[0] ?? {}) as Record<string, unknown>;
    return {
      counts,
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
      consumers: consumers.rows,
      oldestReadyAt: healthRow.oldest_ready_at ?? null,
      readyCount: Number(healthRow.ready_count ?? 0),
      expiredLeaseCount: Number(healthRow.expired_lease_count ?? 0),
      unregisteredConsumers: orphaned.rows,
      registeredConsumers: this.registry.names(),
      inspectedAt: new Date().toISOString(),
    };
  }

  async listDeliveries(organizationId: string, filters: DeliveryFilters = {}) {
    const conditions = ['evt.organization_id = $1::uuid'];
    const values: unknown[] = [organizationId];
    let index = 2;
    if (filters.status) {
      if (!DELIVERY_STATUSES.has(filters.status)) throw new BadRequestException('Invalid LUIE delivery status filter.');
      conditions.push(`delivery.status = $${index++}`);
      values.push(filters.status);
    }
    if (filters.consumerName) {
      if (!/^[a-z][a-z0-9_.-]{1,99}$/.test(filters.consumerName)) throw new BadRequestException('Invalid LUIE consumer name filter.');
      conditions.push(`delivery.consumer_name = $${index++}`);
      values.push(filters.consumerName);
    }
    if (filters.eventType) {
      if (!/^[a-z][a-z0-9]*(\.[a-z0-9_-]+)+$/.test(filters.eventType)) throw new BadRequestException('Invalid LUIE event type filter.');
      conditions.push(`evt.event_type = $${index++}`);
      values.push(filters.eventType);
    }
    const requestedLimit = Number(filters.limit ?? 50);
    const requestedOffset = Number(filters.offset ?? 0);
    const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 50;
    const offset = Number.isFinite(requestedOffset) ? Math.min(100000, Math.max(0, Math.floor(requestedOffset))) : 0;
    values.push(limit, offset);
    const result = await this.db.query(
      `SELECT delivery.id AS delivery_id, delivery.consumer_name, delivery.status,
              delivery.attempt_count, delivery.next_attempt_at, delivery.lease_expires_at,
              delivery.last_error, delivery.delivered_at, delivery.created_at, delivery.updated_at,
              evt.id AS event_id, evt.event_type, evt.event_key, evt.aggregate_type,
              evt.aggregate_id, evt.actor_id, evt.team_id, evt.occurred_at
         FROM luie_event_deliveries delivery
         JOIN luie_domain_events evt ON evt.id = delivery.event_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY delivery.updated_at DESC, delivery.id DESC
        LIMIT $${index++} OFFSET $${index}`,
      values,
    );
    return { items: result.rows, limit, offset };
  }

  async getDelivery(organizationId: string, deliveryId: string) {
    if (!UUID_PATTERN.test(deliveryId)) throw new BadRequestException('Invalid LUIE delivery ID.');
    const result = await this.db.query(
      `SELECT delivery.id AS delivery_id, delivery.consumer_name, delivery.status,
              delivery.attempt_count, delivery.next_attempt_at, delivery.lease_expires_at,
              delivery.last_error, delivery.delivered_at,
              delivery.created_at, delivery.updated_at,
              evt.id AS event_id, evt.event_type, evt.event_key, evt.aggregate_type,
              evt.aggregate_id, evt.actor_id, evt.team_id, evt.source_version,
              evt.schema_version, evt.payload AS event_payload, evt.occurred_at, evt.created_at AS event_created_at
         FROM luie_event_deliveries delivery
         JOIN luie_domain_events evt ON evt.id = delivery.event_id
        WHERE delivery.id = $1::uuid AND evt.organization_id = $2::uuid
        LIMIT 1`, [deliveryId, organizationId]);
    const delivery = result.rows[0];
    if (!delivery) throw new NotFoundException('LUIE delivery not found.');
    const audit = await this.db.query(
      `SELECT id, actor_id, action, reason, metadata, created_at
         FROM luie_operator_audit
        WHERE organization_id = $1::uuid AND delivery_id = $2::uuid
        ORDER BY created_at DESC LIMIT 25`, [organizationId, deliveryId]);
    return { delivery, operatorActions: audit.rows };
  }

  async listOperatorAudit(organizationId: string, requestedLimit: string | number = 50) {
    const numeric = Number(requestedLimit);
    const limit = Number.isFinite(numeric) ? Math.min(100, Math.max(1, Math.floor(numeric))) : 50;
    const result = await this.db.query(
      `SELECT id, actor_id, action, delivery_id, reason, metadata, created_at
         FROM luie_operator_audit
        WHERE organization_id = $1::uuid
        ORDER BY created_at DESC, id DESC
        LIMIT $2`, [organizationId, limit]);
    return result.rows;
  }

  async retryDeadLetter(organizationId: string, deliveryId: string, actorId: string, reasonValue: unknown) {
    if (!UUID_PATTERN.test(deliveryId)) throw new BadRequestException('Invalid LUIE delivery ID.');
    const reason = typeof reasonValue === 'string' ? reasonValue.trim() : '';
    if (reason.length < 8 || reason.length > 1000) throw new BadRequestException('A retry reason between 8 and 1000 characters is required.');

    return this.db.transaction(async (client) => {
      const locked = await client.query<{
        id: string; consumer_name: string; status: string; attempt_count: number;
        last_error: string | null; event_type: string; event_key: string;
      }>(
        `SELECT delivery.id, delivery.consumer_name, delivery.status, delivery.attempt_count,
                delivery.last_error, evt.event_type, evt.event_key
           FROM luie_event_deliveries delivery
           JOIN luie_domain_events evt ON evt.id = delivery.event_id
          WHERE delivery.id = $1::uuid AND evt.organization_id = $2::uuid
          FOR UPDATE OF delivery`, [deliveryId, organizationId]);
      const row = locked.rows[0];
      if (!row) throw new NotFoundException('LUIE delivery not found.');
      if (row.status !== 'dead_letter') throw new ConflictException('Only dead-letter deliveries can be manually retried.');

      const updated = await client.query(
        `UPDATE luie_event_deliveries
            SET status = 'retry', attempt_count = 0, next_attempt_at = NOW(),
                lease_expires_at = NULL, worker_id = NULL, updated_at = NOW()
          WHERE id = $1::uuid AND status = 'dead_letter'
          RETURNING id`, [deliveryId]);
      if ((updated.rowCount ?? 0) !== 1) throw new ConflictException('Delivery changed before the manual retry could be committed.');

      await client.query(
        `INSERT INTO luie_operator_audit (
           organization_id, actor_id, action, delivery_id, reason, metadata
         ) VALUES ($1::uuid, $2::uuid, 'delivery.retry', $3::uuid, $4, $5::jsonb)`,
        [organizationId, actorId, deliveryId, reason, JSON.stringify({
          consumerName: row.consumer_name, eventType: row.event_type,
          eventKey: row.event_key, previousAttemptCount: row.attempt_count,
          previousErrorPresent: Boolean(row.last_error),
        })]);

      return { retried: true, deliveryId, consumerName: row.consumer_name, eventType: row.event_type, attemptsReset: true };
    });
  }
}