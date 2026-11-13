import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { PoolClient } from 'pg';
import { LuieEventPublisher } from '../luie/luie-event.publisher';

export type KnowledgeDecisionStatus =
  | 'draft'
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'implemented'
  | 'reviewed'
  | 'withdrawn';

const DECISION_TYPES = new Set([
  'strategic', 'operational', 'product', 'technical', 'financial',
  'customer', 'people', 'compliance', 'other',
]);
const PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const STATUSES = new Set([
  'draft', 'proposed', 'approved', 'rejected', 'implemented', 'reviewed', 'withdrawn',
]);
const OUTCOME_ASSESSMENTS = new Set([
  'achieved', 'partially_achieved', 'not_achieved', 'inconclusive',
]);
const LINK_TYPES = new Set([
  'claim', 'conflict', 'goal', 'objective', 'project', 'task', 'document', 'meeting',
]);

interface DecisionRow extends Record<string, unknown> {
  id: string;
  organization_id: string;
  title: string;
  status: KnowledgeDecisionStatus;
  created_by_id: string;
  owner_id: string | null;
  team_id: string | null;
}

@Injectable()
export class KnowledgeDecisionsService {
  constructor(private readonly db: DatabaseService, private readonly luiePublisher: LuieEventPublisher) {}


  private async appendDecisionLifecycleEvent(
    client: PoolClient,
    eventType: string,
    organizationId: string,
    actorId: string,
    row: Record<string, unknown>,
  ): Promise<void> {
    const decisionId = String(row.id ?? '');
    if (!decisionId) throw new Error('Decision lifecycle event requires a decision ID.');
    const teamId = typeof row.team_id === 'string' ? row.team_id : null;
    const timestamp = row.updated_at ?? row.created_at;
    await this.luiePublisher.append(client, {
      organizationId,
      eventKey: `${eventType}:${decisionId}`,
      eventType,
      aggregateType: 'knowledge_decision',
      aggregateId: decisionId,
      actorId,
      teamId,
      ...(timestamp ? { occurredAt: timestamp as Date | string } : {}),
      payload: {
        decisionId,
        organizationId,
        actorId,
        teamId,
        decision: {
          id: decisionId,
          title: String(row.title ?? ''),
          decisionType: String(row.decision_type ?? 'operational'),
          priority: String(row.priority ?? 'medium'),
          status: String(row.status ?? 'draft'),
          ownerId: row.owner_id ?? null,
          createdById: row.created_by_id ?? actorId,
          teamId,
          dueDate: row.due_date ?? null,
          approvalDueAt: row.approval_due_at ?? null,
        },
      },
    }, ['luie.legacy-domain-bridge']);
  }
  private isPrivileged(role: string): boolean {
    return ['owner', 'admin', 'super_admin'].includes(String(role ?? '').toLowerCase());
  }

  private canManageOrganisation(role: string): boolean {
    return ['owner', 'admin', 'manager', 'super_admin'].includes(String(role ?? '').toLowerCase());
  }

  private assertCanCreate(role: string): void {
    if (String(role ?? '').toLowerCase() === 'viewer') {
      throw new ForbiddenException('Your role cannot create or modify decisions.');
    }
  }

  private canManage(row: DecisionRow, userId: string, role: string): boolean {
    return this.canManageOrganisation(role) || row.created_by_id === userId || row.owner_id === userId;
  }

  private clean(value: unknown, max: number): string | null {
    if (typeof value !== 'string') return null;
    const result = value.trim().slice(0, max);
    return result || null;
  }

  private parseDate(value: unknown, field: string): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
      throw new BadRequestException(`${field} must be a valid date or null.`);
    }
    return new Date(value).toISOString();
  }

  private async ensureUser(organizationId: string, userId: string | null | undefined): Promise<void> {
    if (!userId) return;
    const result = await this.db.query(
      `SELECT id FROM users WHERE id = $1::uuid AND organization_id = $2::uuid AND is_active = TRUE LIMIT 1`,
      [userId, organizationId],
    );
    if (!result.rows[0]) throw new BadRequestException('Selected owner is not an active user in this organisation.');
  }

  private async ensureTeam(
    organizationId: string,
    teamId: string | null | undefined,
    userId: string,
    role: string,
  ): Promise<void> {
    if (!teamId) return;
    const result = await this.db.query(
      `SELECT team.id
         FROM teams team
        WHERE team.id = $1::uuid
          AND team.organization_id = $2::uuid
          AND ($3::boolean = TRUE OR EXISTS (
            SELECT 1 FROM team_members member
             WHERE member.team_id = team.id AND member.user_id = $4::uuid
          ))
        LIMIT 1`,
      [teamId, organizationId, this.isPrivileged(role), userId],
    );
    if (!result.rows[0]) throw new BadRequestException('Selected team does not exist in this organisation or is not accessible.');
  }

  private async findAccessibleDecision(
    id: string,
    organizationId: string,
    userId: string,
    role: string,
    forUpdate = false,
    client?: PoolClient,
  ): Promise<DecisionRow> {
    const sql =
      `SELECT decision.*
         FROM knowledge_decisions decision
        WHERE decision.id = $1::uuid
          AND decision.organization_id = $2::uuid
          AND (
            decision.team_id IS NULL
            OR $3::boolean = TRUE
            OR EXISTS (
              SELECT 1 FROM team_members member
               WHERE member.team_id = decision.team_id
                 AND member.user_id = $4::uuid
            )
          )
        ${forUpdate ? 'FOR UPDATE' : ''}`;
    const values = [id, organizationId, this.isPrivileged(role), userId];
    const result = client
      ? await client.query<DecisionRow>(sql, values as never)
      : await this.db.query<DecisionRow>(sql, values);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('Decision not found or not accessible.');
    return row;
  }

  async createDecision(
    organizationId: string,
    userId: string,
    role: string,
    input: Record<string, unknown>,
    sourceMeetingDecisionCandidateId?: string,
  ) {
    this.assertCanCreate(role);
    const title = this.clean(input.title, 240);
    if (!title) throw new BadRequestException('Decision title is required.');
    const decisionType = String(input.decisionType ?? 'operational').trim().toLowerCase();
    const priority = String(input.priority ?? 'medium').trim().toLowerCase();
    if (!DECISION_TYPES.has(decisionType)) throw new BadRequestException('Invalid decision type.');
    if (!PRIORITIES.has(priority)) throw new BadRequestException('Invalid decision priority.');

    const ownerId = this.clean(input.ownerId, 80);
    const teamId = this.clean(input.teamId, 80);
    if (sourceMeetingDecisionCandidateId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceMeetingDecisionCandidateId)) {
      throw new BadRequestException('Meeting decision candidate ID must be a valid UUID.');
    }
    await this.ensureUser(organizationId, ownerId);
    await this.ensureTeam(organizationId, teamId, userId, role);

    const dueDate = this.parseDate(input.dueDate, 'dueDate');
    const reviewDueAt = this.parseDate(input.reviewDueAt, 'reviewDueAt');
    const result = await this.db.transaction(async client => {
      const inserted = await client.query(
        `INSERT INTO knowledge_decisions (
           organization_id, title, description, rationale, decision_type,
           priority, owner_id, team_id, created_by_id,
           expected_outcome, due_date, review_due_at, source_meeting_decision_candidate_id
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8::uuid, $9::uuid,
           $10, $11::timestamptz, $12::timestamptz, $13::uuid
         )
         ON CONFLICT (organization_id, source_meeting_decision_candidate_id)
         WHERE source_meeting_decision_candidate_id IS NOT NULL
         DO NOTHING
         RETURNING *`,
        [
          organizationId, title, this.clean(input.description, 12000),
          this.clean(input.rationale, 12000), decisionType, priority,
          ownerId, teamId, userId, this.clean(input.expectedOutcome, 8000),
          dueDate ?? null, reviewDueAt ?? null, sourceMeetingDecisionCandidateId ?? null,
        ],
      );
      let row = inserted.rows[0] as Record<string, unknown> | undefined;
      if (!row && sourceMeetingDecisionCandidateId) {
        const existing = await client.query(
          `SELECT * FROM knowledge_decisions
            WHERE organization_id = $1::uuid
              AND source_meeting_decision_candidate_id = $2::uuid
            LIMIT 1`,
          [organizationId, sourceMeetingDecisionCandidateId],
        );
        row = existing.rows[0] as Record<string, unknown> | undefined;
        if (row) return row;
      }
      if (!row) throw new Error('Decision insert returned no row.');
      await client.query(
        `INSERT INTO knowledge_decision_reviews (
           organization_id, decision_id, reviewer_id,
           previous_status, new_status, review_note
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'draft', 'draft', 'Decision created')`,
        [organizationId, row.id, userId],
      );
      await this.appendDecisionLifecycleEvent(client, 'decision.created', organizationId, userId, row);
      return row;
    });
    return result;
  }

  async listDecisions(
    organizationId: string,
    userId: string,
    role: string,
    options: { status?: string; search?: string; decisionType?: string; priority?: string; limit?: number; offset?: number } = {},
  ) {
    if (options.status && !STATUSES.has(options.status)) {
      throw new BadRequestException('Invalid decision status filter.');
    }
    const decisionType = this.clean(options.decisionType, 40)?.toLowerCase() ?? null;
    const priority = this.clean(options.priority, 20)?.toLowerCase() ?? null;
    if (decisionType && !DECISION_TYPES.has(decisionType)) {
      throw new BadRequestException('Invalid decision type filter.');
    }
    if (priority && !PRIORITIES.has(priority)) {
      throw new BadRequestException('Invalid decision priority filter.');
    }
    const requestedLimit = Number(options.limit ?? 25);
    const requestedOffset = Number(options.offset ?? 0);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.trunc(requestedLimit))) : 25;
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.trunc(requestedOffset)) : 0;
    const search = this.clean(options.search, 180);
    const result = await this.db.query(
      `SELECT
         decision.*,
         owner.name AS owner_name,
         creator.name AS created_by_name,
         COUNT(*) OVER()::int AS total_count
       FROM knowledge_decisions decision
       LEFT JOIN users owner ON owner.id = decision.owner_id
       LEFT JOIN users creator ON creator.id = decision.created_by_id
       WHERE decision.organization_id = $1::uuid
         AND (decision.team_id IS NULL OR $2::boolean = TRUE OR EXISTS (
           SELECT 1 FROM team_members member
            WHERE member.team_id = decision.team_id AND member.user_id = $3::uuid
         ))
         AND ($4::text IS NULL OR decision.status = $4)
         AND ($5::text IS NULL OR to_tsvector('english', coalesce(decision.title,'') || ' ' || coalesce(decision.description,'') || ' ' || coalesce(decision.rationale,'')) @@ plainto_tsquery('english', $5))
         AND ($6::text IS NULL OR decision.decision_type = $6)
         AND ($7::text IS NULL OR decision.priority = $7)
       ORDER BY
         CASE decision.status WHEN 'proposed' THEN 0 WHEN 'approved' THEN 1 WHEN 'draft' THEN 2 WHEN 'implemented' THEN 3 ELSE 4 END,
         decision.updated_at DESC
       LIMIT $8 OFFSET $9`,
      [organizationId, this.isPrivileged(role), userId, options.status ?? null, search, decisionType, priority, limit, offset],
    );
    const rows = result.rows as Array<Record<string, unknown>>;
    return {
      items: rows.map(row => ({ ...row, total_count: undefined })),
      total: rows.length ? Number(rows[0].total_count ?? 0) : 0,
      limit,
      offset,
    };
  }

  private async resolveLinkTarget(
    organizationId: string,
    userId: string,
    role: string,
    linkType: string,
    linkedId: string,
  ): Promise<string | null> {
    if (!LINK_TYPES.has(linkType)) throw new BadRequestException('Unsupported decision link type.');
    const privileged = this.isPrivileged(role);
    const visibility = `(document.team_id IS NULL OR $3::boolean = TRUE OR EXISTS (
      SELECT 1 FROM team_members member WHERE member.team_id = document.team_id AND member.user_id = $4::uuid
    ))`;
    let sql = '';
    switch (linkType) {
      case 'claim':
        sql = `SELECT claim.subject_text || ' Ã‚Â· ' || claim.predicate || ' Ã‚Â· ' || claim.object_text AS label
                 FROM knowledge_claims claim
                WHERE claim.organization_id = $1::uuid AND claim.id = $2::uuid AND claim.status = 'active'
                  AND EXISTS (
                    SELECT 1 FROM knowledge_claim_evidence evidence
                    JOIN documents document ON document.id = evidence.document_id
                    WHERE evidence.organization_id = claim.organization_id AND evidence.claim_id = claim.id
                      AND document.status::text = 'indexed' AND ${visibility}
                  ) LIMIT 1`;
        break;
      case 'conflict':
        sql = `SELECT claim_a.subject_text || ' Ã‚Â· ' || claim_a.predicate || ' Ã‚Â· ' || claim_a.object_text || ' / ' || claim_b.object_text AS label
                 FROM knowledge_conflicts conflict
                 JOIN knowledge_claims claim_a ON claim_a.organization_id = conflict.organization_id AND claim_a.id = conflict.claim_a_id
                 JOIN knowledge_claims claim_b ON claim_b.organization_id = conflict.organization_id AND claim_b.id = conflict.claim_b_id
                WHERE conflict.organization_id = $1::uuid AND conflict.id = $2::uuid
                  AND EXISTS (SELECT 1 FROM knowledge_claim_evidence evidence JOIN documents document ON document.id = evidence.document_id WHERE evidence.organization_id = conflict.organization_id AND evidence.claim_id = claim_a.id AND document.status::text = 'indexed' AND ${visibility})
                  AND EXISTS (SELECT 1 FROM knowledge_claim_evidence evidence JOIN documents document ON document.id = evidence.document_id WHERE evidence.organization_id = conflict.organization_id AND evidence.claim_id = claim_b.id AND document.status::text = 'indexed' AND ${visibility})
                LIMIT 1`;
        break;
      case 'goal':
      case 'objective':
        // Legacy goal links and current Founder OS objective links
        // both resolve against the canonical objectives table.
        sql = `SELECT title AS label FROM objectives WHERE organization_id = $1::uuid AND id = $2::uuid LIMIT 1`;
        break;
      case 'project':
        sql = `SELECT project.name AS label FROM projects project WHERE project.organization_id = $1::uuid AND project.id = $2::uuid
                 AND (project.team_id IS NULL OR $3::boolean = TRUE OR EXISTS (SELECT 1 FROM team_members member WHERE member.team_id = project.team_id AND member.user_id = $4::uuid)) LIMIT 1`;
        break;
      case 'task':
        sql = `SELECT task.title AS label
                 FROM tasks task
                 LEFT JOIN projects project
                   ON project.id = task.project_id
                  AND project.organization_id = task.organization_id
                WHERE task.organization_id = $1::uuid
                  AND task.id = $2::uuid
                  AND (
                    COALESCE(task.team_id, project.team_id) IS NULL
                    OR $3::boolean = TRUE
                    OR EXISTS (
                      SELECT 1 FROM team_members member
                       WHERE member.team_id = COALESCE(task.team_id, project.team_id)
                         AND member.user_id = $4::uuid
                    )
                  )
                LIMIT 1`;
        break;
      case 'document':
        sql = `SELECT document.name AS label FROM documents document WHERE document.organization_id = $1::uuid AND document.id = $2::uuid
                 AND document.status::text = 'indexed' AND ${visibility} LIMIT 1`;
        break;
      case 'meeting':
        sql = `SELECT meeting.title AS label
                 FROM meetings meeting
                WHERE meeting.organization_id = $1::uuid AND meeting.id = $2::uuid
                  AND (meeting.team_id IS NULL OR $3::boolean = TRUE OR EXISTS (
                    SELECT 1 FROM team_members member
                     WHERE member.team_id = meeting.team_id AND member.user_id = $4::uuid
                  ))
                LIMIT 1`;
        break;
    }
    const values = (linkType === 'goal' || linkType === 'objective')
      ? [organizationId, linkedId]
      : [organizationId, linkedId, privileged, userId];
    const result = await this.db.query<{ label: string }>(sql, values);
    return result.rows[0]?.label ?? null;
  }

  async getDecision(id: string, organizationId: string, userId: string, role: string) {
    const decision = await this.findAccessibleDecision(id, organizationId, userId, role);
    const linksResult = await this.db.query(
      `SELECT id, link_type AS "linkType", linked_id AS "linkedId", link_label AS "linkLabel", created_at AS "createdAt"
         FROM knowledge_decision_links
        WHERE organization_id = $1::uuid AND decision_id = $2::uuid
        ORDER BY created_at DESC`,
      [organizationId, id],
    );
    const links = [];
    for (const link of linksResult.rows as Array<Record<string, unknown>>) {
      const liveLabel = await this.resolveLinkTarget(
        organizationId, userId, role, String(link.linkType), String(link.linkedId),
      );
      if (liveLabel !== null) links.push({ ...link, linkLabel: liveLabel });
    }
    // Execution monitoring uses existing organisation-scoped Tasks records.
    const executionResult = await this.db.query(
      `SELECT task.id,
              task.title,
              task.status,
              task.priority,
              task.assignee_id,
              assignee.name AS assignee_name,
              task.due_date,
              task.completed_at,
              task.updated_at,
              task.created_at
         FROM knowledge_decision_links decision_link
         INNER JOIN tasks task
           ON task.id = decision_link.linked_id
          AND task.organization_id = decision_link.organization_id
         LEFT JOIN users assignee
           ON assignee.id = task.assignee_id
          AND assignee.organization_id = task.organization_id
         LEFT JOIN projects project
           ON project.id = task.project_id
          AND project.organization_id = task.organization_id
        WHERE decision_link.organization_id = $1::uuid
          AND decision_link.decision_id = $2::uuid
          AND decision_link.link_type = 'task'
          AND task.organization_id = $1::uuid
          AND (
            COALESCE(task.team_id, project.team_id) IS NULL
            OR $3::boolean = TRUE
            OR EXISTS (
              SELECT 1
                FROM team_members member
               WHERE member.team_id = COALESCE(task.team_id, project.team_id)
                 AND member.user_id = $4::uuid
            )
          )
        ORDER BY task.due_date ASC NULLS LAST, task.created_at DESC`,
      [organizationId, id, this.isPrivileged(role), userId],
    );

    const now = Date.now();

    const executionTasks = (
      executionResult.rows as Array<Record<string, unknown>>
    ).map(task => {
      const status = String(task.status ?? 'todo');
      const dueAt = task.due_date
        ? new Date(String(task.due_date)).getTime()
        : Number.NaN;
      const lastActivityAt = task.updated_at ?? task.created_at;
      const lastActivityMs = lastActivityAt
        ? new Date(String(lastActivityAt)).getTime()
        : Number.NaN;
      const isOverdue =
        status !== 'done' &&
        Number.isFinite(dueAt) &&
        dueAt < now;
      const isStalled =
        status === 'in_progress' &&
        Number.isFinite(lastActivityMs) &&
        lastActivityMs <= now - 7 * 24 * 60 * 60 * 1000;
      const isUnassigned = status !== 'done' && !task.assignee_id;
      const isCompleted = status === 'done';
      const health = isCompleted
        ? 'completed'
        : isOverdue
          ? 'overdue'
          : isStalled
            ? 'stalled'
            : isUnassigned
              ? 'unassigned'
              : 'on_track';

      return {
        ...task,
        status,
        is_overdue: isOverdue,
        is_stalled: isStalled,
        is_unassigned: isUnassigned,
        is_completed: isCompleted,
        is_on_track: health === 'on_track',
        health,
      };
    });

    const total = executionTasks.length;
    const completed = executionTasks.filter(task => task.status === 'done').length;
    const inProgress = executionTasks.filter(task => task.status === 'in_progress').length;
    const todo = executionTasks.filter(task => task.status === 'todo').length;
    const overdue = executionTasks.filter(task => task.is_overdue).length;
    const stalled = executionTasks.filter(task => task.is_stalled).length;
    const unassigned = executionTasks.filter(task => task.is_unassigned).length;
    const onTrack = executionTasks.filter(task => task.is_on_track).length;

    const alerts: Array<{
      type: 'overdue' | 'stalled' | 'unassigned';
      severity: 'critical' | 'warning';
      count: number;
      title: string;
      message: string;
    }> = [];

    if (overdue > 0) {
      alerts.push({
        type: 'overdue',
        severity: 'critical',
        count: overdue,
        title: 'Overdue execution tasks',
        message: `${overdue} linked task${overdue === 1 ? ' is' : 's are'} past its due date.`,
      });
    }
    if (stalled > 0) {
      alerts.push({
        type: 'stalled',
        severity: 'warning',
        count: stalled,
        title: 'Stalled execution tasks',
        message: `${stalled} in-progress task${stalled === 1 ? ' has' : 's have'} had no update for at least seven days.`,
      });
    }
    if (unassigned > 0) {
      alerts.push({
        type: 'unassigned',
        severity: 'warning',
        count: unassigned,
        title: 'Unassigned execution tasks',
        message: `${unassigned} active task${unassigned === 1 ? ' has' : 's have'} no assigned owner.`,
      });
    }

    const health = total === 0
      ? 'not_started'
      : completed === total
        ? 'completed'
        : alerts.length > 0
          ? 'at_risk'
          : 'on_track';

    const execution = {
      total,
      completed,
      inProgress,
      todo,
      overdue,
      stalled,
      unassigned,
      onTrack,
      health,
      alerts,
      completionPercent: total > 0
        ? Math.round((completed / total) * 100)
        : 0,
      tasks: executionTasks,
    };

    const historyPage = await this.getHistoryPage(
      id,
      organizationId,
      userId,
      role,
      { limit: 25, offset: 0 },
    );
    return { ...decision, links, history: historyPage.items, execution };
  }

  async updateDecision(
    id: string,
    organizationId: string,
    userId: string,
    role: string,
    input: Record<string, unknown>,
  ) {
    this.assertCanCreate(role);
    const current = await this.findAccessibleDecision(id, organizationId, userId, role);
    if (!this.canManage(current, userId, role)) throw new ForbiddenException('Only the decision owner, creator or an organisation manager can edit this decision.');
    if (!['draft', 'proposed'].includes(current.status)) throw new ConflictException('Only draft or proposed decisions can be edited.');

    const title = input.title === undefined ? current.title : this.clean(input.title, 240);
    if (!title) throw new BadRequestException('Decision title cannot be empty.');
    const ownerId = input.ownerId === undefined ? current.owner_id : this.clean(input.ownerId, 80);
    const teamId = input.teamId === undefined ? current.team_id : this.clean(input.teamId, 80);
    await this.ensureUser(organizationId, ownerId);
    await this.ensureTeam(organizationId, teamId, userId, role);
    const decisionType = input.decisionType === undefined ? undefined : String(input.decisionType).trim().toLowerCase();
    const priority = input.priority === undefined ? undefined : String(input.priority).trim().toLowerCase();
    if (decisionType !== undefined && !DECISION_TYPES.has(decisionType)) throw new BadRequestException('Invalid decision type.');
    if (priority !== undefined && !PRIORITIES.has(priority)) throw new BadRequestException('Invalid decision priority.');

    const dueDate = this.parseDate(input.dueDate, 'dueDate');
    const reviewDueAt = this.parseDate(input.reviewDueAt, 'reviewDueAt');
    const result = await this.db.query(
      `UPDATE knowledge_decisions SET
         title = $1, description = $2, rationale = $3,
         decision_type = $4, priority = $5, owner_id = $6::uuid, team_id = $7::uuid,
         expected_outcome = $8, due_date = $9::timestamptz, review_due_at = $10::timestamptz,
         updated_at = NOW()
       WHERE id = $11::uuid AND organization_id = $12::uuid
       RETURNING *`,
      [
        title,
        input.description === undefined ? current.description : this.clean(input.description, 12000),
        input.rationale === undefined ? current.rationale : this.clean(input.rationale, 12000),
        decisionType ?? current.decision_type,
        priority ?? current.priority,
        ownerId,
        teamId,
        input.expectedOutcome === undefined ? current.expected_outcome : this.clean(input.expectedOutcome, 8000),
        dueDate === undefined ? current.due_date : dueDate,
        reviewDueAt === undefined ? current.review_due_at : reviewDueAt,
        id, organizationId,
      ],
    );
    if (!result.rows[0]) throw new NotFoundException('Decision not found.');
    return result.rows[0];
  }

  private roleRank(role: unknown): number {
    const ranks: Record<string, number> = {
      viewer: 0,
      member: 1,
      manager: 2,
      admin: 3,
      owner: 4,
      super_admin: 5,
    };
    return ranks[String(role ?? '').toLowerCase()] ?? -1;
  }

  private assertGovernanceAdmin(role: string): void {
    if (!this.isPrivileged(role)) {
      throw new ForbiddenException('Only organisation owners and administrators can manage approval policies.');
    }
  }

  private assertUuid(value: unknown, field: string): string {
    const result = typeof value === 'string' ? value.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
      throw new BadRequestException(`${field} must be a valid UUID.`);
    }
    return result.toLowerCase();
  }

  private async getApprovalPolicyForDecision(
    client: PoolClient,
    organizationId: string,
    decisionType: string,
    priority: string,
  ): Promise<Record<string, unknown> | null> {
    const result = await client.query(
      `SELECT id,
              required_approver_role,
              approval_due_hours,
              allow_delegation,
              escalation_repeat_hours
         FROM knowledge_decision_approval_policies
        WHERE organization_id = $1::uuid
          AND is_active = TRUE
          AND decision_type IN ($2, 'all')
          AND priority IN ($3, 'all')
        ORDER BY (decision_type = $2) DESC,
                 (priority = $3) DESC,
                 updated_at DESC
        LIMIT 1`,
      [organizationId, decisionType, priority],
    );
    return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
  }

  private async assertApprovalAuthority(
    client: PoolClient,
    organizationId: string,
    decision: DecisionRow,
    actorId: string,
    requiredRole: string,
    delegationId?: string,
  ): Promise<{ representedUserId: string | null; delegationId: string | null }> {
    const actorResult = await client.query(
      `SELECT role
         FROM users
        WHERE id = $1::uuid
          AND organization_id = $2::uuid
          AND is_active = TRUE
        LIMIT 1`,
      [actorId, organizationId],
    );
    const actorRole = String(actorResult.rows[0]?.role ?? '');
    if (!actorRole) {
      throw new ForbiddenException('Your account is not an active member of this organisation.');
    }

    if (this.roleRank(actorRole) >= this.roleRank(requiredRole)) {
      return { representedUserId: null, delegationId: null };
    }

    if (!delegationId || decision.approval_delegation_allowed !== true) {
      throw new ForbiddenException(`This decision requires an approver with at least the ${requiredRole} role.`);
    }

    const delegationUuid = this.assertUuid(delegationId, 'delegationId');
    const delegationResult = await client.query(
      `SELECT delegation.id,
              delegation.principal_user_id,
              principal.role AS principal_role
         FROM knowledge_decision_delegations delegation
         INNER JOIN users delegate
           ON delegate.id = delegation.delegate_user_id
          AND delegate.organization_id = delegation.organization_id
          AND delegate.is_active = TRUE
         INNER JOIN users principal
           ON principal.id = delegation.principal_user_id
          AND principal.organization_id = delegation.organization_id
          AND principal.is_active = TRUE
        WHERE delegation.id = $1::uuid
          AND delegation.organization_id = $2::uuid
          AND delegation.delegate_user_id = $3::uuid
          AND delegation.revoked_at IS NULL
          AND delegation.valid_from <= NOW()
          AND delegation.valid_until > NOW()
          AND delegation.decision_type IN ($4, 'all')
          AND delegation.priority IN ($5, 'all')
        LIMIT 1`,
      [delegationUuid, organizationId, actorId, String(decision.decision_type), String(decision.priority)],
    );
    const delegation = delegationResult.rows[0] as Record<string, unknown> | undefined;
    if (!delegation || this.roleRank(delegation.principal_role) < this.roleRank(requiredRole)) {
      throw new ForbiddenException('No valid delegation grants you the required approval authority for this decision.');
    }

    return {
      representedUserId: String(delegation.principal_user_id),
      delegationId: String(delegation.id),
    };
  }

  private async recordGovernanceEvent(
    client: PoolClient,
    event: {
      organizationId: string;
      eventType: string;
      actorId: string;
      decisionId?: string | null;
      policyId?: string | null;
      delegationId?: string | null;
      representedUserId?: string | null;
      details?: Record<string, unknown>;
      note?: string | null;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO knowledge_decision_governance_events (
         organization_id, event_type, actor_id, decision_id, policy_id,
         delegation_id, represented_user_id, details, note
       ) VALUES (
         $1::uuid, $2, $3::uuid, $4::uuid, $5::uuid,
         $6::uuid, $7::uuid, $8::jsonb, $9
       )`,
      [
        event.organizationId,
        event.eventType,
        event.actorId,
        event.decisionId ?? null,
        event.policyId ?? null,
        event.delegationId ?? null,
        event.representedUserId ?? null,
        JSON.stringify(event.details ?? {}),
        event.note ?? null,
      ],
    );
  }
  async transitionDecision(
    id: string,
    organizationId: string,
    userId: string,
    role: string,
    nextStatus: string,
    note?: string,
    actualOutcome?: string,
    outcomeAssessment?: string,
    delegationId?: string,
  ) {
    if (!STATUSES.has(nextStatus) || nextStatus === 'draft') throw new BadRequestException('Invalid target decision status.');
    const cleanNote = this.clean(note, 2000);
    if (nextStatus === 'rejected' && (!cleanNote || cleanNote.length < 8)) throw new BadRequestException('A rejection explanation of at least 8 characters is required.');
    if (nextStatus === 'reviewed' && (!cleanNote || cleanNote.length < 8)) throw new BadRequestException('A review note of at least 8 characters is required.');
    const cleanOutcome = this.clean(actualOutcome, 8000);
    const cleanAssessment = this.clean(outcomeAssessment, 40)?.toLowerCase() ?? null;
    if (cleanAssessment && !OUTCOME_ASSESSMENTS.has(cleanAssessment)) {
      throw new BadRequestException('Invalid outcome assessment.');
    }
    if (nextStatus === 'reviewed') {
      if (!cleanAssessment) {
        throw new BadRequestException('Select an outcome assessment before completing the review.');
      }
      if (!cleanOutcome || cleanOutcome.length < 8) {
        throw new BadRequestException('Record an actual outcome of at least 8 characters before completing the review.');
      }
    }

    return this.db.transaction(async client => {
      const current = await this.findAccessibleDecision(id, organizationId, userId, role, true, client);
      const allowed: Record<KnowledgeDecisionStatus, string[]> = {
        draft: ['proposed', 'withdrawn'],
        proposed: ['approved', 'rejected', 'withdrawn'],
        approved: ['implemented', 'withdrawn'],
        rejected: [],
        implemented: ['reviewed'],
        reviewed: [],
        withdrawn: [],
      };
      if (!allowed[current.status]?.includes(nextStatus)) {
        throw new ConflictException(`Decision cannot transition from ${current.status} to ${nextStatus}.`);
      }

      let representedUserId: string | null = null;
      let appliedDelegationId: string | null = null;
      const requiredRole = this.clean(current.approval_required_role, 40)?.toLowerCase() ?? null;
      if ((nextStatus === 'approved' || nextStatus === 'rejected') && current.status === 'proposed' && requiredRole) {
        const authority = await this.assertApprovalAuthority(
          client, organizationId, current, userId, requiredRole, delegationId,
        );
        representedUserId = authority.representedUserId;
        appliedDelegationId = authority.delegationId;
      } else if (delegationId) {
        throw new BadRequestException('Delegation can only be supplied when approving or rejecting a policy-governed proposal.');
      }

      if (!this.canManage(current, userId, role) && !representedUserId) {
        throw new ForbiddenException('Only the decision owner, creator or an authorised organisation approver can change its lifecycle.');
      }

      const approvalPolicy = current.status === 'draft' && nextStatus === 'proposed'
        ? await this.getApprovalPolicyForDecision(
            client, organizationId, String(current.decision_type), String(current.priority),
          )
        : null;
      const policyId = approvalPolicy ? String(approvalPolicy.id) : null;
      const policyRequiredRole = approvalPolicy ? String(approvalPolicy.required_approver_role) : null;
      const approvalDueHours = approvalPolicy ? Number(approvalPolicy.approval_due_hours) : null;
      const allowDelegation = approvalPolicy ? approvalPolicy.allow_delegation === true : false;
      const escalationRepeatHours = approvalPolicy ? Number(approvalPolicy.escalation_repeat_hours) : null;

      const updated = await client.query(
        `UPDATE knowledge_decisions
            SET status = $1,
                approved_by_id = CASE WHEN $1 = 'approved' THEN $2::uuid ELSE approved_by_id END,
                decision_at = CASE WHEN $1 IN ('approved','rejected') THEN NOW() ELSE decision_at END,
                rejection_reason = CASE WHEN $1 = 'rejected' THEN $3 ELSE rejection_reason END,
                implemented_at = CASE WHEN $1 = 'implemented' THEN NOW() ELSE implemented_at END,
                reviewed_at = CASE WHEN $1 = 'reviewed' THEN NOW() ELSE reviewed_at END,
                actual_outcome = COALESCE($4, actual_outcome),
                outcome_assessment = CASE WHEN $1 = 'reviewed' THEN $5 ELSE outcome_assessment END,
                approval_policy_id = CASE WHEN $1 = 'proposed' AND status = 'draft' THEN $8::uuid ELSE approval_policy_id END,
                approval_required_role = CASE WHEN $1 = 'proposed' AND status = 'draft' THEN $9 ELSE approval_required_role END,
                approval_due_at = CASE
                  WHEN $1 = 'proposed' AND status = 'draft' AND $8::uuid IS NOT NULL
                    THEN NOW() + ($10::integer * INTERVAL '1 hour')
                  WHEN $1 = 'proposed' AND status = 'draft' THEN NULL
                  ELSE approval_due_at
                END,
                approval_delegation_allowed = CASE WHEN $1 = 'proposed' AND status = 'draft' THEN $11::boolean ELSE approval_delegation_allowed END,
                approval_escalation_repeat_hours = CASE WHEN $1 = 'proposed' AND status = 'draft' THEN $12::integer ELSE approval_escalation_repeat_hours END,
                approval_escalated_at = CASE WHEN $1 = 'proposed' AND status = 'draft' THEN NULL ELSE approval_escalated_at END,
                approval_escalation_count = CASE WHEN $1 = 'proposed' AND status = 'draft' THEN 0 ELSE approval_escalation_count END,
                updated_at = NOW()
          WHERE organization_id = $6::uuid AND id = $7::uuid
          RETURNING *`,
        [
          nextStatus, userId, cleanNote, cleanOutcome, cleanAssessment, organizationId, id,
          policyId, policyRequiredRole, approvalDueHours, allowDelegation, escalationRepeatHours,
        ],
      );
      if (!updated.rows[0]) throw new ConflictException('Decision transition did not persist.');
      await client.query(
        `INSERT INTO knowledge_decision_reviews (
           organization_id, decision_id, reviewer_id, previous_status, new_status,
           review_note, outcome_assessment, delegated_for_id, delegation_id
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::uuid, $9::uuid)`,
        [
          organizationId, id, userId, current.status, nextStatus, cleanNote,
          nextStatus === 'reviewed' ? cleanAssessment : null,
          representedUserId, appliedDelegationId,
        ],
      );

      if (approvalPolicy) {
        await this.recordGovernanceEvent(client, {
          organizationId,
          eventType: 'approval_policy_snapshotted',
          actorId: userId,
          decisionId: id,
          policyId,
          details: {
            requiredRole: policyRequiredRole,
            approvalDueHours,
            allowDelegation,
            escalationRepeatHours,
            approvalDueAt: updated.rows[0].approval_due_at,
          },
          note: 'Approval policy snapshot captured when the decision was proposed.',
        });
      }

      if ((nextStatus === 'approved' || nextStatus === 'rejected') && requiredRole) {
        await this.recordGovernanceEvent(client, {
          organizationId,
          eventType: nextStatus === 'approved' ? 'approval_granted' : 'approval_rejected',
          actorId: userId,
          decisionId: id,
          policyId: current.approval_policy_id ? String(current.approval_policy_id) : null,
          delegationId: appliedDelegationId,
          representedUserId,
          details: { requiredRole, decisionStatus: nextStatus },
          note: cleanNote,
        });
      }

      await this.appendDecisionLifecycleEvent(client, `decision.${nextStatus}`, organizationId, userId, updated.rows[0] as Record<string, unknown>);
      return updated.rows[0];
    });
  }
  async addLink(
    id: string,
    organizationId: string,
    userId: string,
    role: string,
    linkType: string,
    linkedId: string,
  ) {
    if (!LINK_TYPES.has(linkType)) throw new BadRequestException('Unsupported decision link type.');
    if (!linkedId) throw new BadRequestException('A linked record ID is required.');

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(id)) {
      throw new BadRequestException('Decision ID must be a valid UUID.');
    }

    if (!uuidPattern.test(linkedId)) {
      throw new BadRequestException('Linked record ID must be a valid UUID.');
    }

    const decision = await this.findAccessibleDecision(id, organizationId, userId, role);
    if (!this.canManage(decision, userId, role)) throw new ForbiddenException('Only the decision owner, creator or an organisation manager can link records.');

    const label = await this.resolveLinkTarget(organizationId, userId, role, linkType, linkedId);
    if (label === null) throw new NotFoundException('Linked record was not found or is not accessible.');
    const result = await this.db.query(
      `INSERT INTO knowledge_decision_links (
         organization_id, decision_id, link_type, linked_id, link_label, created_by_id
       ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6::uuid)
       ON CONFLICT (organization_id, decision_id, link_type, linked_id)
       DO UPDATE SET link_label = EXCLUDED.link_label
       RETURNING id, link_type AS "linkType", linked_id AS "linkedId", link_label AS "linkLabel", created_at AS "createdAt"`,
      [organizationId, id, linkType, linkedId, label, userId],
    );
    return result.rows[0];
  }

  async removeLink(
    id: string,
    linkId: string,
    organizationId: string,
    userId: string,
    role: string,
  ) {
    const decision = await this.findAccessibleDecision(id, organizationId, userId, role);
    if (!this.canManage(decision, userId, role)) throw new ForbiddenException('Only the decision owner, creator or an organisation manager can remove links.');
    const result = await this.db.query(
      `DELETE FROM knowledge_decision_links
        WHERE id = $1::uuid AND organization_id = $2::uuid AND decision_id = $3::uuid
        RETURNING id`,
      [linkId, organizationId, id],
    );
    if (!result.rows[0]) throw new NotFoundException('Decision link not found.');
    return { removed: true, id: linkId };
  }

  async getOutcomeAnalytics(organizationId: string, userId: string, role: string) {
    const visibility = `(
      decision.team_id IS NULL
      OR $2::boolean = TRUE
      OR EXISTS (
        SELECT 1 FROM team_members member
         WHERE member.team_id = decision.team_id
           AND member.user_id = $3::uuid
      )
    )`;

    const summaryResult = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE decision.status = 'implemented')::int AS implemented,
         COUNT(*) FILTER (WHERE decision.status = 'reviewed')::int AS reviewed,
         COUNT(*) FILTER (WHERE decision.outcome_assessment IS NOT NULL)::int AS assessed,
         COUNT(*) FILTER (WHERE decision.outcome_assessment = 'achieved')::int AS achieved,
         COUNT(*) FILTER (WHERE decision.outcome_assessment = 'partially_achieved')::int AS partially_achieved,
         COUNT(*) FILTER (WHERE decision.outcome_assessment = 'not_achieved')::int AS not_achieved,
         COUNT(*) FILTER (WHERE decision.outcome_assessment = 'inconclusive')::int AS inconclusive,
         COUNT(*) FILTER (
           WHERE decision.status = 'implemented'
             AND decision.review_due_at IS NOT NULL
             AND decision.review_due_at < NOW()
         )::int AS overdue_reviews,
         COUNT(*) FILTER (
           WHERE decision.status = 'implemented'
             AND decision.review_due_at >= NOW()
             AND decision.review_due_at <= NOW() + INTERVAL '7 days'
         )::int AS due_soon_reviews,
         COUNT(*) FILTER (
           WHERE decision.status = 'implemented'
             AND decision.review_due_at IS NULL
         )::int AS missing_review_date,
         COUNT(*) FILTER (
           WHERE decision.status IN ('implemented', 'reviewed')
             AND (decision.expected_outcome IS NULL OR btrim(decision.expected_outcome) = '')
         )::int AS missing_expected_outcome
       FROM knowledge_decisions decision
       WHERE decision.organization_id = $1::uuid
         AND ${visibility}`,
      [organizationId, this.isPrivileged(role), userId],
    );

    const queueResult = await this.db.query(
      `SELECT decision.id,
              decision.title,
              decision.priority,
              decision.review_due_at AS "reviewDueAt",
              decision.expected_outcome AS "expectedOutcome",
              owner.name AS "ownerName"
         FROM knowledge_decisions decision
         LEFT JOIN users owner ON owner.id = decision.owner_id
        WHERE decision.organization_id = $1::uuid
          AND ${visibility}
          AND decision.status = 'implemented'
          AND decision.review_due_at IS NOT NULL
          AND decision.review_due_at <= NOW() + INTERVAL '14 days'
        ORDER BY CASE WHEN decision.review_due_at < NOW() THEN 0 ELSE 1 END,
                 decision.review_due_at ASC
        LIMIT 12`,
      [organizationId, this.isPrivileged(role), userId],
    );

    const row = (summaryResult.rows[0] ?? {}) as Record<string, unknown>;
    const number = (key: string) => Number(row[key] ?? 0);
    const assessed = number('assessed');
    const achieved = number('achieved');
    const partiallyAchieved = number('partially_achieved');

    return {
      implemented: number('implemented'),
      reviewed: number('reviewed'),
      assessed,
      pendingReview: number('implemented'),
      achieved,
      partiallyAchieved,
      notAchieved: number('not_achieved'),
      inconclusive: number('inconclusive'),
      overdueReviews: number('overdue_reviews'),
      dueSoonReviews: number('due_soon_reviews'),
      missingReviewDate: number('missing_review_date'),
      missingExpectedOutcome: number('missing_expected_outcome'),
      achievementRate: assessed > 0 ? Math.round((achieved / assessed) * 100) : 0,
      positiveOutcomeRate: assessed > 0
        ? Math.round(((achieved + partiallyAchieved) / assessed) * 100)
        : 0,
      reviewQueue: (queueResult.rows as Array<Record<string, unknown>>).map(item => {
        const dueAt = item.reviewDueAt ? new Date(String(item.reviewDueAt)).getTime() : Number.NaN;
        const daysOverdue = Number.isFinite(dueAt)
          ? Math.max(0, Math.ceil((Date.now() - dueAt) / (24 * 60 * 60 * 1000)))
          : 0;
        return {
          ...item,
          isOverdue: Number.isFinite(dueAt) && dueAt < Date.now(),
          daysOverdue,
        };
      }),
    };
  }
  async getPortfolioAnalytics(organizationId: string, userId: string, role: string) {
    const result = await this.db.query(
      `WITH visible_decisions AS (
         SELECT decision.*
           FROM knowledge_decisions decision
          WHERE decision.organization_id = $1::uuid
            AND (
              decision.team_id IS NULL
              OR $2::boolean = TRUE
              OR EXISTS (
                SELECT 1 FROM team_members member
                 WHERE member.team_id = decision.team_id
                   AND member.user_id = $3::uuid
              )
            )
       ),
       review_events AS (
         SELECT review.decision_id,
                MIN(review.created_at) FILTER (WHERE review.new_status = 'proposed') AS proposed_at,
                MIN(review.created_at) FILTER (WHERE review.new_status = 'approved') AS approved_at,
                MIN(review.created_at) FILTER (WHERE review.new_status = 'implemented') AS implemented_at,
                MIN(review.created_at) FILTER (WHERE review.new_status = 'reviewed') AS reviewed_at
           FROM knowledge_decision_reviews review
           INNER JOIN visible_decisions decision
             ON decision.id = review.decision_id
            AND decision.organization_id = review.organization_id
          WHERE review.organization_id = $1::uuid
          GROUP BY review.decision_id
       ),
       summary AS (
         SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE decision.status = 'draft')::int AS draft,
           COUNT(*) FILTER (WHERE decision.status = 'proposed')::int AS proposed,
           COUNT(*) FILTER (WHERE decision.status = 'approved')::int AS approved,
           COUNT(*) FILTER (WHERE decision.status = 'rejected')::int AS rejected,
           COUNT(*) FILTER (WHERE decision.status = 'implemented')::int AS implemented,
           COUNT(*) FILTER (WHERE decision.status = 'reviewed')::int AS reviewed,
           COUNT(*) FILTER (WHERE decision.status = 'withdrawn')::int AS withdrawn,
           COUNT(*) FILTER (WHERE decision.status IN ('proposed', 'approved', 'implemented'))::int AS active,
           COUNT(*) FILTER (WHERE decision.outcome_assessment IS NOT NULL)::int AS assessed,
           COUNT(*) FILTER (WHERE decision.outcome_assessment = 'achieved')::int AS achieved,
           COUNT(*) FILTER (WHERE decision.outcome_assessment = 'partially_achieved')::int AS partially_achieved,
           COUNT(*) FILTER (WHERE decision.outcome_assessment = 'not_achieved')::int AS not_achieved,
           COUNT(*) FILTER (WHERE decision.outcome_assessment = 'inconclusive')::int AS inconclusive
         FROM visible_decisions decision
       ),
       velocity AS (
         SELECT
           ROUND(AVG(EXTRACT(EPOCH FROM (events.approved_at - events.proposed_at)) / 3600)::numeric, 1) AS proposal_to_approval_hours,
           ROUND(AVG(EXTRACT(EPOCH FROM (events.implemented_at - events.approved_at)) / 3600)::numeric, 1) AS approval_to_implementation_hours,
           ROUND(AVG(EXTRACT(EPOCH FROM (events.reviewed_at - events.implemented_at)) / 3600)::numeric, 1) AS implementation_to_review_hours
         FROM review_events events
       ),
       category_stats AS (
         SELECT
           decision.decision_type,
           COUNT(*)::int AS decisions,
           COUNT(*) FILTER (WHERE decision.outcome_assessment IS NOT NULL)::int AS assessed,
           COUNT(*) FILTER (WHERE decision.outcome_assessment = 'achieved')::int AS achieved,
           COUNT(*) FILTER (WHERE decision.outcome_assessment = 'partially_achieved')::int AS partially_achieved,
           COUNT(*) FILTER (WHERE decision.outcome_assessment = 'not_achieved')::int AS not_achieved,
           COUNT(*) FILTER (WHERE decision.outcome_assessment = 'inconclusive')::int AS inconclusive,
           ROUND(
             100.0 * COUNT(*) FILTER (WHERE decision.outcome_assessment IN ('achieved', 'partially_achieved'))
             / NULLIF(COUNT(*) FILTER (WHERE decision.outcome_assessment IS NOT NULL), 0),
             1
           ) AS positive_outcome_rate
         FROM visible_decisions decision
         GROUP BY decision.decision_type
       ),
       team_stats AS (
         SELECT
           decision.team_id AS team_id,
           COALESCE(team.name, 'Organisation-wide') AS team_name,
           COUNT(*)::int AS decisions,
           COUNT(*) FILTER (WHERE decision.status = 'implemented')::int AS implemented,
           COUNT(*) FILTER (WHERE decision.status = 'reviewed')::int AS reviewed,
           COUNT(*) FILTER (WHERE decision.outcome_assessment IS NOT NULL)::int AS assessed,
           COUNT(*) FILTER (WHERE decision.outcome_assessment = 'achieved')::int AS achieved,
           COUNT(*) FILTER (WHERE decision.outcome_assessment = 'partially_achieved')::int AS partially_achieved,
           ROUND(
             100.0 * COUNT(*) FILTER (WHERE decision.outcome_assessment IN ('achieved', 'partially_achieved'))
             / NULLIF(COUNT(*) FILTER (WHERE decision.outcome_assessment IS NOT NULL), 0),
             1
           ) AS positive_outcome_rate
         FROM visible_decisions decision
         LEFT JOIN teams team
           ON team.id = decision.team_id
          AND team.organization_id = decision.organization_id
         GROUP BY decision.team_id, team.name
       ),
       months AS (
         SELECT generate_series(
           date_trunc('month', NOW()) - INTERVAL '5 months',
           date_trunc('month', NOW()),
           INTERVAL '1 month'
         ) AS month_start
       ),
       monthly_trend AS (
         SELECT
           months.month_start,
           COUNT(DISTINCT decision.id) FILTER (
             WHERE decision.created_at >= months.month_start
               AND decision.created_at < months.month_start + INTERVAL '1 month'
           )::int AS created,
           COUNT(DISTINCT events.decision_id) FILTER (
             WHERE events.proposed_at >= months.month_start
               AND events.proposed_at < months.month_start + INTERVAL '1 month'
           )::int AS proposed,
           COUNT(DISTINCT events.decision_id) FILTER (
             WHERE events.approved_at >= months.month_start
               AND events.approved_at < months.month_start + INTERVAL '1 month'
           )::int AS approved,
           COUNT(DISTINCT events.decision_id) FILTER (
             WHERE events.implemented_at >= months.month_start
               AND events.implemented_at < months.month_start + INTERVAL '1 month'
           )::int AS implemented,
           COUNT(DISTINCT events.decision_id) FILTER (
             WHERE events.reviewed_at >= months.month_start
               AND events.reviewed_at < months.month_start + INTERVAL '1 month'
           )::int AS reviewed
         FROM months
         LEFT JOIN visible_decisions decision ON TRUE
         LEFT JOIN review_events events ON events.decision_id = decision.id
         GROUP BY months.month_start
       ),
       bottlenecks AS (
         SELECT
           COUNT(*) FILTER (
             WHERE decision.due_date < NOW()
               AND decision.status IN ('proposed', 'approved', 'implemented')
           )::int AS overdue_decisions,
           COUNT(*) FILTER (
             WHERE decision.status = 'implemented'
               AND decision.review_due_at IS NOT NULL
               AND decision.review_due_at < NOW()
           )::int AS overdue_reviews,
           COUNT(*) FILTER (
             WHERE decision.status IN ('proposed', 'approved', 'implemented')
               AND decision.owner_id IS NULL
           )::int AS unassigned_active,
           COUNT(*) FILTER (
             WHERE decision.status = 'implemented'
               AND decision.review_due_at IS NULL
           )::int AS missing_review_dates,
           COUNT(*) FILTER (
             WHERE decision.status IN ('implemented', 'reviewed')
               AND (decision.expected_outcome IS NULL OR btrim(decision.expected_outcome) = '')
           )::int AS missing_expected_outcomes,
           COUNT(*) FILTER (WHERE decision.status = 'proposed')::int AS pending_approval,
           COUNT(*) FILTER (WHERE decision.status = 'approved')::int AS awaiting_implementation
         FROM visible_decisions decision
       )
       SELECT
         (SELECT row_to_json(summary) FROM summary) AS summary,
         (SELECT row_to_json(velocity) FROM velocity) AS velocity,
         COALESCE((
           SELECT json_agg(json_build_object(
             'decisionType', category_stats.decision_type,
             'decisions', category_stats.decisions,
             'assessed', category_stats.assessed,
             'achieved', category_stats.achieved,
             'partiallyAchieved', category_stats.partially_achieved,
             'notAchieved', category_stats.not_achieved,
             'inconclusive', category_stats.inconclusive,
             'positiveOutcomeRate', category_stats.positive_outcome_rate
           ) ORDER BY category_stats.decisions DESC, category_stats.decision_type)
           FROM category_stats
         ), '[]'::json) AS categories,
         COALESCE((
           SELECT json_agg(json_build_object(
             'teamId', team_stats.team_id,
             'teamName', team_stats.team_name,
             'decisions', team_stats.decisions,
             'implemented', team_stats.implemented,
             'reviewed', team_stats.reviewed,
             'assessed', team_stats.assessed,
             'achieved', team_stats.achieved,
             'partiallyAchieved', team_stats.partially_achieved,
             'positiveOutcomeRate', team_stats.positive_outcome_rate
           ) ORDER BY team_stats.decisions DESC, team_stats.team_name)
           FROM team_stats
         ), '[]'::json) AS teams,
         COALESCE((
           SELECT json_agg(json_build_object(
             'month', to_char(monthly_trend.month_start, 'YYYY-MM'),
             'label', to_char(monthly_trend.month_start, 'Mon YY'),
             'created', monthly_trend.created,
             'proposed', monthly_trend.proposed,
             'approved', monthly_trend.approved,
             'implemented', monthly_trend.implemented,
             'reviewed', monthly_trend.reviewed
           ) ORDER BY monthly_trend.month_start)
           FROM monthly_trend
         ), '[]'::json) AS monthly_trend,
         (SELECT row_to_json(bottlenecks) FROM bottlenecks) AS bottlenecks`,
      [organizationId, this.isPrivileged(role), userId],
    );

    const row = (result.rows[0] ?? {}) as Record<string, unknown>;
    const readObject = (value: unknown): Record<string, unknown> => {
      if (typeof value === 'string') {
        try {
          const parsed: unknown = JSON.parse(value);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
        } catch {
          return {};
        }
      }
      return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    };
    const readArray = (value: unknown): Array<Record<string, unknown>> => {
      if (typeof value === 'string') {
        try {
          const parsed: unknown = JSON.parse(value);
          return Array.isArray(parsed)
            ? parsed.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>
            : [];
        } catch {
          return [];
        }
      }
      return Array.isArray(value)
        ? value.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>
        : [];
    };
    const summary = readObject(row.summary);
    const velocity = readObject(row.velocity);
    const bottlenecks = readObject(row.bottlenecks);
    const number = (source: Record<string, unknown>, key: string) => Number(source[key] ?? 0);
    const nullableNumber = (source: Record<string, unknown>, key: string) =>
      source[key] === null || source[key] === undefined ? null : Number(source[key]);

    const assessed = number(summary, 'assessed');
    const achieved = number(summary, 'achieved');
    const partiallyAchieved = number(summary, 'partially_achieved');

    return {
      summary: {
        total: number(summary, 'total'),
        draft: number(summary, 'draft'),
        proposed: number(summary, 'proposed'),
        approved: number(summary, 'approved'),
        rejected: number(summary, 'rejected'),
        implemented: number(summary, 'implemented'),
        reviewed: number(summary, 'reviewed'),
        withdrawn: number(summary, 'withdrawn'),
        active: number(summary, 'active'),
        assessed,
        achieved,
        partiallyAchieved,
        notAchieved: number(summary, 'not_achieved'),
        inconclusive: number(summary, 'inconclusive'),
        achievementRate: assessed > 0 ? Math.round((achieved / assessed) * 100) : null,
        positiveOutcomeRate: assessed > 0
          ? Math.round(((achieved + partiallyAchieved) / assessed) * 100)
          : null,
      },
      velocity: {
        proposalToApprovalHours: nullableNumber(velocity, 'proposal_to_approval_hours'),
        approvalToImplementationHours: nullableNumber(velocity, 'approval_to_implementation_hours'),
        implementationToReviewHours: nullableNumber(velocity, 'implementation_to_review_hours'),
      },
      categories: readArray(row.categories),
      teams: readArray(row.teams),
      monthlyTrend: readArray(row.monthly_trend),
      bottlenecks: {
        overdueDecisions: number(bottlenecks, 'overdue_decisions'),
        overdueReviews: number(bottlenecks, 'overdue_reviews'),
        unassignedActive: number(bottlenecks, 'unassigned_active'),
        missingReviewDates: number(bottlenecks, 'missing_review_dates'),
        missingExpectedOutcomes: number(bottlenecks, 'missing_expected_outcomes'),
        pendingApproval: number(bottlenecks, 'pending_approval'),
        awaitingImplementation: number(bottlenecks, 'awaiting_implementation'),
      },
    };
  }

  async getGovernanceOverview(organizationId: string, userId: string, role: string) {
    const privileged = this.isPrivileged(role);
    const visibility = `(
      decision.team_id IS NULL
      OR $2::boolean = TRUE
      OR EXISTS (
        SELECT 1 FROM team_members member
         WHERE member.team_id = decision.team_id
           AND member.user_id = $3::uuid
      )
    )`;

    const summaryResult = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE decision.status = 'proposed' AND decision.approval_due_at IS NOT NULL)::int AS pending,
         COUNT(*) FILTER (WHERE decision.status = 'proposed' AND decision.approval_due_at < NOW())::int AS overdue,
         COUNT(*) FILTER (WHERE decision.status = 'proposed' AND decision.approval_due_at >= NOW() AND decision.approval_due_at <= NOW() + INTERVAL '48 hours')::int AS due_soon,
         COUNT(*) FILTER (WHERE decision.status = 'proposed' AND decision.approval_escalation_count > 0)::int AS escalated
       FROM knowledge_decisions decision
       WHERE decision.organization_id = $1::uuid AND ${visibility}`,
      [organizationId, privileged, userId],
    );

    const queueResult = await this.db.query(
      `SELECT decision.id,
              decision.title,
              decision.decision_type AS "decisionType",
              decision.priority,
              decision.approval_required_role AS "requiredRole",
              decision.approval_due_at AS "approvalDueAt",
              decision.approval_escalated_at AS "lastEscalatedAt",
              decision.approval_escalation_count AS "escalationCount",
              owner.name AS "ownerName",
              GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - decision.approval_due_at)) / 3600))::int AS "hoursOverdue",
              (decision.approval_due_at < NOW()) AS "isOverdue"
         FROM knowledge_decisions decision
         LEFT JOIN users owner ON owner.id = decision.owner_id
        WHERE decision.organization_id = $1::uuid
          AND decision.status = 'proposed'
          AND decision.approval_due_at IS NOT NULL
          AND decision.approval_due_at <= NOW() + INTERVAL '7 days'
          AND ${visibility}
        ORDER BY decision.approval_due_at ASC
        LIMIT 50`,
      [organizationId, privileged, userId],
    );

    let policies: Array<Record<string, unknown>> = [];
    if (privileged) {
      const policyResult = await this.db.query(
        `SELECT id, decision_type, priority,
                required_approver_role, approval_due_hours,
                allow_delegation, escalation_repeat_hours, is_active,
                created_at, updated_at
           FROM knowledge_decision_approval_policies
          WHERE organization_id = $1::uuid
          ORDER BY is_active DESC, decision_type, priority`,
        [organizationId],
      );
      policies = policyResult.rows as Array<Record<string, unknown>>;
    }

    const delegationResult = await this.db.query(
      `SELECT delegation.id,
              delegation.principal_user_id AS "principalUserId",
              principal.name AS "principalName",
              delegation.delegate_user_id AS "delegateUserId",
              delegate.name AS "delegateName",
              delegation.decision_type AS "decisionType",
              delegation.priority,
              delegation.valid_from AS "validFrom",
              delegation.valid_until AS "validUntil",
              delegation.revoked_at AS "revokedAt",
              delegation.created_at AS "createdAt"
         FROM knowledge_decision_delegations delegation
         LEFT JOIN users principal ON principal.id = delegation.principal_user_id
         LEFT JOIN users delegate ON delegate.id = delegation.delegate_user_id
        WHERE delegation.organization_id = $1::uuid
          AND ($3::boolean = TRUE OR delegation.principal_user_id = $2::uuid OR delegation.delegate_user_id = $2::uuid)
        ORDER BY delegation.created_at DESC
        LIMIT 100`,
      [organizationId, userId, privileged],
    );

    const eventResult = await this.db.query(
      `SELECT event.id,
              event.event_type AS "eventType",
              event.details,
              event.note,
              event.created_at AS "createdAt",
              actor.name AS "actorName",
              actor.email AS "actorEmail",
              represented.name AS "representedUserName",
              decision.title AS "decisionTitle"
         FROM knowledge_decision_governance_events event
         LEFT JOIN users actor ON actor.id = event.actor_id
         LEFT JOIN users represented ON represented.id = event.represented_user_id
         LEFT JOIN knowledge_decisions decision
           ON decision.id = event.decision_id
          AND decision.organization_id = event.organization_id
        WHERE event.organization_id = $1::uuid
          AND ($2::boolean = TRUE OR event.actor_id = $3::uuid OR event.represented_user_id = $3::uuid)
          AND (
            event.decision_id IS NULL
            OR EXISTS (
              SELECT 1 FROM knowledge_decisions visible
               WHERE visible.id = event.decision_id
                 AND visible.organization_id = event.organization_id
                 AND (visible.team_id IS NULL OR $2::boolean = TRUE OR EXISTS (
                   SELECT 1 FROM team_members member
                    WHERE member.team_id = visible.team_id AND member.user_id = $3::uuid
                 ))
            )
          )
        ORDER BY event.created_at DESC
        LIMIT 40`,
      [organizationId, privileged, userId],
    );

    const summary = summaryResult.rows[0] ?? {};
    return {
      summary: {
        pending: Number(summary.pending ?? 0),
        overdue: Number(summary.overdue ?? 0),
        dueSoon: Number(summary.due_soon ?? 0),
        escalated: Number(summary.escalated ?? 0),
      },
      queue: queueResult.rows,
      policies,
      delegations: delegationResult.rows,
      events: eventResult.rows,
      permissions: {
        managePolicies: privileged,
        manageOrganisation: this.canManageOrganisation(role),
        canEscalate: this.canManageOrganisation(role),
      },
    };
  }

  async saveApprovalPolicy(organizationId: string, userId: string, role: string, input: Record<string, unknown>) {
    this.assertGovernanceAdmin(role);
    const decisionType = String(input.decisionType ?? 'all').trim().toLowerCase();
    const priority = String(input.priority ?? 'all').trim().toLowerCase();
    const requiredRole = String(input.requiredApproverRole ?? '').trim().toLowerCase();
    if (decisionType !== 'all' && !DECISION_TYPES.has(decisionType)) throw new BadRequestException('Invalid policy decision type.');
    if (priority !== 'all' && !PRIORITIES.has(priority)) throw new BadRequestException('Invalid policy priority.');
    if (!['manager', 'admin', 'owner'].includes(requiredRole)) throw new BadRequestException('Required approver role must be manager, admin or owner.');
    const approvalDueHours = Number(input.approvalDueHours);
    const escalationRepeatHours = input.escalationRepeatHours === undefined ? 24 : Number(input.escalationRepeatHours);
    if (!Number.isInteger(approvalDueHours) || approvalDueHours < 1 || approvalDueHours > 8760) {
      throw new BadRequestException('Approval deadline must be between 1 and 8760 hours.');
    }
    if (!Number.isInteger(escalationRepeatHours) || escalationRepeatHours < 1 || escalationRepeatHours > 720) {
      throw new BadRequestException('Escalation repeat interval must be between 1 and 720 hours.');
    }
    const allowDelegation = input.allowDelegation === undefined ? true : input.allowDelegation === true;
    const isActive = input.isActive === undefined ? true : input.isActive === true;
    const policyId = input.id === undefined || input.id === null || input.id === ''
      ? null
      : this.assertUuid(input.id, 'Policy ID');

    return this.db.transaction(async client => {
      let policy: Record<string, unknown> | undefined;
      let previous: Record<string, unknown> | null = null;
      if (policyId) {
        const existing = await client.query(
          `SELECT * FROM knowledge_decision_approval_policies
            WHERE id = $1::uuid AND organization_id = $2::uuid
            FOR UPDATE`,
          [policyId, organizationId],
        );
        previous = (existing.rows[0] as Record<string, unknown> | undefined) ?? null;
        if (!previous) throw new NotFoundException('Approval policy not found.');
        const updated = await client.query(
          `UPDATE knowledge_decision_approval_policies
              SET decision_type = $1,
                  priority = $2,
                  required_approver_role = $3,
                  approval_due_hours = $4,
                  allow_delegation = $5,
                  escalation_repeat_hours = $6,
                  is_active = $7,
                  updated_by_id = $8::uuid,
                  updated_at = NOW()
            WHERE id = $9::uuid AND organization_id = $10::uuid
            RETURNING *`,
          [decisionType, priority, requiredRole, approvalDueHours, allowDelegation, escalationRepeatHours, isActive, userId, policyId, organizationId],
        );
        policy = updated.rows[0] as Record<string, unknown> | undefined;
      } else {
        const duplicate = await client.query(
          `SELECT id FROM knowledge_decision_approval_policies
            WHERE organization_id = $1::uuid AND decision_type = $2 AND priority = $3
            LIMIT 1`,
          [organizationId, decisionType, priority],
        );
        if (duplicate.rows[0]) throw new ConflictException('A policy already exists for this decision type and priority. Edit the existing policy instead.');
        const inserted = await client.query(
          `INSERT INTO knowledge_decision_approval_policies (
             organization_id, decision_type, priority, required_approver_role,
             approval_due_hours, allow_delegation, escalation_repeat_hours,
             is_active, created_by_id, updated_by_id
           ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $9::uuid)
           RETURNING *`,
          [organizationId, decisionType, priority, requiredRole, approvalDueHours, allowDelegation, escalationRepeatHours, isActive, userId],
        );
        policy = inserted.rows[0] as Record<string, unknown> | undefined;
      }
      if (!policy) throw new ConflictException('Approval policy could not be saved.');
      await this.recordGovernanceEvent(client, {
        organizationId,
        eventType: previous ? 'approval_policy_updated' : 'approval_policy_created',
        actorId: userId,
        policyId: String(policy.id),
        details: {
          before: previous,
          after: policy,
        },
      });
      return policy;
    });
  }

  async deactivateApprovalPolicy(organizationId: string, userId: string, role: string, id: string) {
    this.assertGovernanceAdmin(role);
    const policyId = this.assertUuid(id, 'Policy ID');
    return this.db.transaction(async client => {
      const existing = await client.query(
        `SELECT * FROM knowledge_decision_approval_policies
          WHERE id = $1::uuid AND organization_id = $2::uuid
          FOR UPDATE`,
        [policyId, organizationId],
      );
      const previous = existing.rows[0] as Record<string, unknown> | undefined;
      if (!previous) throw new NotFoundException('Approval policy not found.');
      const result = await client.query(
        `UPDATE knowledge_decision_approval_policies
            SET is_active = FALSE, updated_by_id = $1::uuid, updated_at = NOW()
          WHERE id = $2::uuid AND organization_id = $3::uuid
          RETURNING *`,
        [userId, policyId, organizationId],
      );
      await this.recordGovernanceEvent(client, {
        organizationId,
        eventType: 'approval_policy_deactivated',
        actorId: userId,
        policyId,
        details: { before: previous, after: result.rows[0] },
      });
      return result.rows[0];
    });
  }

  async createApprovalDelegation(organizationId: string, userId: string, role: string, input: Record<string, unknown>) {
    const principalId = input.principalUserId
      ? this.assertUuid(input.principalUserId, 'Principal user ID')
      : userId;
    const delegateId = this.assertUuid(input.delegateUserId, 'Delegate user ID');
    if (principalId === delegateId) throw new BadRequestException('A user cannot delegate approval authority to themselves.');
    if (principalId !== userId) {
      throw new ForbiddenException('Approval authority must be delegated by the principal user themselves. Organisation administrators may revoke a delegation, but cannot grant one on another userâ€™s behalf.');
    }
    await this.ensureUser(organizationId, principalId);
    await this.ensureUser(organizationId, delegateId);

    const decisionType = String(input.decisionType ?? 'all').trim().toLowerCase();
    const priority = String(input.priority ?? 'all').trim().toLowerCase();
    if (decisionType !== 'all' && !DECISION_TYPES.has(decisionType)) throw new BadRequestException('Invalid delegation decision type.');
    if (priority !== 'all' && !PRIORITIES.has(priority)) throw new BadRequestException('Invalid delegation priority.');
    const validFrom = this.parseDate(input.validFrom, 'validFrom') ?? new Date().toISOString();
    const validUntil = this.parseDate(input.validUntil, 'validUntil');
    if (!validUntil) throw new BadRequestException('A delegation expiry date is required.');
    if (Date.parse(validUntil) <= Date.parse(validFrom)) throw new BadRequestException('Delegation expiry must be after its start date.');
    if (Date.parse(validUntil) <= Date.now()) throw new BadRequestException('Delegation expiry must be in the future.');
    if (Date.parse(validUntil) > Date.now() + 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Delegations cannot be granted for more than 366 days.');
    }
    const note = this.clean(input.note, 1000);

    return this.db.transaction(async client => {
      const duplicate = await client.query(
        `SELECT id FROM knowledge_decision_delegations
          WHERE organization_id = $1::uuid
            AND principal_user_id = $2::uuid
            AND delegate_user_id = $3::uuid
            AND decision_type = $4
            AND priority = $5
            AND revoked_at IS NULL
            AND valid_until > NOW()
          LIMIT 1`,
        [organizationId, principalId, delegateId, decisionType, priority],
      );
      if (duplicate.rows[0]) throw new ConflictException('An active delegation already exists for this user and scope.');
      const inserted = await client.query(
        `INSERT INTO knowledge_decision_delegations (
           organization_id, principal_user_id, delegate_user_id,
           decision_type, priority, valid_from, valid_until, granted_by_id, note
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::timestamptz, $7::timestamptz, $8::uuid, $9)
         RETURNING *`,
        [organizationId, principalId, delegateId, decisionType, priority, validFrom, validUntil, userId, note],
      );
      const delegation = inserted.rows[0] as Record<string, unknown>;
      await this.recordGovernanceEvent(client, {
        organizationId,
        eventType: 'approval_delegation_granted',
        actorId: userId,
        delegationId: String(delegation.id),
        representedUserId: principalId,
        details: {
          principalUserId: principalId,
          delegateUserId: delegateId,
          decisionType,
          priority,
          validFrom,
          validUntil,
        },
        note,
      });
      return delegation;
    });
  }

  async revokeApprovalDelegation(organizationId: string, userId: string, role: string, id: string) {
    const delegationId = this.assertUuid(id, 'Delegation ID');
    return this.db.transaction(async client => {
      const existing = await client.query(
        `SELECT * FROM knowledge_decision_delegations
          WHERE id = $1::uuid AND organization_id = $2::uuid
          FOR UPDATE`,
        [delegationId, organizationId],
      );
      const delegation = existing.rows[0] as Record<string, unknown> | undefined;
      if (!delegation) throw new NotFoundException('Approval delegation not found.');
      if (String(delegation.principal_user_id) !== userId && !this.isPrivileged(role)) {
        throw new ForbiddenException('Only the delegating user or an organisation administrator can revoke this delegation.');
      }
      if (delegation.revoked_at) throw new ConflictException('This delegation has already been revoked.');
      const updated = await client.query(
        `UPDATE knowledge_decision_delegations
            SET revoked_at = NOW(), revoked_by_id = $1::uuid
          WHERE id = $2::uuid AND organization_id = $3::uuid
          RETURNING *`,
        [userId, delegationId, organizationId],
      );
      await this.recordGovernanceEvent(client, {
        organizationId,
        eventType: 'approval_delegation_revoked',
        actorId: userId,
        delegationId,
        representedUserId: String(delegation.principal_user_id),
        details: { before: delegation, after: updated.rows[0] },
      });
      return updated.rows[0];
    });
  }

  async escalateApproval(id: string, organizationId: string, userId: string, role: string, note?: string) {
    if (!this.canManageOrganisation(role)) {
      throw new ForbiddenException('Only an organisation manager or administrator can escalate an overdue approval.');
    }
    const cleanNote = this.clean(note, 1000);
    return this.db.transaction(async client => {
      const current = await this.findAccessibleDecision(id, organizationId, userId, role, true, client);
      if (current.status !== 'proposed' || !current.approval_due_at) {
        throw new ConflictException('Only policy-governed proposed decisions can be escalated.');
      }
      const dueAt = new Date(String(current.approval_due_at));
      if (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() > Date.now()) {
        throw new ConflictException('This approval is not overdue yet.');
      }
      const repeatHours = Math.max(1, Number(current.approval_escalation_repeat_hours ?? 24));
      if (current.approval_escalated_at) {
        const lastEscalatedAt = new Date(String(current.approval_escalated_at));
        if (Number.isFinite(lastEscalatedAt.getTime()) && Date.now() - lastEscalatedAt.getTime() < repeatHours * 60 * 60 * 1000) {
          throw new ConflictException(`This approval was recently escalated. The next escalation is available after ${repeatHours} hours.`);
        }
      }
      const updated = await client.query(
        `UPDATE knowledge_decisions
            SET approval_escalated_at = NOW(),
                approval_escalation_count = approval_escalation_count + 1,
                updated_at = NOW()
          WHERE id = $1::uuid AND organization_id = $2::uuid AND status = 'proposed'
          RETURNING *`,
        [id, organizationId],
      );
      if (!updated.rows[0]) throw new ConflictException('Approval escalation was not persisted.');
      await this.recordGovernanceEvent(client, {
        organizationId,
        eventType: 'approval_escalated',
        actorId: userId,
        decisionId: id,
        policyId: current.approval_policy_id ? String(current.approval_policy_id) : null,
        details: {
          approvalDueAt: current.approval_due_at,
          escalationCount: updated.rows[0].approval_escalation_count,
        },
        note: cleanNote,
      });
      return updated.rows[0];
    });
  }
  async getHistory(
    id: string,
    organizationId: string,
    userId: string,
    role: string,
  ) {
    await this.findAccessibleDecision(id, organizationId, userId, role);
    const result = await this.db.query(
      `SELECT review.id,
              review.previous_status AS "previousStatus",
              review.new_status AS "newStatus",
              review.review_note AS "reviewNote",
              review.outcome_assessment AS "outcomeAssessment",
              review.delegated_for_id AS "delegatedForId",
              review.delegation_id AS "delegationId",
              represented.name AS "representedUserName",
              represented.email AS "representedUserEmail",
              review.created_at AS "createdAt",
              review.reviewer_id AS "reviewerId",
              reviewer.name AS "reviewerName",
              reviewer.email AS "reviewerEmail"
         FROM knowledge_decision_reviews review
         LEFT JOIN users reviewer ON reviewer.id = review.reviewer_id
         LEFT JOIN users represented ON represented.id = review.delegated_for_id
        WHERE review.organization_id = $1::uuid
          AND review.decision_id = $2::uuid
        ORDER BY review.created_at DESC, review.id DESC`,
      [organizationId, id],
    );
    return result.rows;
  }

  async getHistoryPage(
    id: string,
    organizationId: string,
    userId: string,
    role: string,
    options: { limit?: string | number; offset?: string | number } = {},
  ) {
    const parsePaginationValue = (
      value: string | number | undefined,
      fallback: number,
      field: string,
    ): number => {
      if (value === undefined || value === '') return fallback;

      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new BadRequestException(`Invalid history ${field}.`);
      }

      return parsed;
    };

    const requestedLimit = parsePaginationValue(
      options.limit,
      25,
      'limit',
    );
    const offset = parsePaginationValue(options.offset, 0, 'offset');
    const limit = Math.max(1, Math.min(100, requestedLimit));

    await this.findAccessibleDecision(id, organizationId, userId, role);
    const countResult = await this.db.query<{ total: string | number }>(
      `SELECT COUNT(*) AS total
         FROM knowledge_decision_reviews
        WHERE organization_id = $1::uuid
          AND decision_id = $2::uuid`,
      [organizationId, id],
    );
    const result = await this.db.query(
      `SELECT review.id,
              review.previous_status AS "previousStatus",
              review.new_status AS "newStatus",
              review.review_note AS "reviewNote",
              review.outcome_assessment AS "outcomeAssessment",
              review.delegated_for_id AS "delegatedForId",
              review.delegation_id AS "delegationId",
              represented.name AS "representedUserName",
              represented.email AS "representedUserEmail",
              review.created_at AS "createdAt",
              review.reviewer_id AS "reviewerId",
              reviewer.name AS "reviewerName",
              reviewer.email AS "reviewerEmail"
         FROM knowledge_decision_reviews review
         LEFT JOIN users reviewer ON reviewer.id = review.reviewer_id
         LEFT JOIN users represented ON represented.id = review.delegated_for_id
        WHERE review.organization_id = $1::uuid AND review.decision_id = $2::uuid
        ORDER BY review.created_at DESC, review.id DESC
        LIMIT $3 OFFSET $4`,
      [organizationId, id, limit, offset],
    );

    return {
      items: result.rows,
      total: Number(countResult.rows[0]?.total ?? 0),
      limit,
      offset,
    };
  }
}