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
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  source_version: number;
  schema_version: number;
}

@Injectable()
export class LuieEventPublisher {
  /**
   * Append an event using the PoolClient from the source mutation's transaction.
   * Never call this with a standalone connection after the source row commits.
   */
  async append(
    client: PoolClient,
    input: LuieDomainEventInput,
    consumerNames: string[],
  ): Promise<LuieAppendResult> {
    this.validate(input, consumerNames);

    const consumers = [...new Set(consumerNames.map((name) => name.trim()))].sort();
    const payload = input.payload ?? {};
    const payloadJson = JSON.stringify(payload);
    const organizationId = input.organizationId.trim();
    const eventKey = input.eventKey.trim();
    const eventType = input.eventType.trim();
    const aggregateType = input.aggregateType.trim();
    const aggregateId = input.aggregateId.trim();
    const sourceVersion = input.sourceVersion ?? 1;
    const schemaVersion = input.schemaVersion ?? 1;
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

    let eventId = inserted.rows[0]?.id;
    const duplicate = !eventId;

    if (!eventId) {
      const existing = await client.query<ExistingEventRow>(
        `SELECT id, event_type, aggregate_type, aggregate_id, source_version, schema_version
           FROM luie_domain_events
          WHERE organization_id = $1::uuid AND event_key = $2
          FOR SHARE`,
        [organizationId, eventKey],
      );
      const row = existing.rows[0];
      if (!row) {
        throw new ConflictException('The LUIE event key conflicted but the existing event could not be resolved.');
      }
      const sameIdentity =
        row.event_type === eventType &&
        row.aggregate_type === aggregateType &&
        row.aggregate_id === aggregateId &&
        Number(row.source_version) === sourceVersion &&
        Number(row.schema_version) === schemaVersion;
      if (!sameIdentity) {
        throw new ConflictException('The LUIE event key is already assigned to a different event identity.');
      }
      eventId = row.id;
    }

    const deliveryResult = await client.query(
      `INSERT INTO luie_event_deliveries (event_id, consumer_name)
       SELECT $1::uuid, consumer_name
         FROM unnest($2::text[]) AS consumer_name
       ON CONFLICT (event_id, consumer_name) DO NOTHING`,
      [eventId, consumers],
    );

    return {
      eventId,
      duplicate,
      deliveriesInserted: deliveryResult.rowCount ?? 0,
    };
  }

  private validate(input: LuieDomainEventInput, consumerNames: string[]): void {
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
    let serialised: string;
    try {
      serialised = JSON.stringify(payload);
    } catch {
      throw new BadRequestException('LUIE event payload must be JSON serialisable.');
    }
    if (Buffer.byteLength(serialised, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new BadRequestException('LUIE event payload cannot exceed 64 KB. Store source references, not source content.');
    }

    if (input.occurredAt !== undefined && !Number.isFinite(new Date(input.occurredAt).getTime())) {
      throw new BadRequestException('Invalid LUIE event occurrence timestamp.');
    }
  }
}
