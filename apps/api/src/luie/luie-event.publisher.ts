import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Buffer } from 'buffer';
import type { PoolClient } from 'pg';
import type { LuieAppendResult, LuieDomainEventInput } from './luie-event.types';

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9]*(\.[a-z0-9_-]+)+$/;
const AGGREGATE_TYPE_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;
const CONSUMER_NAME_PATTERN = /^[a-z][a-z0-9_.-]{1,99}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAYLOAD_BYTES = 64 * 1024;

interface ExistingEventRow {
  id: string;
  same_envelope: boolean;
}

interface ExistingRecipientsRow {
  consumer_names: string[];
}

@Injectable()
export class LuieEventPublisher {
  /**
   * LUIE-PUBLISHER-ENVELOPE-V2
   * Append an event using the PoolClient from the source mutation's transaction.
   * The event envelope and initial recipient set are immutable for an event key.
   * A deliberate replay/backfill must use a separately authorised operation.
   */
  async append(
    client: PoolClient,
    input: LuieDomainEventInput,
    consumerNames: string[],
  ): Promise<LuieAppendResult> {
    const payloadJson = this.validate(input, consumerNames);
    const consumers = [...new Set(consumerNames.map((name) => name.trim()))].sort();
    const organizationId = input.organizationId.trim();
    const eventKey = input.eventKey.trim();
    const eventType = input.eventType.trim();
    const aggregateType = input.aggregateType.trim();
    const aggregateId = input.aggregateId.trim();
    const sourceVersion = input.sourceVersion ?? 1;
    const schemaVersion = input.schemaVersion ?? 1;
    const occurredAtProvided = input.occurredAt !== undefined;
    const occurredAt = input.occurredAt ?? new Date();

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO luie_domain_events (
         organization_id, event_key, event_type, aggregate_type, aggregate_id,
         actor_id, team_id, source_version, schema_version, payload, occurred_at
       ) VALUES (
         $1::uuid, $2, $3, $4, $5::uuid, $6::uuid, $7::uuid,
         $8, $9, $10::jsonb, $11::timestamptz
       )
       ON CONFLICT (organization_id, event_key) DO NOTHING
       RETURNING id`,
      [
        organizationId,
        eventKey,
        eventType,
        aggregateType,
        aggregateId,
        input.actorId ?? null,
        input.teamId ?? null,
        sourceVersion,
        schemaVersion,
        payloadJson,
        occurredAt,
      ],
    );

    const insertedEventId = inserted.rows[0]?.id;
    if (!insertedEventId) {
      const existing = await client.query<ExistingEventRow>(
        `SELECT
           id,
           (
             event_type = $3
             AND aggregate_type = $4
             AND aggregate_id = $5::uuid
             AND actor_id IS NOT DISTINCT FROM $6::uuid
             AND team_id IS NOT DISTINCT FROM $7::uuid
             AND source_version = $8
             AND schema_version = $9
             AND payload = $10::jsonb
             AND ($11::timestamptz IS NULL OR occurred_at = $11::timestamptz)
           ) AS same_envelope
         FROM luie_domain_events
         WHERE organization_id = $1::uuid AND event_key = $2
         FOR SHARE`,
        [
          organizationId,
          eventKey,
          eventType,
          aggregateType,
          aggregateId,
          input.actorId ?? null,
          input.teamId ?? null,
          sourceVersion,
          schemaVersion,
          payloadJson,
          occurredAtProvided ? occurredAt : null,
        ],
      );

      const row = existing.rows[0];
      if (!row) {
        throw new ConflictException(
          'The LUIE event key conflicted but the existing event could not be resolved.',
        );
      }
      if (row.same_envelope !== true) {
        throw new ConflictException(
          'The LUIE event key is already assigned to a different immutable event envelope.',
        );
      }

      // Existing deliveries are the authoritative original recipient set.
      // A retry must never add newly registered consumers to a historical event.
      const existingRecipients = await client.query<ExistingRecipientsRow>(
        `SELECT COALESCE(
                  array_agg(consumer_name ORDER BY consumer_name),
                  ARRAY[]::text[]
                ) AS consumer_names
           FROM luie_event_deliveries
          WHERE event_id = $1::uuid`,
        [row.id],
      );
      const originalConsumers = existingRecipients.rows[0]?.consumer_names ?? [];
      const sameRecipients =
        originalConsumers.length === consumers.length &&
        originalConsumers.every((name, index) => name === consumers[index]);

      if (!sameRecipients) {
        throw new ConflictException(
          'The LUIE event key is already assigned to a different consumer recipient set. Use an explicit backfill operation to add recipients.',
        );
      }

      return {
        eventId: row.id,
        duplicate: true,
        deliveriesInserted: 0,
      };
    }

    const deliveryResult = await client.query(
      `INSERT INTO luie_event_deliveries (event_id, consumer_name)
       SELECT $1::uuid, consumer_name
         FROM unnest($2::text[]) AS consumer_name
       ON CONFLICT (event_id, consumer_name) DO NOTHING`,
      [insertedEventId, consumers],
    );

    return {
      eventId: insertedEventId,
      duplicate: false,
      deliveriesInserted: deliveryResult.rowCount ?? 0,
    };
  }

  private validate(input: LuieDomainEventInput, consumerNames: string[]): string {
    if (!input || typeof input.organizationId !== 'string' || !UUID_PATTERN.test(input.organizationId)) {
      throw new BadRequestException('A valid LUIE organisation UUID is required.');
    }
    if (typeof input.eventKey !== 'string' || input.eventKey.trim().length < 1 || input.eventKey.trim().length > 250) {
      throw new BadRequestException('LUIE event keys must contain between 1 and 250 characters.');
    }
    if (typeof input.eventType !== 'string' || !EVENT_TYPE_PATTERN.test(input.eventType.trim())) {
      throw new BadRequestException('Invalid LUIE event type. Use lower-case dotted event names.');
    }
    if (typeof input.aggregateType !== 'string' || !AGGREGATE_TYPE_PATTERN.test(input.aggregateType.trim())) {
      throw new BadRequestException('Invalid LUIE aggregate type.');
    }
    if (typeof input.aggregateId !== 'string' || !UUID_PATTERN.test(input.aggregateId)) {
      throw new BadRequestException('A valid LUIE aggregate UUID is required.');
    }
    if (input.actorId !== undefined && input.actorId !== null &&
        (typeof input.actorId !== 'string' || !UUID_PATTERN.test(input.actorId))) {
      throw new BadRequestException('Invalid LUIE actor UUID.');
    }
    if (input.teamId !== undefined && input.teamId !== null &&
        (typeof input.teamId !== 'string' || !UUID_PATTERN.test(input.teamId))) {
      throw new BadRequestException('Invalid LUIE team UUID.');
    }
    if (!Number.isInteger(input.sourceVersion ?? 1) || (input.sourceVersion ?? 1) < 1) {
      throw new BadRequestException('LUIE sourceVersion must be a positive integer.');
    }
    if (!Number.isInteger(input.schemaVersion ?? 1) || (input.schemaVersion ?? 1) < 1) {
      throw new BadRequestException('LUIE schemaVersion must be a positive integer.');
    }
    if (!Array.isArray(consumerNames) || consumerNames.length === 0) {
      throw new BadRequestException('At least one LUIE event consumer is required.');
    }
    for (const name of consumerNames) {
      if (typeof name !== 'string' || !CONSUMER_NAME_PATTERN.test(name.trim())) {
        throw new BadRequestException(`Invalid LUIE consumer name: ${String(name)}.`);
      }
    }

    const payload = input.payload ?? {};
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException('LUIE event payload must be a JSON object.');
    }
    const prototype = Object.getPrototypeOf(payload);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new BadRequestException('LUIE event payload must be a plain JSON object.');
    }

    let serialised: string | undefined;
    try {
      serialised = JSON.stringify(payload);
    } catch {
      throw new BadRequestException('LUIE event payload must be JSON serialisable.');
    }
    if (typeof serialised !== 'string') {
      throw new BadRequestException('LUIE event payload must serialise to a JSON object.');
    }
    try {
      const parsed: unknown = JSON.parse(serialised);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Payload is not a JSON object.');
      }
    } catch {
      throw new BadRequestException('LUIE event payload must serialise to a valid JSON object.');
    }
    if (Buffer.byteLength(serialised, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new BadRequestException('LUIE event payload cannot exceed 64 KB. Store source references, not source content.');
    }

    if (input.occurredAt !== undefined) {
      if (!(input.occurredAt instanceof Date) && typeof input.occurredAt !== 'string') {
        throw new BadRequestException('Invalid LUIE event occurrence timestamp.');
      }
      if (!Number.isFinite(new Date(input.occurredAt).getTime())) {
        throw new BadRequestException('Invalid LUIE event occurrence timestamp.');
      }
    }

    return serialised;
  }
}
