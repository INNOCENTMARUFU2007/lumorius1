import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MeetingsService } from './meetings.service';
import type { MeetingActor } from './meetings.service';
import { TasksService } from '../tasks/tasks.service';
import type { TaskAccessContext } from '../tasks/tasks.service';
import { KnowledgeDecisionsService } from '../knowledge/knowledge-decisions.service';

export interface MeetingContext {
  id: string;
  title: string;
  team_id: string | null;
  created_at: string | Date;
}

export interface ActionRow extends Record<string, unknown> {
  id: string;
  organization_id: string;
  meeting_id: string;
  action_text: string;
  assignee_id: string | null;
  due_at: string | Date | null;
  project_id: string | null;
  priority: string;
  evidence_excerpt: string;
  source_start_ms: string | number | null;
  status: string;
  created_task_id: string | null;
}

export interface DecisionCandidateRow extends Record<string, unknown> {
  id: string;
  organization_id: string;
  meeting_id: string;
  description: string;
  decision_maker_candidate: string | null;
  confidence: string | number;
  evidence_excerpt: string;
  status: string;
  knowledge_decision_id: string | null;
}

const VALID_TASK_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const VALID_DECISION_TYPES = new Set([
  'strategic', 'operational', 'product', 'technical', 'financial',
  'customer', 'people', 'compliance', 'other',
]);
const VALID_DECISION_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class MeetingReviewService {
  constructor(
    private readonly db: DatabaseService,
    private readonly meetings: MeetingsService,
    private readonly tasks: TasksService,
    private readonly decisions: KnowledgeDecisionsService,
  ) {}

  private assertCanReview(actor: MeetingActor): void {
    if (String(actor.role ?? '').toLowerCase() === 'viewer') {
      throw new ForbiddenException('Viewers cannot edit meeting summaries or review proposed actions and decisions.');
    }
  }

  private async authorizeMeeting(meetingId: string, actor: MeetingActor): Promise<MeetingContext> {
    await this.meetings.findById(meetingId, actor);
    const result = await this.db.query<MeetingContext>(
      `SELECT id, title, team_id, created_at
         FROM meetings
        WHERE id = $1::uuid AND organization_id = $2::uuid
        LIMIT 1`,
      [meetingId, actor.organizationId],
    );
    const meeting = result.rows[0];
    if (!meeting) throw new NotFoundException('Meeting not found or not accessible.');
    return meeting;
  }

  private assertUuid(value: string | null | undefined, label: string): void {
    if (value && !UUID_PATTERN.test(value)) throw new BadRequestException(`${label} must be a valid UUID.`);
  }

  private parseDate(value: unknown, label: string): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' && !(value instanceof Date)) {
      throw new BadRequestException(`${label} must be a valid date.`);
    }
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException(`${label} must be a valid date.`);
    return date.toISOString();
  }


  async getReview(meetingId: string, actor: MeetingActor) {
    const meeting = await this.authorizeMeeting(meetingId, actor);
    const [analysis, actions, decisions, revisions] = await Promise.all([
      this.db.query(
        `SELECT * FROM meeting_analyses
          WHERE organization_id = $1::uuid AND meeting_id = $2::uuid
          LIMIT 1`,
        [actor.organizationId, meetingId],
      ),
      this.db.query(
        `SELECT id, action_text, candidate_assignee_name, assignee_id, due_at, project_id,
                priority, confidence, evidence_excerpt, source_start_ms, source_end_ms,
                status, created_task_id, reviewed_by_id, reviewed_at, rejection_reason,
                created_at, updated_at
           FROM meeting_action_items
          WHERE organization_id = $1::uuid AND meeting_id = $2::uuid
          ORDER BY created_at ASC`,
        [actor.organizationId, meetingId],
      ),
      this.db.query(
        `SELECT id, description, decision_maker_candidate, confidence, evidence_excerpt,
                source_start_ms, source_end_ms, status, knowledge_decision_id,
                reviewed_by_id, reviewed_at, rejection_reason, created_at, updated_at
           FROM meeting_decision_candidates
          WHERE organization_id = $1::uuid AND meeting_id = $2::uuid
          ORDER BY created_at ASC`,
        [actor.organizationId, meetingId],
      ),
      this.db.query(
        `SELECT revision, summary, source, edited_by_id, created_at
           FROM meeting_summary_revisions
          WHERE organization_id = $1::uuid AND meeting_id = $2::uuid
          ORDER BY revision DESC
          LIMIT 50`,
        [actor.organizationId, meetingId],
      ),
    ]);

    return {
      meeting,
      analysis: analysis.rows[0] ?? null,
      actions: actions.rows,
      decisions: decisions.rows,
      summaryRevisions: revisions.rows,
    };
  }

  async updateSummary(meetingId: string, summaryInput: unknown, actor: MeetingActor) {
    this.assertCanReview(actor);
    const meeting = await this.authorizeMeeting(meetingId, actor);
    if (typeof summaryInput !== 'string') throw new BadRequestException('Summary must be a string.');
    const summary = summaryInput.trim();
    if (!summary || summary.length > 50000) {
      throw new BadRequestException('Summary must contain between 1 and 50,000 characters.');
    }

    return this.db.transaction(async client => {
      const selected = await client.query(
        `SELECT summary, summary_revision
           FROM meeting_analyses
          WHERE organization_id = $1::uuid AND meeting_id = $2::uuid
          FOR UPDATE`,
        [actor.organizationId, meetingId],
      );
      const current = selected.rows[0] as { summary?: string | null; summary_revision?: number | string } | undefined;
      if (!current) throw new NotFoundException('Meeting analysis is not available yet.');
      const currentSummary = String(current.summary ?? '').trim();
      const currentRevision = Math.max(1, Number(current.summary_revision ?? 1));
      if (currentSummary === summary) {
        return { summary, revision: currentRevision, unchanged: true };
      }

      if (currentSummary) {
        await client.query(
          `INSERT INTO meeting_summary_revisions (
             organization_id, meeting_id, revision, summary, edited_by_id, source
           ) VALUES ($1::uuid, $2::uuid, $3, $4, NULL, 'ai')
           ON CONFLICT (organization_id, meeting_id, revision) DO NOTHING`,
          [actor.organizationId, meetingId, currentRevision, currentSummary],
        );
      }

      const nextRevision = currentRevision + 1;
      await client.query(
        `UPDATE meeting_analyses
            SET summary = $1,
                summary_revision = $2,
                summary_updated_by = $3::uuid,
                summary_updated_at = NOW()
          WHERE organization_id = $4::uuid AND meeting_id = $5::uuid`,
        [summary, nextRevision, actor.userId, actor.organizationId, meetingId],
      );
      await client.query(
        `UPDATE meetings SET summary = $1, updated_at = NOW()
          WHERE organization_id = $2::uuid AND id = $3::uuid`,
        [summary, actor.organizationId, meetingId],
      );
      await client.query(
        `INSERT INTO meeting_summary_revisions (
           organization_id, meeting_id, revision, summary, edited_by_id, source
         ) VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, 'human')
         ON CONFLICT (organization_id, meeting_id, revision)
         DO UPDATE SET summary = EXCLUDED.summary,
                       edited_by_id = EXCLUDED.edited_by_id,
                       source = 'human'`,
        [actor.organizationId, meetingId, nextRevision, summary, actor.userId],
      );
      await client.query(
        `INSERT INTO meeting_intelligence_review_events (
           organization_id, meeting_id, actor_id, event_type, entity_type, entity_id, details
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'summary_edited', 'meeting_analysis', $4::uuid, $5::jsonb)`,
        [actor.organizationId, meetingId, actor.userId, meetingId, JSON.stringify({ revision: nextRevision })],
      );
      return { summary, revision: nextRevision, unchanged: false, meetingTitle: meeting.title };
    });
  }

  async approveAction(
    meetingId: string,
    actionId: string,
    input: { assigneeId?: string | null; dueAt?: string | null; projectId?: string | null; priority?: string },
    actor: MeetingActor,
  ) {
    this.assertCanReview(actor);
    await this.authorizeMeeting(meetingId, actor);
    const assigneeId = input.assigneeId ?? null;
    const projectId = input.projectId ?? null;
    this.assertUuid(assigneeId, 'Assignee ID');
    this.assertUuid(projectId, 'Project ID');
    const dueAt = this.parseDate(input.dueAt, 'Due date');

    return this.db.transaction(async client => {
      const selected = await client.query<ActionRow>(
        `SELECT * FROM meeting_action_items
          WHERE id = $1::uuid AND organization_id = $2::uuid AND meeting_id = $3::uuid
          FOR UPDATE`,
        [actionId, actor.organizationId, meetingId],
      );
      const action = selected.rows[0];
      if (!action) throw new NotFoundException('Meeting action candidate not found.');
      if (action.status === 'approved' || action.status === 'task_created') return action;
      if (action.status !== 'proposed') {
        throw new ConflictException(`Action candidate cannot be approved from ${action.status}.`);
      }
      const priority = String(input.priority ?? action.priority ?? 'medium').toLowerCase();
      if (!VALID_TASK_PRIORITIES.has(priority)) throw new BadRequestException('Invalid task priority.');
      const updated = await client.query<ActionRow>(
        `UPDATE meeting_action_items
            SET status = 'approved', assignee_id = $1::uuid, due_at = $2::timestamptz,
                project_id = $3::uuid, priority = $4::task_priority,
                reviewed_by_id = $5::uuid, reviewed_at = NOW(), rejection_reason = NULL,
                updated_at = NOW()
          WHERE id = $6::uuid AND organization_id = $7::uuid AND meeting_id = $8::uuid
          RETURNING *`,
        [assigneeId, dueAt, projectId, priority, actor.userId, actionId, actor.organizationId, meetingId],
      );
      await client.query(
        `INSERT INTO meeting_intelligence_review_events (
           organization_id, meeting_id, actor_id, event_type, entity_type, entity_id, details
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'action_approved', 'meeting_action_item', $4::uuid, $5::jsonb)`,
        [actor.organizationId, meetingId, actor.userId, actionId, JSON.stringify({ assigneeSelected: Boolean(assigneeId), dueDateSelected: Boolean(dueAt), projectSelected: Boolean(projectId), priority })],
      );
      return updated.rows[0];
    });
  }

  async rejectAction(meetingId: string, actionId: string, reasonInput: unknown, actor: MeetingActor) {
    this.assertCanReview(actor);
    await this.authorizeMeeting(meetingId, actor);
    if (typeof reasonInput !== 'string' || reasonInput.trim().length < 8 || reasonInput.trim().length > 2000) {
      throw new BadRequestException('A rejection reason between 8 and 2,000 characters is required.');
    }
    const reason = reasonInput.trim();
    return this.db.transaction(async client => {
      const selected = await client.query<ActionRow>(
        `SELECT * FROM meeting_action_items
          WHERE id = $1::uuid AND organization_id = $2::uuid AND meeting_id = $3::uuid
          FOR UPDATE`,
        [actionId, actor.organizationId, meetingId],
      );
      const action = selected.rows[0];
      if (!action) throw new NotFoundException('Meeting action candidate not found.');
      if (action.status === 'rejected') return action;
      if (action.status !== 'proposed') throw new ConflictException('Only proposed action candidates can be rejected.');
      const updated = await client.query<ActionRow>(
        `UPDATE meeting_action_items
            SET status = 'rejected', rejection_reason = $1,
                reviewed_by_id = $2::uuid, reviewed_at = NOW(), updated_at = NOW()
          WHERE id = $3::uuid AND organization_id = $4::uuid AND meeting_id = $5::uuid
          RETURNING *`,
        [reason, actor.userId, actionId, actor.organizationId, meetingId],
      );
      await client.query(
        `INSERT INTO meeting_intelligence_review_events (
           organization_id, meeting_id, actor_id, event_type, entity_type, entity_id, details
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'action_rejected', 'meeting_action_item', $4::uuid, $5::jsonb)`,
        [actor.organizationId, meetingId, actor.userId, actionId, JSON.stringify({ reasonLength: reason.length })],
      );
      return updated.rows[0];
    });
  }

  private formatTimestamp(value: string | number | null): string {
    if (value === null || value === undefined) return 'timestamp unavailable';
    const seconds = Math.max(0, Math.floor(Number(value) / 1000));
    if (!Number.isFinite(seconds)) return 'timestamp unavailable';
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  async createTaskFromAction(meetingId: string, actionId: string, actor: MeetingActor) {
    this.assertCanReview(actor);
    const meeting = await this.authorizeMeeting(meetingId, actor);
    const selected = await this.db.query<ActionRow>(
      `SELECT * FROM meeting_action_items
        WHERE id = $1::uuid AND organization_id = $2::uuid AND meeting_id = $3::uuid
        LIMIT 1`,
      [actionId, actor.organizationId, meetingId],
    );
    const action = selected.rows[0];
    if (!action) throw new NotFoundException('Meeting action candidate not found.');
    if (action.status === 'task_created' && action.created_task_id) {
      return this.tasks.findById(action.created_task_id, actor.organizationId, actor as TaskAccessContext);
    }
    if (action.status !== 'approved' && action.status !== 'task_created') {
      throw new ConflictException('A meeting action must be explicitly approved before task creation.');
    }

    const timestamp = this.formatTimestamp(action.source_start_ms);
    const description = [
      `Source meeting ID: ${meetingId}`,
      `Meeting action item ID: ${action.id}`,
      `Action details: ${action.action_text}`,
      `Transcript timestamp: ${timestamp}`,
      'Created from an explicitly approved meeting action.',
    ].join('\n');
    const dueDate = action.due_at
      ? (action.due_at instanceof Date ? action.due_at.toISOString() : new Date(action.due_at).toISOString())
      : null;
    const task = await this.tasks.create(
      actor.organizationId,
      actor.userId,
      {
        title: action.action_text.slice(0, 500),
        description,
        priority: action.priority,
        ...(action.assignee_id ? { assigneeId: action.assignee_id } : {}),
        ...(action.project_id ? { projectId: action.project_id } : {}),
        ...(meeting.team_id ? { teamId: meeting.team_id } : {}),
        dueDate,
        tags: ['meeting-action'],
      },
      actor as TaskAccessContext,
      { meetingActionItemId: action.id },
    );

    await this.db.transaction(async client => {
      const updated = await client.query(
        `UPDATE meeting_action_items
            SET status = 'task_created', created_task_id = $1::uuid, updated_at = NOW()
          WHERE id = $2::uuid AND organization_id = $3::uuid AND meeting_id = $4::uuid
            AND status IN ('approved', 'task_created')
            AND (created_task_id IS NULL OR created_task_id = $1::uuid)
          RETURNING id`,
        [task.id, actionId, actor.organizationId, meetingId],
      );
      if (updated.rows[0]) {
        await client.query(
          `INSERT INTO meeting_intelligence_review_events (
             organization_id, meeting_id, actor_id, event_type, entity_type, entity_id, details
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'action_task_created', 'meeting_action_item', $4::uuid, $5::jsonb)`,
          [actor.organizationId, meetingId, actor.userId, actionId, JSON.stringify({ taskCreated: true, taskId: task.id })],
        );
      } else {
        const existing = await client.query(
          `SELECT created_task_id FROM meeting_action_items
            WHERE id = $1::uuid AND organization_id = $2::uuid AND meeting_id = $3::uuid`,
          [actionId, actor.organizationId, meetingId],
        );
        if (existing.rows[0]?.created_task_id !== task.id) {
          throw new ConflictException('The meeting action changed while its task was being created.');
        }
      }
    });
    return task;
  }

  async acceptDecisionCandidate(
    meetingId: string,
    candidateId: string,
    input: { ownerId?: string | null; dueDate?: string | null; decisionType?: string; priority?: string; expectedOutcome?: string },
    actor: MeetingActor,
  ) {
    this.assertCanReview(actor);
    const meeting = await this.authorizeMeeting(meetingId, actor);
    this.assertUuid(input.ownerId, 'Decision owner ID');
    const dueDate = this.parseDate(input.dueDate, 'Decision due date');
    const decisionType = String(input.decisionType ?? 'operational').toLowerCase();
    const priority = String(input.priority ?? 'medium').toLowerCase();
    if (!VALID_DECISION_TYPES.has(decisionType)) throw new BadRequestException('Invalid decision type.');
    if (!VALID_DECISION_PRIORITIES.has(priority)) throw new BadRequestException('Invalid decision priority.');

    const candidate = await this.db.transaction(async client => {
      const selected = await client.query<DecisionCandidateRow>(
        `SELECT * FROM meeting_decision_candidates
          WHERE id = $1::uuid AND organization_id = $2::uuid AND meeting_id = $3::uuid
          FOR UPDATE`,
        [candidateId, actor.organizationId, meetingId],
      );
      const row = selected.rows[0];
      if (!row) throw new NotFoundException('Meeting decision candidate not found.');
      if (row.status === 'linked' && row.knowledge_decision_id) return row;
      if (!['proposed', 'approved', 'linked'].includes(row.status)) {
        throw new ConflictException(`Decision candidate cannot be accepted from ${row.status}.`);
      }
      if (row.status === 'proposed') {
        await client.query(
          `UPDATE meeting_decision_candidates
              SET status = 'approved', reviewed_by_id = $1::uuid, reviewed_at = NOW(), updated_at = NOW()
            WHERE id = $2::uuid AND organization_id = $3::uuid AND meeting_id = $4::uuid`,
          [actor.userId, candidateId, actor.organizationId, meetingId],
        );
        await client.query(
          `INSERT INTO meeting_intelligence_review_events (
             organization_id, meeting_id, actor_id, event_type, entity_type, entity_id, details
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'decision_approved', 'meeting_decision_candidate', $4::uuid, $5::jsonb)`,
          [actor.organizationId, meetingId, actor.userId, candidateId, JSON.stringify({ stage: 'candidate_accepted' })],
        );
        return { ...row, status: 'approved' } as DecisionCandidateRow;
      }
      return row;
    });

    if (candidate.status === 'linked' && candidate.knowledge_decision_id) {
      return this.decisions.getDecision(candidate.knowledge_decision_id, actor.organizationId, actor.userId, actor.role);
    }

    const governanceDecision = await this.decisions.createDecision(
      actor.organizationId,
      actor.userId,
      actor.role,
      {
        title: candidate.description.slice(0, 240),
        description: candidate.description,
        rationale: 'Accepted from meeting evidence; source evidence remains in the linked meeting record.',
        decisionType,
        priority,
        ownerId: input.ownerId ?? null,
        teamId: meeting.team_id,
        dueDate,
        expectedOutcome: input.expectedOutcome,
      },
      candidate.id,
    );
    const decisionId = String(governanceDecision.id);
    await this.decisions.addLink(
      decisionId,
      actor.organizationId,
      actor.userId,
      actor.role,
      'meeting',
      meetingId,
    );

    let currentDecision = governanceDecision;
    if (String(governanceDecision.status) === 'draft') {
      try {
        currentDecision = await this.decisions.transitionDecision(
          decisionId,
          actor.organizationId,
          actor.userId,
          actor.role,
          'proposed',
          'Proposed from reviewed meeting evidence',
        );
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
        const latest = await this.decisions.getDecision(decisionId, actor.organizationId, actor.userId, actor.role);
        if (!['proposed', 'approved', 'implemented', 'reviewed'].includes(String(latest.status))) throw error;
        currentDecision = latest;
      }
    } else if (!['proposed', 'approved', 'implemented', 'reviewed'].includes(String(governanceDecision.status))) {
      throw new ConflictException('The linked governance decision is not in a state that can proceed.');
    }

    await this.db.transaction(async client => {
      await client.query(
        `UPDATE meeting_decision_candidates
            SET status = 'linked', knowledge_decision_id = $1::uuid,
                reviewed_by_id = $2::uuid, reviewed_at = COALESCE(reviewed_at, NOW()), updated_at = NOW()
          WHERE id = $3::uuid AND organization_id = $4::uuid AND meeting_id = $5::uuid`,
        [decisionId, actor.userId, candidateId, actor.organizationId, meetingId],
      );
      await client.query(
        `INSERT INTO meeting_intelligence_review_events (
           organization_id, meeting_id, actor_id, event_type, entity_type, entity_id, details
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'decision_approved', 'meeting_decision_candidate', $4::uuid, $5::jsonb)`,
        [actor.organizationId, meetingId, actor.userId, candidateId, JSON.stringify({ stage: 'governance_record_created', decisionId, governanceStatus: String(currentDecision.status) })],
      );
    });

    return this.decisions.getDecision(decisionId, actor.organizationId, actor.userId, actor.role);
  }

  async rejectDecisionCandidate(meetingId: string, candidateId: string, reasonInput: unknown, actor: MeetingActor) {
    this.assertCanReview(actor);
    await this.authorizeMeeting(meetingId, actor);
    if (typeof reasonInput !== 'string' || reasonInput.trim().length < 8 || reasonInput.trim().length > 2000) {
      throw new BadRequestException('A rejection reason between 8 and 2,000 characters is required.');
    }
    const reason = reasonInput.trim();
    return this.db.transaction(async client => {
      const selected = await client.query<DecisionCandidateRow>(
        `SELECT * FROM meeting_decision_candidates
          WHERE id = $1::uuid AND organization_id = $2::uuid AND meeting_id = $3::uuid
          FOR UPDATE`,
        [candidateId, actor.organizationId, meetingId],
      );
      const candidate = selected.rows[0];
      if (!candidate) throw new NotFoundException('Meeting decision candidate not found.');
      if (candidate.status === 'rejected') return candidate;
      if (candidate.status !== 'proposed') throw new ConflictException('Only proposed decision candidates can be rejected.');
      const updated = await client.query<DecisionCandidateRow>(
        `UPDATE meeting_decision_candidates
            SET status = 'rejected', rejection_reason = $1,
                reviewed_by_id = $2::uuid, reviewed_at = NOW(), updated_at = NOW()
          WHERE id = $3::uuid AND organization_id = $4::uuid AND meeting_id = $5::uuid
          RETURNING *`,
        [reason, actor.userId, candidateId, actor.organizationId, meetingId],
      );
      await client.query(
        `INSERT INTO meeting_intelligence_review_events (
           organization_id, meeting_id, actor_id, event_type, entity_type, entity_id, details
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'decision_rejected', 'meeting_decision_candidate', $4::uuid, $5::jsonb)`,
        [actor.organizationId, meetingId, actor.userId, candidateId, JSON.stringify({ reasonLength: reason.length })],
      );
      return updated.rows[0];
    });
  }
}
