
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../database/database.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly aiService: AiService,
  ) {}

  async getMyAiUsage(organizationId: string, userId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const { rows: [usage] } = await this.db.query<{ operations: string; tokens: string }>(
      `SELECT COUNT(*)::bigint AS operations,
              COALESCE(SUM(total_tokens), 0)::bigint AS tokens
       FROM ai_usage
       WHERE organization_id = $1
         AND user_id = $2
         AND created_at >= $3
         AND created_at <= $4`,
      [organizationId, userId, monthStart, now],
    );

    return usage;
  }

  async getFounderDashboard(
    organizationId: string,
    userId: string,
    days = 30,
    includeAiInsights = true,
  ) {
    const rangeDays = [7, 30, 90].includes(days) ? days : 30;

    const [taskStats, docStats, meetingStats, kpiRes, goals] =
      await Promise.all([
        this.getTaskStats(organizationId, rangeDays),
        this.getDocumentStats(organizationId),
        this.getMeetingStats(organizationId, userId),
        this.getKpiMetrics(organizationId),
        this.getGoals(organizationId),
      ]);

    const urgentTasks = await this.db.query(
      `SELECT id, title, priority, due_date, assignee_id
       FROM tasks
       WHERE organization_id = $1
         AND status NOT IN ('done', 'cancelled')
         AND (
           priority = 'urgent'
           OR (
             due_date IS NOT NULL
             AND due_date < NOW() + INTERVAL '3 days'
           )
         )
       ORDER BY priority DESC, due_date ASC
       LIMIT 5`,
      [organizationId],
    );

    const risksAndOpportunities = includeAiInsights
      ? await this.aiService.detectRisksAndOpportunities({
          taskStats,
          docStats,
          meetingStats,
          urgentTasks: urgentTasks.rows,
        }, {
          organizationId,
          userId,
          feature: 'risk_analysis',
        })
      : { risks: [], opportunities: [] };

    return {
      summary: {
        tasks: taskStats,
        documents: docStats,
        meetings: meetingStats,
      },
      kpis: kpiRes,
      goals,
      urgentTasks: urgentTasks.rows,
      risks: risksAndOpportunities.risks ?? [],
      opportunities: risksAndOpportunities.opportunities ?? [],
      generatedAt: new Date().toISOString(),
    };
  }

  async getTaskStats(organizationId: string, days = 30) {
    const rangeDays = [7, 30, 90].includes(days) ? days : 30;

    const [summary, trend] = await Promise.all([
      this.db.query(
        `WITH bounds AS (
           SELECT
             date_trunc('day', NOW())
               - (($2::int - 1) * INTERVAL '1 day') AS current_start,
             date_trunc('day', NOW())
               + INTERVAL '1 day' AS current_end
         )
         SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (
             WHERE t.status = 'done'
           )::int AS completed,
           COUNT(*) FILTER (
             WHERE t.status = 'in_progress'
           )::int AS in_progress,
           COUNT(*) FILTER (
             WHERE t.status = 'todo'
           )::int AS todo,
           COUNT(*) FILTER (
             WHERE t.priority = 'urgent'
               AND t.status NOT IN ('done', 'cancelled')
           )::int AS urgent_open,
           COUNT(*) FILTER (
             WHERE t.due_date < NOW()
               AND t.status NOT IN ('done', 'cancelled')
           )::int AS overdue,
           COUNT(*) FILTER (
             WHERE t.status = 'done'
               AND t.completed_at >= bounds.current_start
               AND t.completed_at < bounds.current_end
           )::int AS completed_period,
           COUNT(*) FILTER (
             WHERE t.status = 'done'
               AND t.completed_at >=
                   bounds.current_start - ($2::int * INTERVAL '1 day')
               AND t.completed_at < bounds.current_start
           )::int AS completed_previous_period
         FROM tasks t
         CROSS JOIN bounds
         WHERE t.organization_id = $1`,
        [organizationId, rangeDays],
      ),
      this.db.query(
        `SELECT
           TO_CHAR(period.day, 'YYYY-MM-DD') AS date,
           COUNT(t.id)::int AS value
         FROM generate_series(
           date_trunc('day', NOW())
             - (($2::int - 1) * INTERVAL '1 day'),
           date_trunc('day', NOW()),
           INTERVAL '1 day'
         ) AS period(day)
         LEFT JOIN tasks t
           ON t.organization_id = $1
          AND t.status = 'done'
          AND t.completed_at >= period.day
          AND t.completed_at < period.day + INTERVAL '1 day'
         GROUP BY period.day
         ORDER BY period.day`,
        [organizationId, rangeDays],
      ),
    ]);

    const stats = summary.rows[0] ?? {
      total: 0,
      completed: 0,
      in_progress: 0,
      todo: 0,
      urgent_open: 0,
      overdue: 0,
      completed_period: 0,
      completed_previous_period: 0,
    };

    return {
      ...stats,
      completion_trend: trend.rows,
    };
  }

  async getDocumentStats(organizationId: string) {
    const res = await this.db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (
           WHERE status = 'indexed'
         )::int AS indexed,
         COUNT(*) FILTER (
           WHERE status = 'processing'
         )::int AS processing,
         COUNT(*) FILTER (
           WHERE status = 'failed'
         )::int AS failed,
         COUNT(*) FILTER (
           WHERE status = 'uploading'
         )::int AS uploading,
         COALESCE(SUM(size_bytes), 0)::bigint AS total_size_bytes,
         COUNT(*) FILTER (
           WHERE created_at > NOW() - INTERVAL '7 days'
         )::int AS uploaded_this_week
       FROM documents
       WHERE organization_id = $1`,
      [organizationId],
    );

    return res.rows[0] ?? {
      total: 0,
      indexed: 0,
      processing: 0,
      failed: 0,
      uploading: 0,
      total_size_bytes: 0,
      uploaded_this_week: 0,
    };
  }

  async getMeetingStats(organizationId: string, userId: string) {
    const res = await this.db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (
           WHERE m.status = 'completed'
         )::int AS completed,
         COUNT(*) FILTER (
           WHERE m.created_at > NOW() - INTERVAL '30 days'
         )::int AS last_30_days,
         COUNT(*) FILTER (
           WHERE date_trunc(
             'month',
             m.created_at AT TIME ZONE viewer.timezone
           ) = date_trunc(
             'month',
             NOW() AT TIME ZONE viewer.timezone
           )
         )::int AS this_month,
         AVG(m.duration_seconds) FILTER (
           WHERE m.status = 'completed'
         ) AS avg_duration_seconds
       FROM meetings m
       CROSS JOIN (
         SELECT COALESCE(NULLIF(timezone, ''), 'UTC') AS timezone
         FROM users
         WHERE id = $2
           AND organization_id = $1
       ) viewer
       WHERE m.organization_id = $1`,
      [organizationId, userId],
    );

    return res.rows[0] ?? {
      total: 0,
      completed: 0,
      last_30_days: 0,
      this_month: 0,
      avg_duration_seconds: null,
    };
  }

  async getKpiMetrics(organizationId: string) {
    const metrics = await this.db.query(
      `SELECT
         km.*,
         (
           SELECT value
           FROM kpi_values kv
           WHERE kv.metric_id = km.id
           ORDER BY recorded_at DESC
           LIMIT 1
         ) AS current_value,
         (
           SELECT value
           FROM kpi_values kv
           WHERE kv.metric_id = km.id
           ORDER BY recorded_at DESC
           OFFSET 1
           LIMIT 1
         ) AS previous_value,
         (
           SELECT jsonb_agg(
             json_build_object(
               'date', recorded_at,
               'value', value
             )
             ORDER BY recorded_at DESC
           )
           FROM (
             SELECT recorded_at, value
             FROM kpi_values kv
             WHERE kv.metric_id = km.id
             ORDER BY recorded_at DESC
             LIMIT 30
           ) sub
         ) AS history
       FROM kpi_metrics km
       WHERE km.organization_id = $1`,
      [organizationId],
    );

    return metrics.rows;
  }

  async getGoals(organizationId: string) {
    const res = await this.db.query(
      `SELECT g.*, u.name AS owner_name
       FROM goals g
       LEFT JOIN users u ON g.owner_id = u.id
       WHERE g.organization_id = $1
         AND g.status = 'active'
       ORDER BY g.due_date ASC NULLS LAST`,
      [organizationId],
    );

    return res.rows;
  }

  async createKpiMetric(
    organizationId: string,
    userId: string,
    dto: {
      name: string;
      description?: string;
      unit?: string;
      target?: number;
    },
  ) {
    const name = typeof dto?.name === 'string' ? dto.name.trim() : '';
    if (!name || name.length > 120) throw new BadRequestException('Give the KPI a name of up to 120 characters.');
    const unit = typeof dto.unit === 'string' && dto.unit.trim() ? dto.unit.trim().slice(0, 24) : null;
    const description = typeof dto.description === 'string' && dto.description.trim() ? dto.description.trim().slice(0, 500) : null;
    const rawTarget = dto.target as unknown;
    const target = rawTarget === undefined || rawTarget === null || rawTarget === '' ? null : Number(rawTarget);
    if (target !== null && (!Number.isFinite(target) || Math.abs(target) >= 1e11)) throw new BadRequestException('The target must be a number.');
    const id = uuidv4();

    await this.db.query(
      `INSERT INTO kpi_metrics (
         id, name, description, unit, target, organization_id, created_by_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        name,
        description,
        unit,
        target,
        organizationId,
        userId,
      ],
    );

    return this.db.findOne('kpi_metrics', { id });
  }

  async recordKpiValue(
    metricId: string,
    organizationId: string,
    value: number,
    date?: string,
  ) {
    // Verify ownership so a caller cannot record a value against
    // another organisation's KPI.
    const metric = await this.db.query(
      `SELECT id
       FROM kpi_metrics
       WHERE id = $1 AND organization_id = $2`,
      [metricId, organizationId],
    );

    if (metric.rows.length === 0) {
      throw new NotFoundException('KPI not found in this workspace.');
    }

    const amount = Number(value);
    if (!Number.isFinite(amount) || Math.abs(amount) >= 1e11) throw new BadRequestException('Enter the KPI value as a number.');
    const today = new Date().toISOString().split('T')[0];
    const recordDate = date ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate) || Number.isNaN(Date.parse(recordDate + 'T00:00:00Z')) || recordDate > today) {
      throw new BadRequestException('Use a valid date that is today or earlier.');
    }

    await this.db.query(
      `INSERT INTO kpi_values (id, metric_id, value, recorded_at)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (metric_id, recorded_at)
       DO UPDATE SET value = EXCLUDED.value`,
      [metricId, amount, recordDate],
    );

    return {
      recorded: true,
      date: recordDate,
      value: amount,
    };
  }

  async createGoal(
    organizationId: string,
    userId: string,
    dto: {
      title: string;
      description?: string;
      targetValue?: number;
      unit?: string;
      dueDate?: string;
    },
  ) {
    const id = uuidv4();

    await this.db.query(
      `INSERT INTO goals (
         id, title, description, target_value, unit,
         due_date, organization_id, owner_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        dto.title,
        dto.description ?? null,
        dto.targetValue ?? null,
        dto.unit ?? null,
        dto.dueDate ?? null,
        organizationId,
        userId,
      ],
    );

    return this.db.findOne('goals', { id });
  }

  async getTeamDashboard(organizationId: string) {
    const [members, tasks, meetings, unallocated] = await Promise.all([
      this.db.query(
        `SELECT
           u.id,
           u.name,
           u.role,
           u.avatar_url,
           COUNT(t.id) FILTER (
             WHERE t.status NOT IN ('done', 'cancelled')
           )::int AS open_tasks,
           COUNT(t.id) FILTER (
             WHERE t.status = 'done'
               AND t.completed_at >= NOW() - INTERVAL '7 days'
               AND t.completed_at <= NOW()
           )::int AS tasks_completed_this_week
         FROM users u
         LEFT JOIN tasks t
           ON t.assignee_id = u.id
          AND t.organization_id = $1
         WHERE u.organization_id = $1
           AND u.is_active = TRUE
         GROUP BY u.id
         ORDER BY u.name`,
        [organizationId],
      ),
      this.db.query(
        `SELECT status, COUNT(*)::int AS count
         FROM tasks
         WHERE organization_id = $1
         GROUP BY status`,
        [organizationId],
      ),
      this.db.query(
        `SELECT
           DATE_TRUNC('week', created_at) AS week,
           COUNT(*)::int AS count
         FROM meetings
         WHERE organization_id = $1
           AND created_at > NOW() - INTERVAL '90 days'
         GROUP BY week
         ORDER BY week`,
        [organizationId],
      ),
      this.db.query<{
        assignee_group: 'unassigned' | 'inactive';
        open_tasks: number;
        tasks_completed_this_week: number;
      }>(
        `SELECT CASE WHEN t.assignee_id IS NULL THEN 'unassigned' ELSE 'inactive' END AS assignee_group,
                COUNT(*) FILTER (WHERE t.status NOT IN ('done', 'cancelled'))::int AS open_tasks,
                COUNT(*) FILTER (
                  WHERE t.status = 'done'
                    AND t.completed_at >= NOW() - INTERVAL '7 days'
                    AND t.completed_at <= NOW()
                )::int AS tasks_completed_this_week
           FROM tasks t
           LEFT JOIN users assignee
             ON assignee.id = t.assignee_id
            AND assignee.organization_id = t.organization_id
            AND assignee.is_active = TRUE
          WHERE t.organization_id = $1
            AND assignee.id IS NULL
            AND (t.status NOT IN ('done', 'cancelled')
                 OR (t.status = 'done' AND t.completed_at BETWEEN NOW() - INTERVAL '7 days' AND NOW()))
          GROUP BY 1`,
        [organizationId],
      ),
    ]);

    return {
      members: members.rows,
      tasksByStatus: tasks.rows,
      meetingsByWeek: meetings.rows,
      unallocatedWork: unallocated.rows,
    };
  }

  async generateWeeklyReport(organizationId: string, userId: string) {
    const [founder, team] = await Promise.all([
      this.getFounderDashboard(organizationId, userId),
      this.getTeamDashboard(organizationId),
    ]);

    const reportData = {
      period: `Week of ${new Date().toLocaleDateString()}`,
      tasks: founder.summary.tasks,
      documents: founder.summary.documents,
      meetings: founder.summary.meetings,
      goals: founder.goals,
      kpis: founder.kpis,
      risks: founder.risks,
      opportunities: founder.opportunities,
      teamSize: team.members.length,
    };

    return this.aiService.generateWeeklyReport(reportData, {
      organizationId,
      userId,
      feature: 'weekly_report',
    });
  }
}
