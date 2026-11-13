import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WorkflowsService } from './workflows.service';

type DataRecord = Record<string, unknown>;

@Injectable()
export class WorkflowsEventsListener {
  constructor(private readonly workflows: WorkflowsService) {}

  private async dispatch(eventType: string, value: unknown): Promise<void> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const payload = value as DataRecord;
    const organizationId = String(payload.organizationId ?? '');
    if (!organizationId) return;
    const reference = payload.eventKey ?? payload.eventId ?? payload.decisionId ?? payload.documentId ?? payload.meetingId ?? payload.taskId ?? payload.id;
    const eventKey = String(reference ?? `${eventType}:${JSON.stringify(payload)}`);
    await this.workflows.dispatchEvent(organizationId, eventType, payload, eventKey, typeof payload.actorId === 'string' ? payload.actorId : null);
  }

  @OnEvent('decision.created', { async: true })
  onDecisionCreated(event: unknown) { return this.dispatch('decision.created', event); }

  @OnEvent('decision.proposed', { async: true })
  onDecisionProposed(event: unknown) { return this.dispatch('decision.proposed', event); }

  @OnEvent('decision.approved', { async: true })
  onDecisionApproved(event: unknown) { return this.dispatch('decision.approved', event); }

  @OnEvent('decision.rejected', { async: true })
  onDecisionRejected(event: unknown) { return this.dispatch('decision.rejected', event); }

  @OnEvent('decision.implemented', { async: true })
  onDecisionImplemented(event: unknown) { return this.dispatch('decision.implemented', event); }

  @OnEvent('decision.reviewed', { async: true })
  onDecisionReviewed(event: unknown) { return this.dispatch('decision.reviewed', event); }

  @OnEvent('decision.withdrawn', { async: true })
  onDecisionWithdrawn(event: unknown) { return this.dispatch('decision.withdrawn', event); }


  @OnEvent('meeting.completed', { async: true })
  onMeetingCompleted(event: unknown) { return this.dispatch('meeting.completed', event); }

  @OnEvent('task.assigned', { async: true })
  onTaskAssigned(event: unknown) { return this.dispatch('task.assigned', event); }

  @OnEvent('task.created', { async: true })
  onTaskCreated(event: unknown) { return this.dispatch('task.created', event); }

  @OnEvent('task.updated', { async: true })
  onTaskUpdated(event: unknown) { return this.dispatch('task.updated', event); }

  @OnEvent('task.status_changed', { async: true })
  onTaskStatusChanged(event: unknown) { return this.dispatch('task.status_changed', event); }

  @OnEvent('task.completed', { async: true })
  onTaskCompleted(event: unknown) { return this.dispatch('task.completed', event); }

  @OnEvent('task.deleted', { async: true })
  onTaskDeleted(event: unknown) { return this.dispatch('task.deleted', event); }

  @OnEvent('project.created', { async: true })
  onProjectCreated(event: unknown) { return this.dispatch('project.created', event); }

  @OnEvent('project.updated', { async: true })
  onProjectUpdated(event: unknown) { return this.dispatch('project.updated', event); }

  @OnEvent('meeting.deleted', { async: true })
  onMeetingDeleted(event: unknown) { return this.dispatch('meeting.deleted', event); }

  @OnEvent('financial.import_committed', { async: true })
  onFinancialImportCommitted(event: unknown) { return this.dispatch('financial.import_committed', event); }

  @OnEvent('financial.candidate_proposed', { async: true })
  onFinancialCandidateProposed(event: unknown) { return this.dispatch('financial.candidate_proposed', event); }

  @OnEvent('financial.candidate_approved', { async: true })
  onFinancialCandidateApproved(event: unknown) { return this.dispatch('financial.candidate_approved', event); }

  @OnEvent('financial.candidate_rejected', { async: true })
  onFinancialCandidateRejected(event: unknown) { return this.dispatch('financial.candidate_rejected', event); }

  @OnEvent('financial.candidate_committed', { async: true })
  onFinancialCandidateCommitted(event: unknown) { return this.dispatch('financial.candidate_committed', event); }

  @OnEvent('integration.sync_completed', { async: true })
  onIntegrationSyncCompleted(event: unknown) { return this.dispatch('integration.sync_completed', event); }

  @OnEvent('task.overdue', { async: true })
  onTaskOverdue(event: unknown) { return this.dispatch('task.overdue', event); }
}