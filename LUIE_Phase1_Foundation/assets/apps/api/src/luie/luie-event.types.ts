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
  handle(event: LuieDomainEvent): Promise<void>;
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
