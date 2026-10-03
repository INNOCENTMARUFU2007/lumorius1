"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const database_service_1 = require("../database/database.service");
const ai_service_1 = require("../ai/ai.service");
let AnalyticsService = class AnalyticsService {
    constructor(db, aiService) {
        this.db = db;
        this.aiService = aiService;
    }
    async getFounderDashboard(organizationId, userId) {
        const [taskStats, docStats, meetingStats, kpiRes, goals] = await Promise.all([
            this.getTaskStats(organizationId),
            this.getDocumentStats(organizationId),
            this.getMeetingStats(organizationId),
            this.getKpiMetrics(organizationId),
            this.getGoals(organizationId),
        ]);
        const urgentTasks = await this.db.query(`SELECT id, title, priority, due_date, assignee_id
       FROM tasks WHERE organization_id = $1 AND status != 'done'
         AND (priority = 'urgent' OR (due_date IS NOT NULL AND due_date < NOW() + INTERVAL '3 days'))
       ORDER BY priority DESC, due_date ASC LIMIT 5`, [organizationId]);
        const context = { taskStats, docStats, meetingStats, urgentTasks: urgentTasks.rows };
        const risksAndOpportunities = await this.aiService.detectRisksAndOpportunities(context);
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
    async getTaskStats(organizationId) {
        const res = await this.db.query(`SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'done') as completed,
         COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
         COUNT(*) FILTER (WHERE status = 'todo') as todo,
         COUNT(*) FILTER (WHERE priority = 'urgent' AND status != 'done') as urgent_open,
         COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'done') as overdue
       FROM tasks WHERE organization_id = $1`, [organizationId]);
        return res.rows[0];
    }
    async getDocumentStats(organizationId) {
        const res = await this.db.query(`SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'indexed') as indexed,
         COUNT(*) FILTER (WHERE status = 'processing') as processing,
         SUM(size_bytes) as total_size_bytes,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as uploaded_this_week
       FROM documents WHERE organization_id = $1`, [organizationId]);
        return res.rows[0];
    }
    async getMeetingStats(organizationId) {
        const res = await this.db.query(`SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as last_30_days,
         AVG(duration_seconds) FILTER (WHERE status = 'completed') as avg_duration_seconds
       FROM meetings WHERE organization_id = $1`, [organizationId]);
        return res.rows[0];
    }
    async getKpiMetrics(organizationId) {
        const metrics = await this.db.query(`SELECT km.*,
              (SELECT value FROM kpi_values kv WHERE kv.metric_id = km.id ORDER BY recorded_at DESC LIMIT 1) as current_value,
              (SELECT value FROM kpi_values kv WHERE kv.metric_id = km.id ORDER BY recorded_at DESC OFFSET 1 LIMIT 1) as previous_value,
              (SELECT jsonb_agg(json_build_object('date', recorded_at, 'value', value) ORDER BY recorded_at DESC)
               FROM (SELECT recorded_at, value FROM kpi_values kv WHERE kv.metric_id = km.id ORDER BY recorded_at DESC LIMIT 30) sub) as history
       FROM kpi_metrics km WHERE km.organization_id = $1`, [organizationId]);
        return metrics.rows;
    }
    async getGoals(organizationId) {
        const res = await this.db.query(`SELECT g.*, u.name as owner_name FROM goals g
       LEFT JOIN users u ON g.owner_id = u.id
       WHERE g.organization_id = $1 AND g.status = 'active'
       ORDER BY g.due_date ASC NULLS LAST`, [organizationId]);
        return res.rows;
    }
    async createKpiMetric(organizationId, userId, dto) {
        const id = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO kpi_metrics (id, name, description, unit, target, organization_id, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, dto.name, dto.description ?? null, dto.unit ?? null, dto.target ?? null, organizationId, userId]);
        return this.db.findOne('kpi_metrics', { id });
    }
    async recordKpiValue(metricId, organizationId, value, date) {
        const recordDate = date ?? new Date().toISOString().split('T')[0];
        await this.db.query(`INSERT INTO kpi_values (id, metric_id, value, recorded_at)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (metric_id, recorded_at) DO UPDATE SET value = EXCLUDED.value`, [metricId, value, recordDate]);
        return { recorded: true, date: recordDate, value };
    }
    async createGoal(organizationId, userId, dto) {
        const id = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO goals (id, title, description, target_value, unit, due_date, organization_id, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, dto.title, dto.description ?? null, dto.targetValue ?? null,
            dto.unit ?? null, dto.dueDate ?? null, organizationId, userId]);
        return this.db.findOne('goals', { id });
    }
    async getTeamDashboard(organizationId) {
        const [members, tasks, meetings] = await Promise.all([
            this.db.query(`SELECT u.id, u.name, u.role, u.avatar_url,
                COUNT(t.id) FILTER (WHERE t.status != 'done') as open_tasks,
                COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.updated_at > NOW() - INTERVAL '7 days') as tasks_completed_this_week
         FROM users u
         LEFT JOIN tasks t ON t.assignee_id = u.id AND t.organization_id = $1
         WHERE u.organization_id = $1 AND u.is_active = TRUE
         GROUP BY u.id ORDER BY u.name`, [organizationId]),
            this.db.query(`SELECT status, COUNT(*) as count FROM tasks WHERE organization_id = $1 GROUP BY status`, [organizationId]),
            this.db.query(`SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
         FROM meetings WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '90 days'
         GROUP BY week ORDER BY week`, [organizationId]),
        ]);
        return {
            members: members.rows,
            tasksByStatus: tasks.rows,
            meetingsByWeek: meetings.rows,
        };
    }
    async generateWeeklyReport(organizationId, userId) {
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
        const report = await this.aiService.generateWeeklyReport(organizationId, reportData);
        return report;
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        ai_service_1.AiService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map