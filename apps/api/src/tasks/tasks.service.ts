import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { LuieEventPublisher } from '../luie/luie-event.publisher';

export interface TaskAccessContext {
  userId: string;
  role: string;
}

type TaskDto = {
  title: string;
  description?: string;
  priority?: string;
  assigneeId?: string | null;
  projectId?: string;
  teamId?: string;
  dueDate?: string | null;
  tags?: string[];
};

const ROLE_LEVEL: Record<string, number> = {
  viewer: 1,
  member: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

const VALID_STATUSES = new Set(['todo', 'in_progress', 'review', 'done', 'cancelled']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

@Injectable()
export class TasksService {
  constructor(
    private readonly db: DatabaseService,
    private readonly luiePublisher: LuieEventPublisher,
  ) {}

  private isOrgAdmin(actor: TaskAccessContext): boolean {
    return actor.role === 'owner' || actor.role === 'admin';
  }

  private isManager(actor: TaskAccessContext): boolean {
    return this.isOrgAdmin(actor) || actor.role === 'manager';
  }

  private assertRole(actor: TaskAccessContext, minimum: 'member' | 'manager'): void {
    const required = ROLE_LEVEL[minimum];
    if (!actor?.userId || (ROLE_LEVEL[actor.role] ?? 0) < required) {
      throw new ForbiddenException(`Requires role: ${minimum} or higher.`);
    }
  }

  private assertUuid(value: unknown, field: string): void {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof value !== 'string' || !uuidPattern.test(value)) {
      throw new BadRequestException(`Invalid ${field}.`);
    }
  }

  private validateDateInput(value: unknown, field: string, dateOnly = false): void {
    if (value === undefined || value === null) return;
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`Invalid ${field}.`);
    }

    const candidate = value.trim();
    const datePart = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(candidate);
    if (!datePart) {
      throw new BadRequestException(`Invalid ${field}.`);
    }
    if (dateOnly && !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
      throw new BadRequestException(`Invalid ${field}; expected YYYY-MM-DD.`);
    }

    const calendarDate = `${datePart[1]}-${datePart[2]}-${datePart[3]}`;
    const parsedCalendarDate = new Date(`${calendarDate}T00:00:00.000Z`);
    if (!Number.isFinite(parsedCalendarDate.getTime()) || parsedCalendarDate.toISOString().slice(0, 10) !== calendarDate) {
      throw new BadRequestException(`Invalid ${field}.`);
    }
    if (!dateOnly && !Number.isFinite(Date.parse(candidate))) {
      throw new BadRequestException(`Invalid ${field}.`);
    }
  }

  private validatePriority(priority?: string): void {
    if (priority !== undefined && !VALID_PRIORITIES.has(priority)) {
      throw new BadRequestException('Invalid task priority.');
    }
  }

  private validateStatus(status?: string): void {
    if (status !== undefined && !VALID_STATUSES.has(status)) {
      throw new BadRequestException('Invalid task status.');
    }
  }

  private async ensureTeamAccess(
    teamId: string,
    organizationId: string,
    actor: TaskAccessContext,
  ): Promise<void> {
    const result = await this.db.query(
      `SELECT t.id
       FROM teams t
       WHERE t.id = $1
         AND t.organization_id = $2
         AND (
           $3::boolean = TRUE
           OR EXISTS (
             SELECT 1 FROM team_members tm
             WHERE tm.team_id = t.id AND tm.user_id = $4
           )
         )`,
      [teamId, organizationId, this.isOrgAdmin(actor), actor.userId],
    );

    if (!result.rows[0]) {
      throw new BadRequestException('The selected team is unavailable to this user.');
    }
  }

  private async ensureAssignee(
    assigneeId: string,
    organizationId: string,
    teamId: string | null,
  ): Promise<void> {
    const result = await this.db.query(
      `SELECT u.id
       FROM users u
       WHERE u.id = $1
         AND u.organization_id = $2
         AND u.is_active = TRUE
         AND (
           $3::uuid IS NULL
           OR EXISTS (
             SELECT 1 FROM team_members tm
             WHERE tm.team_id = $3::uuid AND tm.user_id = u.id
           )
         )`,
      [assigneeId, organizationId, teamId],
    );

    if (!result.rows[0]) {
      throw new BadRequestException(
        'The assignee must be an active organization member and belong to the task team.',
      );
    }
  }

  private async getAccessibleProjectTeam(
    projectId: string,
    organizationId: string,
    actor: TaskAccessContext,
  ): Promise<string | null> {
    const result = await this.db.query<{ team_id: string | null }>(
      `SELECT p.team_id
       FROM projects p
       WHERE p.id = $1
         AND p.organization_id = $2
         AND (
           p.team_id IS NULL
           OR $3::boolean = TRUE
           OR EXISTS (
             SELECT 1 FROM team_members tm
             WHERE tm.team_id = p.team_id AND tm.user_id = $4
           )
         )`,
      [projectId, organizationId, this.isOrgAdmin(actor), actor.userId],
    );

    if (!result.rows[0]) {
      throw new BadRequestException('The selected project is unavailable to this user.');
    }

    return result.rows[0].team_id ?? null;
  }

  async create(
    organizationId: string,
    userId: string,
    dto: TaskDto,
    actor: TaskAccessContext,
    source?: { meetingActionItemId?: string; briefingItemKey?: string },
    transaction?: import('pg').PoolClient,
  ) {
    this.assertRole(actor, 'member');
    if (userId !== actor.userId) throw new ForbiddenException('Task creator must match the authenticated actor.');
    if (source?.meetingActionItemId) {
      this.assertUuid(source.meetingActionItemId, 'meeting action item ID');
      const existingSource = await this.db.query<{ id: string }>(
        `SELECT id FROM tasks
          WHERE organization_id = $1::uuid AND source_meeting_action_item_id = $2::uuid
          LIMIT 1`,
        [organizationId, source.meetingActionItemId],
      );
      if (existingSource.rows[0]?.id) {
        return this.findById(existingSource.rows[0].id, organizationId, actor);
      }
    }
    this.validatePriority(dto.priority);

    if (typeof dto.title !== 'string' || !dto.title.trim()) {
      throw new BadRequestException('Task title is required.');
    }

    if (dto.teamId !== undefined) this.assertUuid(dto.teamId, 'task team ID');
    if (dto.projectId !== undefined) this.assertUuid(dto.projectId, 'task project ID');
    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      this.assertUuid(dto.assigneeId, 'task assignee ID');
    }
    if (dto.description !== undefined && typeof dto.description !== 'string') {
      throw new BadRequestException('Task description must be a string.');
    }
    if (dto.title.trim().length > 500) {
      throw new BadRequestException('Task title cannot exceed 500 characters.');
    }
    this.validateDateInput(dto.dueDate, 'task due date');
    if (dto.tags !== undefined && (!Array.isArray(dto.tags) || dto.tags.some((tag) => typeof tag !== 'string'))) {
      throw new BadRequestException('Task tags must be an array of strings.');
    }

    // Resolve the effective team from the explicit task team or its project.
    // Project and team visibility are checked before any task row is inserted.
    let teamId = dto.teamId ?? null;

    if (dto.projectId) {
      const projectTeamId = await this.getAccessibleProjectTeam(
        dto.projectId,
        organizationId,
        actor,
      );

      if (projectTeamId && teamId && projectTeamId !== teamId) {
        throw new BadRequestException('Task team must match the selected project team.');
      }
      if (!teamId) teamId = projectTeamId;
    }

    if (teamId) {
      await this.ensureTeamAccess(teamId, organizationId, actor);
    }

    if (dto.assigneeId) {
      await this.ensureAssignee(dto.assigneeId, organizationId, teamId);
    }
    if (source?.meetingActionItemId) this.assertUuid(source.meetingActionItemId, 'meeting action item ID');
    const id = uuidv4();
    const assigner = dto.assigneeId && dto.assigneeId !== userId
      ? await this.db.findOne<{ name: string }>('users', { id: userId })
      : null;
    const insert = async (client: import('pg').PoolClient) => {
      const briefingItem = source?.briefingItemKey;
      if (briefingItem) {
        const lock = [organizationId, userId, briefingItem].join(':');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lock]);
        const existing = await client.query<{ id: string }>(
          `SELECT id FROM tasks WHERE organization_id = $1 AND created_by_id = $2
             AND metadata ->> 'briefingItemKey' = $3 LIMIT 1`,
          [organizationId, userId, briefingItem],
        );
        if (existing.rows[0]) return { taskId: existing.rows[0].id, createdFresh: false };
      }
      const insertResult = await client.query<{ id: string; status: string; updated_at: Date | string }>(
        `INSERT INTO tasks (id, title, description, priority, organization_id, created_by_id,
          assignee_id, project_id, team_id, due_date, tags, source_meeting_action_item_id${briefingItem ? ', metadata' : ''})
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::uuid${briefingItem ? ", jsonb_build_object('briefingItemKey', $13::text)" : ''})
         ON CONFLICT (organization_id, source_meeting_action_item_id)
         WHERE source_meeting_action_item_id IS NOT NULL
         DO NOTHING
         RETURNING id, status, updated_at`,
        [id, dto.title.trim(), dto.description ?? null, dto.priority ?? 'medium',
          organizationId, userId, dto.assigneeId ?? null, dto.projectId ?? null,
          teamId, dto.dueDate ?? null, dto.tags ?? [], source?.meetingActionItemId ?? null,
          ...(briefingItem ? [briefingItem] : [])],
      );

      let taskId = id;
      let createdFresh = !source?.meetingActionItemId;
      const insertedRow = insertResult.rows[0];
      const insertedId = insertedRow?.id;
      if (insertedId) {
        taskId = insertedId;
        createdFresh = true;
      } else if (source?.meetingActionItemId) {
        const existingTask = await client.query<{ id: string }>(
          `SELECT id FROM tasks
            WHERE organization_id = $1::uuid AND source_meeting_action_item_id = $2::uuid
            LIMIT 1`,
          [organizationId, source.meetingActionItemId],
        );
        if (!existingTask.rows[0]?.id) {
          throw new ConflictException('The meeting action task could not be resolved after an idempotent insert.');
        }
        taskId = existingTask.rows[0].id;
        createdFresh = false;
      }

      if (createdFresh) {
        await this.luiePublisher.append(client, {
          organizationId,
          eventKey: `task.created:${taskId}:1`,
          eventType: 'task.created',
          aggregateType: 'task',
          aggregateId: taskId,
          actorId: actor.userId,
          teamId,
          payload: {
            taskId,
            title: dto.title.trim(),
            status: String(insertedRow?.status ?? 'todo'),
            priority: dto.priority ?? 'medium',
            assigneeId: dto.assigneeId ?? null,
            projectId: dto.projectId ?? null,
            dueDate: dto.dueDate ?? null,
            teamId,
          },
        }, ['luie.legacy-domain-bridge']);
      }

      if (createdFresh && dto.assigneeId && dto.assigneeId !== userId) {
        await this.luiePublisher.append(client, {
          organizationId,
          eventKey: `task.assigned:${taskId}:${dto.assigneeId}`,
          eventType: 'task.assigned',
          aggregateType: 'task',
          aggregateId: taskId,
          actorId: actor.userId,
          teamId,
          payload: {
            taskId, taskTitle: dto.title.trim(), assigneeId: dto.assigneeId,
            assignerName: assigner?.name ?? 'A team member', actorId: actor.userId,
            organizationId, teamId, status: String(insertedRow?.status ?? 'todo'), priority: dto.priority ?? 'medium',
            dueDate: dto.dueDate ?? null,
          },
        }, ['luie.legacy-domain-bridge']);
      }
      return { taskId, createdFresh };
    };
    if (transaction) return { id: (await insert(transaction)).taskId };
    const createResult = await this.db.transaction(insert);
    return this.findById(createResult.taskId, organizationId, actor);
  }

  async findAll(
    organizationId: string,
    query: {
      status?: string; priority?: string; assigneeId?: string;
      projectId?: string; teamId?: string; search?: string;
      page?: number; pageSize?: number; overdue?: string;
    },
    actor: TaskAccessContext,
  ) {
    this.assertRole(actor, 'member');
    this.validateStatus(query.status);
    this.validatePriority(query.priority);
    if (query.assigneeId !== undefined) this.assertUuid(query.assigneeId, 'assignee filter');
    if (query.projectId !== undefined) this.assertUuid(query.projectId, 'project filter');
    if (query.teamId !== undefined) this.assertUuid(query.teamId, 'team filter');

    const requestedPage = Number(query.page ?? 1);
    const requestedPageSize = Number(query.pageSize ?? 50);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0
      ? Math.min(requestedPageSize, 100)
      : 50;
    const offset = (page - 1) * pageSize;
    const conditions = [
      't.organization_id = $1',
      `(COALESCE(t.team_id, (SELECT p_scope.team_id FROM projects p_scope
        WHERE p_scope.id = t.project_id AND p_scope.organization_id = t.organization_id)) IS NULL
        OR $2::boolean = TRUE OR EXISTS (
          SELECT 1 FROM team_members scope_member
          WHERE scope_member.team_id = COALESCE(t.team_id, (SELECT p_scope.team_id FROM projects p_scope
            WHERE p_scope.id = t.project_id AND p_scope.organization_id = t.organization_id))
            AND scope_member.user_id = $3
        ))`,
    ];
    const values: unknown[] = [organizationId, this.isOrgAdmin(actor), actor.userId];
    let idx = 4;

    if (query.priority)   { conditions.push(`t.priority = $${idx++}`);     values.push(query.priority); }
    if (query.assigneeId) { conditions.push(`t.assignee_id = $${idx++}`);  values.push(query.assigneeId); }
    if (query.projectId)  { conditions.push(`t.project_id = $${idx++}`);   values.push(query.projectId); }
    if (query.teamId)     { conditions.push(`t.team_id = $${idx++}`);      values.push(query.teamId); }
    if (query.search)     { conditions.push(`t.title ILIKE $${idx++}`);    values.push(`%${query.search}%`); }

    const overdue = `t.status NOT IN ('done', 'cancelled') AND t.due_date < NOW()`;
    const filters: string[] = [];
    if (query.status) { filters.push(`t.status = $${idx++}`); values.push(query.status); }
    if (query.overdue === 'true') filters.push(overdue);
    const matches = filters.join(' AND ') || 'TRUE';
    const where = conditions.join(' AND ');
    const [countRes, dataRes] = await Promise.all([
      this.db.query<{ count: string; total: string; in_progress: string; done: string; overdue: string }>(
        `SELECT COUNT(*) FILTER (WHERE ${matches}) AS count,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE t.status = 'in_progress') AS in_progress,
                COUNT(*) FILTER (WHERE t.status = 'done') AS done,
                COUNT(*) FILTER (WHERE ${overdue}) AS overdue
         FROM tasks t WHERE ${where}`,
        values,
      ),
      this.db.query(
        `SELECT t.*, u.name as assignee_name, p.name as project_name
         FROM tasks t
         LEFT JOIN users u ON t.assignee_id = u.id AND u.organization_id = t.organization_id
         LEFT JOIN projects p ON t.project_id = p.id AND p.organization_id = t.organization_id
         WHERE ${where} AND (${matches})
         ORDER BY
           CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           t.due_date ASC NULLS LAST, t.created_at DESC
         LIMIT ${pageSize} OFFSET ${offset}`,
        values,
      ),
    ]);

    const counts = countRes.rows[0];
    const total = Number(counts?.count ?? 0);
    return {
      data: dataRes.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      summary: {
        total: Number(counts?.total ?? 0),
        inProgress: Number(counts?.in_progress ?? 0),
        completed: Number(counts?.done ?? 0),
        overdue: Number(counts?.overdue ?? 0),
      },
    };
  }

  async findById(id: string, organizationId: string, actor: TaskAccessContext) {
    this.assertRole(actor, 'member');
    this.assertUuid(id, 'task ID');
    const res = await this.db.query(
      `SELECT t.*, u.name as assignee_name, p.name as project_name,
              p.team_id AS project_team_id, cb.name as created_by_name
       FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id AND u.organization_id = t.organization_id
       LEFT JOIN projects p ON t.project_id = p.id AND p.organization_id = t.organization_id
       LEFT JOIN users cb ON t.created_by_id = cb.id AND cb.organization_id = t.organization_id
       WHERE t.id = $1
         AND t.organization_id = $2
         AND (COALESCE(t.team_id, p.team_id) IS NULL OR $3::boolean = TRUE OR EXISTS (
           SELECT 1 FROM team_members scope_member
           WHERE scope_member.team_id = COALESCE(t.team_id, p.team_id) AND scope_member.user_id = $4
         ))`,
      [id, organizationId, this.isOrgAdmin(actor), actor.userId],
    );
    if (!res.rows[0]) throw new NotFoundException('Task not found');
    return res.rows[0];
  }

  async update(
    id: string,
    organizationId: string,
    dto: Partial<{
      title: string; description: string; status: string; priority: string;
      assigneeId: string | null; dueDate: string | null; tags: string[];
    }>,
    actor: TaskAccessContext,
  ) {
    this.assertRole(actor, 'member');
    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      this.assertUuid(dto.assigneeId, 'task assignee ID');
    }
    this.validateDateInput(dto.dueDate, 'task due date');
    const existing = await this.findById(id, organizationId, actor);
    if (dto.title !== undefined && (typeof dto.title !== 'string' || !dto.title.trim())) {
      throw new BadRequestException('Task title cannot be empty.');
    }
    if (dto.title !== undefined && dto.title.trim().length > 500) {
      throw new BadRequestException('Task title cannot exceed 500 characters.');
    }
    if (dto.description !== undefined && typeof dto.description !== 'string') {
      throw new BadRequestException('Task description must be a string.');
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== null && typeof dto.assigneeId !== 'string') {
      throw new BadRequestException('Invalid task assignee ID.');
    }
    if (dto.dueDate !== undefined && dto.dueDate !== null && typeof dto.dueDate !== 'string') {
      throw new BadRequestException('Task due date must be a date string or null.');
    }
    const fields = Object.keys(dto).filter((key) => (dto as Record<string, unknown>)[key] !== undefined);
    if (fields.length === 0) return existing;

    const isCreator = existing.created_by_id === actor.userId;
    const isAssignee = existing.assignee_id === actor.userId;
    const statusOnly = fields.length === 1 && fields[0] === 'status';

    if (!this.isManager(actor) && !isCreator && !(isAssignee && statusOnly)) {
      throw new ForbiddenException('Only the task creator or a manager can edit this task. Assignees may update status only.');
    }

    this.validateStatus(dto.status);
    this.validatePriority(dto.priority);

    if (dto.assigneeId) {
      await this.ensureAssignee(
        dto.assigneeId,
        organizationId,
        ((existing.team_id as string | null) ?? (existing.project_team_id as string | null)) ?? null,
      );
    }

    if (dto.tags !== undefined && (!Array.isArray(dto.tags) || dto.tags.some((tag) => typeof tag !== 'string'))) {
      throw new BadRequestException('Task tags must be an array of strings.');
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.title !== undefined)       { if (!dto.title.trim()) throw new BadRequestException('Task title cannot be empty.'); updates.push(`title = $${idx++}`); values.push(dto.title.trim()); }
    if (dto.description !== undefined) { updates.push(`description = $${idx++}`); values.push(dto.description); }
    if (dto.status !== undefined) {
      updates.push(`status = $${idx++}`); values.push(dto.status);
      if (dto.status === 'done') updates.push(`completed_at = NOW()`);
      else updates.push(`completed_at = NULL`);
    }
    if (dto.priority !== undefined)   { updates.push(`priority = $${idx++}`); values.push(dto.priority); }
    if (dto.assigneeId !== undefined) { updates.push(`assignee_id = $${idx++}`); values.push(dto.assigneeId); }
    if (dto.dueDate !== undefined)    { updates.push(`due_date = $${idx++}`); values.push(dto.dueDate); }
    if (dto.tags !== undefined)       { updates.push(`tags = $${idx++}`); values.push(dto.tags); }
    if (updates.length === 0) return existing;

    const newAssigneeId = dto.assigneeId;
    const updater = newAssigneeId && newAssigneeId !== existing.assignee_id
      ? await this.db.findOne<{ name: string }>('users', { id: actor.userId })
      : null;
    updates.push('updated_at = NOW()');
    values.push(id, organizationId);
    await this.db.transaction(async (client) => {
      const updatedResult = await client.query<{
        updated_at: Date | string; previous_assignee_id: string | null; previous_status: string;
        team_id: string | null; project_team_id: string | null; status: string;
        title: string; priority: string; due_date: Date | string | null;
        previous_title: string; previous_description: string | null;
        previous_priority: string; previous_due_date: Date | string | null;
        previous_tags: string[]; previous_project_id: string | null;
        description: string | null;
        tags: string[]; project_id: string | null;
      }>(
        `WITH target AS (
           SELECT t.assignee_id AS previous_assignee_id, t.status AS previous_status, t.team_id,
                  p.team_id AS project_team_id, t.title AS previous_title,
                  t.description AS previous_description, t.priority AS previous_priority,
                  t.due_date AS previous_due_date, t.tags AS previous_tags,
                  t.project_id AS previous_project_id
             FROM tasks t
             LEFT JOIN projects p ON p.id = t.project_id AND p.organization_id = t.organization_id
            WHERE t.id = $${idx}::uuid AND t.organization_id = $${idx + 1}::uuid
            FOR UPDATE OF t
         )
         UPDATE tasks t
            SET ${updates.join(', ')}
           FROM target
          WHERE t.id = $${idx}::uuid AND t.organization_id = $${idx + 1}::uuid
          RETURNING t.updated_at, target.previous_assignee_id, target.previous_status, target.team_id,
                    target.project_team_id, target.previous_title, target.previous_description,
                    target.previous_priority, target.previous_due_date, target.previous_tags,
                    target.previous_project_id, t.status, t.title, t.description, t.priority,
                    t.due_date, t.tags, t.project_id`,
        values,
      );
      const updatedRow = updatedResult.rows[0];
      if (!updatedRow) return;
      const effectiveTeamId = updatedRow.team_id ?? updatedRow.project_team_id ?? null;
      const updatedAt = new Date(updatedRow.updated_at);
      const assigneeChanged = dto.assigneeId !== undefined &&
        dto.assigneeId !== updatedRow.previous_assignee_id;
      if (assigneeChanged) {
        await this.luiePublisher.append(client, {
          organizationId,
          eventKey: `task.assigned:${id}:${dto.assigneeId ?? 'unassigned'}:${updatedAt.toISOString()}`,
          eventType: 'task.assigned',
          aggregateType: 'task',
          aggregateId: id,
          actorId: actor.userId,
          teamId: effectiveTeamId,
          occurredAt: updatedAt,
          payload: {
            taskId: id, taskTitle: updatedRow.title, assigneeId: dto.assigneeId ?? null,
            assignerName: updater?.name ?? 'A team member', actorId: actor.userId,
            organizationId, teamId: effectiveTeamId, status: updatedRow.status,
            priority: updatedRow.priority, dueDate: updatedRow.due_date,
          },
        }, ['luie.legacy-domain-bridge']);
      }
      if (dto.status !== undefined && dto.status !== updatedRow.previous_status) {
        await this.luiePublisher.append(client, {
          organizationId,
          eventKey: `task.status_changed:${id}:${updatedAt.toISOString()}`,
          eventType: 'task.status_changed',
          aggregateType: 'task',
          aggregateId: id,
          actorId: actor.userId,
          teamId: effectiveTeamId,
          occurredAt: updatedAt,
          payload: {
            taskId: id,
            previousStatus: updatedRow.previous_status,
            status: updatedRow.status,
            title: updatedRow.title,
            teamId: effectiveTeamId,
          },
        }, ['luie.legacy-domain-bridge']);
      }
      const sameValue = (left: unknown, right: unknown): boolean => {
        if (left === null || left === undefined || right === null || right === undefined) {
          return (left === null || left === undefined) && (right === null || right === undefined);
        }
        if (left instanceof Date || right instanceof Date) {
          const leftTime = new Date(left as string | number | Date).getTime();
          const rightTime = new Date(right as string | number | Date).getTime();
          return Number.isFinite(leftTime) && leftTime === rightTime;
        }
        return JSON.stringify(left) === JSON.stringify(right);
      };
      const materialChanged =
        (dto.title !== undefined && !sameValue(dto.title.trim(), updatedRow.previous_title)) ||
        (dto.description !== undefined && !sameValue(dto.description, updatedRow.previous_description)) ||
        (dto.priority !== undefined && !sameValue(dto.priority, updatedRow.previous_priority)) ||
        (dto.dueDate !== undefined && !sameValue(dto.dueDate, updatedRow.previous_due_date)) ||
        (dto.tags !== undefined && !sameValue(dto.tags, updatedRow.previous_tags));
      if (materialChanged) {
        await this.luiePublisher.append(client, {
          organizationId,
          eventKey: `task.updated:${id}:${updatedAt.toISOString()}`,
          eventType: 'task.updated',
          aggregateType: 'task',
          aggregateId: id,
          actorId: actor.userId,
          teamId: effectiveTeamId,
          occurredAt: updatedAt,
          payload: {
            taskId: id,
            title: updatedRow.title,
            status: updatedRow.status,
            priority: updatedRow.priority,
            dueDate: updatedRow.due_date,
            teamId: effectiveTeamId,
          },
        }, ['luie.legacy-domain-bridge']);
      }
      if (dto.status === 'done' && updatedRow.previous_status !== 'done') {
        await this.luiePublisher.append(client, {
          organizationId,
          eventKey: `task.completed:${id}:${updatedAt.toISOString()}`,
          eventType: 'task.completed',
          aggregateType: 'task',
          aggregateId: id,
          actorId: actor.userId,
          teamId: effectiveTeamId,
          occurredAt: updatedAt,
          payload: {
            taskId: id, title: updatedRow.title, status: updatedRow.status,
            actorId: actor.userId, organizationId, teamId: effectiveTeamId,
          },
        }, ['luie.legacy-domain-bridge']);
      }
    });

    return this.findById(id, organizationId, actor);
  }

  async delete(id: string, organizationId: string, actor: TaskAccessContext) {
    this.assertRole(actor, 'member');
    this.assertUuid(id, 'task ID');
    await this.db.transaction(async (client) => {
      const existingResult = await client.query<{
        id: string; title: string; status: string; priority: string;
        created_by_id: string; team_id: string | null; project_team_id: string | null;
      }>(
        `SELECT task.id, task.title, task.status, task.priority, task.created_by_id,
                task.team_id, project.team_id AS project_team_id
           FROM tasks task
           LEFT JOIN projects project
             ON project.id = task.project_id
            AND project.organization_id = task.organization_id
          WHERE task.id = $1::uuid
            AND task.organization_id = $2::uuid
            AND (
              COALESCE(task.team_id, project.team_id) IS NULL
              OR $3::boolean = TRUE
              OR EXISTS (
                SELECT 1 FROM team_members member
                 WHERE member.team_id = COALESCE(task.team_id, project.team_id)
                   AND member.user_id = $4::uuid
              )
            )
          FOR UPDATE OF task`,
        [id, organizationId, this.isOrgAdmin(actor), actor.userId],
      );
      const existing = existingResult.rows[0];
      if (!existing) throw new NotFoundException('Task not found');
      if (!this.isManager(actor) && existing.created_by_id !== actor.userId) {
        throw new ForbiddenException('Only the task creator or a manager can delete this task.');
      }
      const deletedAt = new Date();
      const deleted = await client.query(
        'DELETE FROM tasks WHERE id = $1::uuid AND organization_id = $2::uuid RETURNING id',
        [id, organizationId],
      );
      if (!deleted.rows[0]) throw new NotFoundException('Task not found');
      const teamId = existing.team_id ?? existing.project_team_id;
      await this.luiePublisher.append(client, {
        organizationId,
        eventKey: `task.deleted:${id}:${deletedAt.toISOString()}`,
        eventType: 'task.deleted',
        aggregateType: 'task',
        aggregateId: id,
        actorId: actor.userId,
        teamId,
        occurredAt: deletedAt,
        payload: {
          taskId: id,
          title: existing.title,
          status: existing.status,
          priority: existing.priority,
          teamId,
        },
      }, ['luie.legacy-domain-bridge']);
    });
    return { deleted: true };
  }

  async createProject(
    organizationId: string,
    userId: string,
    dto: { name: string; description?: string; teamId?: string; startDate?: string; endDate?: string },
    actor: TaskAccessContext,
  ) {
    this.assertRole(actor, 'manager');
    if (userId !== actor.userId) throw new ForbiddenException('Project owner must match the authenticated actor.');
    const name = typeof dto.name === 'string' ? dto.name.trim() : '';
    if (!name || name.length > 255) {
      throw new BadRequestException('Project name must contain between 1 and 255 characters.');
    }
    if (dto.description !== undefined && typeof dto.description !== 'string') {
      throw new BadRequestException('Project description must be a string.');
    }
    if (dto.teamId !== undefined) this.assertUuid(dto.teamId, 'project team ID');
    this.validateDateInput(dto.startDate, 'project start date', true);
    this.validateDateInput(dto.endDate, 'project end date', true);
    if (dto.startDate && dto.endDate && dto.startDate > dto.endDate) {
      throw new BadRequestException('Project end date cannot precede its start date.');
    }
    if (dto.teamId) await this.ensureTeamAccess(dto.teamId, organizationId, actor);

    const id = uuidv4();
    await this.db.transaction(async (client) => {
      const inserted = await client.query<{ created_at: Date | string }>(
        `INSERT INTO projects (id, name, description, organization_id, owner_id, team_id, start_date, end_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING created_at`,
        [id, name, dto.description ?? null, organizationId, userId,
         dto.teamId ?? null, dto.startDate ?? null, dto.endDate ?? null],
      );
      await this.luiePublisher.append(client, {
        organizationId,
        eventKey: `project.created:${id}:1`,
        eventType: 'project.created',
        aggregateType: 'project',
        aggregateId: id,
        actorId: actor.userId,
        teamId: dto.teamId ?? null,
        occurredAt: inserted.rows[0]?.created_at,
        payload: {
          projectId: id,
          name,
          teamId: dto.teamId ?? null,
          startDate: dto.startDate ?? null,
          endDate: dto.endDate ?? null,
        },
      }, ['luie.legacy-domain-bridge']);
    });
    return this.findProjectById(id, organizationId, actor);
  }

  async updateProject(
    id: string,
    organizationId: string,
    dto: Partial<{ name: string; description: string | null; teamId: string | null; startDate: string | null; endDate: string | null }>,
    actor: TaskAccessContext,
  ) {
    this.assertRole(actor, 'manager');
    this.assertUuid(id, 'project ID');
    const existing = await this.findProjectById(id, organizationId, actor);
    if (dto.name !== undefined && (typeof dto.name !== 'string' || !dto.name.trim() || dto.name.trim().length > 255)) {
      throw new BadRequestException('Project name must contain between 1 and 255 characters.');
    }
    if (dto.description !== undefined && dto.description !== null && typeof dto.description !== 'string') {
      throw new BadRequestException('Project description must be a string or null.');
    }
    if (dto.teamId !== undefined && dto.teamId !== null) {
      this.assertUuid(dto.teamId, 'project team ID');
      await this.ensureTeamAccess(dto.teamId, organizationId, actor);
    }
    this.validateDateInput(dto.startDate ?? undefined, 'project start date', true);
    this.validateDateInput(dto.endDate ?? undefined, 'project end date', true);
    const startDate = dto.startDate === undefined ? existing.start_date : dto.startDate;
    const endDate = dto.endDate === undefined ? existing.end_date : dto.endDate;
    if (startDate && endDate && String(startDate) > String(endDate)) {
      throw new BadRequestException('Project end date cannot precede its start date.');
    }
    const name = dto.name === undefined ? String(existing.name) : dto.name.trim();
    const description = dto.description === undefined ? existing.description : dto.description;
    const teamId = dto.teamId === undefined
      ? (typeof existing.team_id === 'string' ? existing.team_id : null)
      : dto.teamId;
    if (
      name === existing.name &&
      description === existing.description &&
      teamId === existing.team_id &&
      String(startDate ?? '') === String(existing.start_date ?? '') &&
      String(endDate ?? '') === String(existing.end_date ?? '')
    ) {
      return existing;
    }

    await this.db.transaction(async (client) => {
      const updated = await client.query<{ updated_at: Date | string }>(
        `UPDATE projects
            SET name = $3, description = $4, team_id = $5::uuid,
                start_date = $6::date, end_date = $7::date, updated_at = NOW()
          WHERE id = $1::uuid AND organization_id = $2::uuid
          RETURNING updated_at`,
        [id, organizationId, name, description, teamId, startDate, endDate],
      );
      if (!updated.rows[0]) throw new NotFoundException('Project not found');
      await this.luiePublisher.append(client, {
        organizationId,
        eventKey: `project.updated:${id}:${new Date(updated.rows[0].updated_at).toISOString()}`,
        eventType: 'project.updated',
        aggregateType: 'project',
        aggregateId: id,
        actorId: actor.userId,
        teamId,
        occurredAt: updated.rows[0].updated_at,
        payload: {
          projectId: id,
          name,
          teamId,
          startDate: startDate ?? null,
          endDate: endDate ?? null,
        },
      }, ['luie.legacy-domain-bridge']);
    });
    return this.findProjectById(id, organizationId, actor);
  }

  async findProjectTeams(organizationId: string, actor: TaskAccessContext) {
    this.assertRole(actor, 'manager');
    const result = await this.db.query<{ id: string; name: string }>(
      `SELECT t.id, t.name
       FROM teams t
       WHERE t.organization_id = $1 AND ($2::boolean = TRUE OR EXISTS (
         SELECT 1 FROM team_members member WHERE member.team_id = t.id AND member.user_id = $3
       ))
       ORDER BY t.name, t.id`,
      [organizationId, this.isOrgAdmin(actor), actor.userId],
    );
    return result.rows;
  }

  async findProjects(organizationId: string, actor: TaskAccessContext) {
    this.assertRole(actor, 'member');
    const res = await this.db.query(
      `SELECT p.*, p.start_date::text AS start_date, p.end_date::text AS end_date,
              team.name AS team_name, owner.name AS owner_name,
              COUNT(t.id) as task_count,
              COUNT(t.id) FILTER (WHERE t.status = 'done') as completed_task_count
       FROM projects p
       LEFT JOIN teams team ON team.id = p.team_id AND team.organization_id = p.organization_id
       LEFT JOIN users owner ON owner.id = p.owner_id AND owner.organization_id = p.organization_id
       LEFT JOIN tasks t ON t.project_id = p.id
         AND t.organization_id = p.organization_id
         AND (COALESCE(t.team_id, p.team_id) IS NULL OR $2::boolean = TRUE OR EXISTS (
           SELECT 1 FROM team_members task_scope_member
           WHERE task_scope_member.team_id = COALESCE(t.team_id, p.team_id)
             AND task_scope_member.user_id = $3
         ))
       WHERE p.organization_id = $1
         AND (p.team_id IS NULL OR $2::boolean = TRUE OR EXISTS (
           SELECT 1 FROM team_members scope_member
           WHERE scope_member.team_id = p.team_id AND scope_member.user_id = $3
         ))
       GROUP BY p.id, team.name, owner.name
       ORDER BY p.created_at DESC`,
      [organizationId, this.isOrgAdmin(actor), actor.userId],
    );
    return res.rows;
  }

  async findProjectById(id: string, organizationId: string, actor: TaskAccessContext) {
    this.assertRole(actor, 'member');
    this.assertUuid(id, 'project ID');
    const res = await this.db.query(
      `SELECT p.*, COUNT(t.id) as task_count,
              COUNT(t.id) FILTER (WHERE t.status = 'done') as completed_task_count
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
         AND t.organization_id = p.organization_id
         AND (COALESCE(t.team_id, p.team_id) IS NULL OR $3::boolean = TRUE OR EXISTS (
           SELECT 1 FROM team_members task_scope_member
           WHERE task_scope_member.team_id = COALESCE(t.team_id, p.team_id)
             AND task_scope_member.user_id = $4
         ))
       WHERE p.id = $1
         AND p.organization_id = $2
         AND (p.team_id IS NULL OR $3::boolean = TRUE OR EXISTS (
           SELECT 1 FROM team_members scope_member
           WHERE scope_member.team_id = p.team_id AND scope_member.user_id = $4
         ))
       GROUP BY p.id`,
      [id, organizationId, this.isOrgAdmin(actor), actor.userId],
    );
    if (!res.rows[0]) throw new NotFoundException('Project not found');
    return res.rows[0];
  }
}
