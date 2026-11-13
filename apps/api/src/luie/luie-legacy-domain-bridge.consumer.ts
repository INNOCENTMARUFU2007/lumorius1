import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
import { LuieConsumerRegistry } from './luie-consumer.registry';
import {
  LuieDomainEvent,
  LuieEventConsumer,
  LuiePermanentDeliveryError,
} from './luie-event.types';

const DECISION_EVENTS = new Set([
  'decision.created', 'decision.proposed', 'decision.approved',
  'decision.rejected', 'decision.implemented', 'decision.reviewed',
  'decision.withdrawn',
]);
const LEGACY_EVENTS = new Set([
  'meeting.completed', 'meeting.deleted',
  'task.created', 'task.updated', 'task.assigned', 'task.status_changed',
  'task.completed', 'task.deleted', 'task.overdue',
  'project.created', 'project.updated', 'financial.import_committed',
  'financial.candidate_proposed', 'financial.candidate_approved',
  'financial.candidate_rejected', 'financial.candidate_committed',
  'integration.sync_completed',
]);

@Injectable()
export class LuieLegacyDomainBridgeConsumer implements LuieEventConsumer, OnModuleInit {
  readonly name = 'luie.legacy-domain-bridge';

  constructor(
    private readonly registry: LuieConsumerRegistry,
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  supports(eventType: string): boolean {
    return LEGACY_EVENTS.has(eventType) || DECISION_EVENTS.has(eventType);
  }

  async handle(event: LuieDomainEvent): Promise<void> {
    if (!this.supports(event.eventType)) {
      throw new LuiePermanentDeliveryError(`Unsupported legacy bridge event: ${event.eventType}`);
    }

    const payload: Record<string, unknown> = {
      ...event.payload,
      organizationId: event.organizationId,
      actorId: event.actorId,
      teamId: event.teamId,
      eventId: event.id,
      eventKey: event.eventKey,
    };

    if (event.eventType === 'meeting.completed') {
      const meetingId = typeof event.payload.meetingId === 'string' ? event.payload.meetingId : '';
      if (!meetingId) throw new LuiePermanentDeliveryError('meeting.completed is missing meetingId.');
      const analysis = await this.db.query<{ summary: string | null; action_items: unknown }>(
        `SELECT summary, action_items
           FROM meeting_analyses
          WHERE organization_id = $1::uuid AND meeting_id = $2::uuid
          ORDER BY summary_updated_at DESC
          LIMIT 1`,
        [event.organizationId, meetingId],
      );
      const row = analysis.rows[0];
      if (!row || typeof row.summary !== 'string' || !row.summary.trim()) {
        throw new LuiePermanentDeliveryError(`Meeting ${meetingId} has no persisted summary for legacy notification delivery.`);
      }
      let actionItems: unknown = row.action_items;
      if (typeof actionItems === 'string') {
        try { actionItems = JSON.parse(actionItems); } catch { actionItems = []; }
      }
      payload.summary = row.summary;
      payload.actionItemCount = Array.isArray(actionItems) ? actionItems.length : 0;
      payload.userId = typeof event.payload.userId === 'string' ? event.payload.userId : event.actorId;
    }

    await this.eventEmitter.emitAsync(event.eventType, payload);
  }
}