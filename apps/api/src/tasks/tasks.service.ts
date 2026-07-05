import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class TasksService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    dto: {
      title: string;
      description?: string;
      priority?: string;
      assigneeId?: string;
      projectId?: string;
      teamId?: string;
      dueDate?: string;
      tags?: string[];
    },
  ) {
    const id = uuidv4();
    await this.db.query(
      `INSERT INTO tasks (id, title, description, priority, organization_id, created_by_id,
        assignee_id, project_id, team_id, due_date, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id, dto.title, dto.description ?? null, dto.priority ?? 'medium',
        organizationId, userId, dto.assigneeId ?? null, dto.projectId ?? null,
        dto.teamId ?? null, dto.dueDate ?? null,
        `{${(dto.tags ?? []).join(',')}}`,
      ],
    );

    // Emit task.assigned event if assigned to someone other than the creator
    if (dto.assigneeId && dto.assigneeId !== userId) {
      const creator = await this.db.findOne<{ name: string }>('users', { id: userId });
      this.eventEmitter.emit('task.assigned', {
        taskId: id,
        taskTitle: dto.title,
        assigneeId: dto.assigneeId,
        assignerName: creator?.name ?? 'A team member',
        organizationId,
        priority: dto.priority ?? 'medium',
        dueDate: dto.dueDate,
      });
    }

    return this.findById(id, organizationId);
  }

  async findAll(organizationId: string, query: {
    status?: string; priority?: string; assigneeId?: string;
    projectId?: string; teamId?: string; search?: string;
    page?: number; pageSize?: number;
  }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const offset = (page - 1) * pageSize;
    const conditions = ['t.organization_id = $1'];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (query.status)     { conditions.push(`t.status = $${idx++}`);       values.push(query.status); }
    if (query.priority)   { conditions.push(`t.priority = $${idx++}`);     values.push(query.priority); }
    if (query.assigneeId) { conditions.push(`t.assignee_id = $${idx++}`);  values.push(query.assigneeId); }
    if (query.projectId)  { conditions.push(`t.project_id = $${idx++}`);   values.push(query.projectId); }
    if (query.teamId)     { conditions.push(`t.team_id = $${idx++}`);      values.push(query.teamId); }
    if (query.search)     { conditions.push(`t.title ILIKE $${idx++}`);    values.push(`%${query.search}%`); }

    const where = conditions.join(' AND ');
    const [countRes, dataRes] = await Promise.all([
      this.db.query<{ count: string }>(`SELECT COUNT(*) FROM tasks t WHERE ${where}`, values),
      this.db.query(
        `SELECT t.*, u.name as assignee_name, p.name as project_name
         FROM tasks t
         LEFT JOIN users u ON t.assignee_id = u.id
         LEFT JOIN projects p ON t.project_id = p.id
         WHERE ${where}
         ORDER BY
           CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           t.due_date ASC NULLS LAST, t.created_at DESC
         LIMIT ${pageSize} OFFSET ${offset}`,
        values,
      ),
    ]);

    return {
      data: dataRes.rows,
      total: parseInt(countRes.rows[0]?.count ?? '0', 10),
      page, pageSize,
      totalPages: Math.ceil(parseInt(countRes.rows[0]?.count ?? '0', 10) / pageSize),
    };
  }

  async findById(id: string, organizationId: string) {
    const res = await this.db.query(
      `SELECT t.*, u.name as assignee_name, p.name as project_name, cb.name as created_by_name
       FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN users cb ON t.created_by_id = cb.id
       WHERE t.id = $1 AND t.organization_id = $2`,
      [id, organizationId],
    );
    if (!res.rows[0]) throw new NotFoundException('Task not found');
    return res.rows[0];
  }

  async update(id: string, organizationId: string, dto: Partial<{
    title: string; description: string; status: string; priority: string;
    assigneeId: string; dueDate: string; tags: string[];
  }>) {
    // Capture old assignee before update for event comparison
    const existing = await this.findById(id, organizationId);
    const previousAssigneeId = existing?.assignee_id as string | null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.title !== undefined)       { updates.push(`title = $${idx++}`);       values.push(dto.title); }
    if (dto.description !== undefined) { updates.push(`description = $${idx++}`); values.push(dto.description); }
    if (dto.status !== undefined) {
      updates.push(`status = $${idx++}`); values.push(dto.status);
      if (dto.status === 'done') { updates.push(`completed_at = NOW()`); }
      else                       { updates.push(`completed_at = NULL`); }
    }
    if (dto.priority !== undefined)   { updates.push(`priority = $${idx++}`);    values.push(dto.priority); }
    if (dto.assigneeId !== undefined) { updates.push(`assignee_id = $${idx++}`); values.push(dto.assigneeId); }
    if (dto.dueDate !== undefined)    { updates.push(`due_date = $${idx++}`);    values.push(dto.dueDate); }
    if (dto.tags !== undefined)       { updates.push(`tags = $${idx++}`);        values.push(`{${dto.tags.join(',')}}`); }

    if (updates.length === 0) return existing;

    updates.push(`updated_at = NOW()`);
    values.push(id, organizationId);
    await this.db.query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx}`,
      values,
    );

    const updated = await this.findById(id, organizationId);

    // Emit task.assigned if assignee changed to a new person
    const newAssigneeId = dto.assigneeId;
    if (newAssigneeId && newAssigneeId !== previousAssigneeId) {
      const updaterId = existing?.created_by_id as string;
      const updater = await this.db.findOne<{ name: string }>('users', { id: updaterId });
      this.eventEmitter.emit('task.assigned', {
        taskId: id,
        taskTitle: updated.title as string,
        assigneeId: newAssigneeId,
        assignerName: updater?.name ?? 'A team member',
        organizationId,
        priority: (dto.priority ?? existing?.priority ?? 'medium') as string,
        dueDate: (dto.dueDate ?? existing?.due_date) as string | undefined,
      });
    }

    return updated;
  }

  async delete(id: string, organizationId: string) {
    await this.db.query('DELETE FROM tasks WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    return { deleted: true };
  }

  // ── Projects ─────────────────────────────────────────────────

  async createProject(organizationId: string, userId: string, dto: {
    name: string; description?: string; teamId?: string; startDate?: string; endDate?: string;
  }) {
    const id = uuidv4();
    await this.db.query(
      `INSERT INTO projects (id, name, description, organization_id, owner_id, team_id, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, dto.name, dto.description ?? null, organizationId, userId,
       dto.teamId ?? null, dto.startDate ?? null, dto.endDate ?? null],
    );
    return this.findProjectById(id, organizationId);
  }

  async findProjects(organizationId: string) {
    const res = await this.db.query(
      `SELECT p.*,
              COUNT(t.id) as task_count,
              COUNT(t.id) FILTER (WHERE t.status = 'done') as completed_task_count
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
       WHERE p.organization_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [organizationId],
    );
    return res.rows;
  }

  async findProjectById(id: string, organizationId: string) {
    const res = await this.db.query(
      `SELECT p.*, COUNT(t.id) as task_count,
              COUNT(t.id) FILTER (WHERE t.status = 'done') as completed_task_count
       FROM projects p
       LEFT JOIN tasks t ON t.project_id = p.id
       WHERE p.id = $1 AND p.organization_id = $2
       GROUP BY p.id`,
      [id, organizationId],
    );
    if (!res.rows[0]) throw new NotFoundException('Project not found');
    return res.rows[0];
  }
}
