export interface LuieDomainEventInput {
  organizationId: string;
  eventKey: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorId?: string | null;
  teamId?: string | null;
  sourceVersion?: number;
  schemaVersion?: number;
  occurredAt?: Date | string;
  payload?: Record<string, unknown>;
}

export interface LuieDomainEvent {
  id: string;
  organizationId: string;
  eventKey: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorId: string | null;
  teamId: string | null;
  sourceVersion: number;
  schemaVersion: number;
  payload: Record<string, unknown>;
  occurredAt: Date | string;
  createdAt: Date | string;
}

export interface LuieEventConsumer {
  readonly name: string;
  supports(eventType: string): boolean;
  /**
   * Must be idempotent. LUIE provides at-least-once delivery, so the same
   * event can be handled again after a process crash or lost acknowledgement.
   * Throw LuiePermanentDeliveryError for a deterministic, non-retryable failure.
   */
  handle(event: LuieDomainEvent): Promise<void>;
}

export class LuiePermanentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LuiePermanentDeliveryError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface LuieClaimedDelivery extends LuieDomainEvent {
  deliveryId: string;
  consumerName: string;
  attemptCount: number;
}

export interface LuieAppendResult {
  eventId: string;
  duplicate: boolean;
  deliveriesInserted: number;
}