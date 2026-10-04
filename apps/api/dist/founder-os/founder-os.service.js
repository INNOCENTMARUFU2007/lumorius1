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
var FounderOsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FounderOsService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const database_service_1 = require("../database/database.service");
const ai_service_1 = require("../ai/ai.service");
let FounderOsService = FounderOsService_1 = class FounderOsService {
    constructor(db, aiService) {
        this.db = db;
        this.aiService = aiService;
        this.logger = new common_1.Logger(FounderOsService_1.name);
    }
    async getOkrs(organizationId, quarter, year) {
        const currentYear = year ?? new Date().getFullYear();
        const currentQ = quarter ??
            `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
        const res = await this.db.query(`SELECT o.*,
              u.name as owner_name,
              u.avatar_url as owner_avatar,
              COALESCE(
                json_agg(
                  kr.* ORDER BY kr.created_at ASC
                ) FILTER (WHERE kr.id IS NOT NULL),
                '[]'
              ) as key_results
       FROM objectives o
       LEFT JOIN users u ON o.owner_id = u.id
       LEFT JOIN key_results kr ON kr.objective_id = o.id
       WHERE o.organization_id = $1
         AND o.quarter = $2
         AND o.year = $3
       GROUP BY o.id, u.name, u.avatar_url
       ORDER BY o.created_at DESC`, [organizationId, currentQ, currentYear]);
        return {
            objectives: res.rows,
            quarter: currentQ,
            year: currentYear,
        };
    }
    async createObjective(organizationId, userId, dto) {
        const id = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO objectives
         (
           id,
           organization_id,
           owner_id,
           title,
           description,
           quarter,
           year,
           due_date
         )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [
            id,
            organizationId,
            dto.ownerId ?? userId,
            dto.title,
            dto.description ?? null,
            dto.quarter,
            dto.year,
            dto.dueDate ?? null,
        ]);
        return this.db.findOne('objectives', { id });
    }
    async updateObjective(organizationId, objectiveId, dto) {
        const sets = [];
        const params = [];
        let idx = 1;
        if (dto.title !== undefined) {
            sets.push(`title = $${idx++}`);
            params.push(dto.title);
        }
        if (dto.description !== undefined) {
            sets.push(`description = $${idx++}`);
            params.push(dto.description);
        }
        if (dto.status !== undefined) {
            sets.push(`status = $${idx++}`);
            params.push(dto.status);
        }
        if (dto.progress !== undefined) {
            sets.push(`progress = $${idx++}`);
            params.push(dto.progress);
        }
        sets.push('updated_at = NOW()');
        await this.db.query(`UPDATE objectives
       SET ${sets.join(', ')}
       WHERE id = $${idx++}
         AND organization_id = $${idx}`, [...params, objectiveId, organizationId]);
        return this.db.findOne('objectives', {
            id: objectiveId,
        });
    }
    async addKeyResult(objectiveId, dto) {
        const id = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO key_results
         (
           id,
           objective_id,
           title,
           metric_type,
           target_value,
           start_value,
           current_value,
           unit
         )
       VALUES ($1,$2,$3,$4,$5,$6,$6,$7)`, [
            id,
            objectiveId,
            dto.title,
            dto.metricType ?? 'percentage',
            dto.targetValue,
            dto.startValue ?? 0,
            dto.unit ?? null,
        ]);
        return this.db.findOne('key_results', { id });
    }
    async updateKeyResult(krId, currentValue) {
        await this.db.query(`UPDATE key_results
       SET current_value = $1,
           updated_at = NOW()
       WHERE id = $2`, [currentValue, krId]);
        return this.db.findOne('key_results', {
            id: krId,
        });
    }
    async recordKpiSnapshot(organizationId, metricKey, value, metadata) {
        const today = new Date()
            .toISOString()
            .split('T')[0];
        await this.db.query(`INSERT INTO kpi_snapshots
         (
           organization_id,
           snapshot_date,
           metric_key,
           metric_value,
           metadata
         )
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (
         organization_id,
         snapshot_date,
         metric_key
       )
       DO UPDATE SET
         metric_value = EXCLUDED.metric_value,
         metadata = EXCLUDED.metadata`, [
            organizationId,
            today,
            metricKey,
            value,
            JSON.stringify(metadata ?? {}),
        ]);
        return {
            recorded: true,
            date: today,
            metricKey,
            value,
        };
    }
    async getKpiTimeseries(organizationId, metricKey, days = 30) {
        const safeDays = Math.max(1, Math.floor(days));
        const res = await this.db.query(`SELECT
         snapshot_date,
         metric_value,
         metadata
       FROM kpi_snapshots
       WHERE organization_id = $1
         AND metric_key = $2
         AND snapshot_date >= NOW() - INTERVAL '${safeDays} days'
       ORDER BY snapshot_date ASC`, [organizationId, metricKey]);
        return res.rows;
    }
    async getAllKpiSnapshots(organizationId, days = 30) {
        const safeDays = Math.max(1, Math.floor(days));
        const res = await this.db.query(`SELECT
         metric_key,
         MAX(
           CASE
             WHEN snapshot_date = CURRENT_DATE
             THEN metric_value
           END
         ) as today,
         MAX(
           CASE
             WHEN snapshot_date = CURRENT_DATE - 1
             THEN metric_value
           END
         ) as yesterday,
         MAX(
           CASE
             WHEN snapshot_date = CURRENT_DATE - 7
             THEN metric_value
           END
         ) as last_week,
         MAX(
           CASE
             WHEN snapshot_date = CURRENT_DATE - 30
             THEN metric_value
           END
         ) as last_month,
         json_agg(
           json_build_object(
             'date',
             snapshot_date,
             'value',
             metric_value
           )
           ORDER BY snapshot_date ASC
         ) as series
       FROM kpi_snapshots
       WHERE organization_id = $1
         AND snapshot_date >= NOW() - INTERVAL '${safeDays} days'
       GROUP BY metric_key
       ORDER BY metric_key`, [organizationId]);
        return res.rows;
    }
    async computeHealthScore(organizationId) {
        const [taskStats, docStats, meetingStats, memberStats, kpis,] = await Promise.all([
            this.db.query(`SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (
             WHERE status = 'done'
           ) as completed,
           COUNT(*) FILTER (
             WHERE due_date < NOW()
             AND status != 'done'
           ) as overdue
         FROM tasks
         WHERE organization_id = $1`, [organizationId]),
            this.db.query(`SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (
             WHERE status = 'indexed'
           ) as indexed
         FROM documents
         WHERE organization_id = $1`, [organizationId]),
            this.db.query(`SELECT
           COUNT(*) as total_30d
         FROM meetings
         WHERE organization_id = $1
           AND created_at > NOW() - INTERVAL '30 days'`, [organizationId]),
            this.db.query(`SELECT
           COUNT(*) as active_users,
           COUNT(*) FILTER (
             WHERE last_login_at >
                   NOW() - INTERVAL '7 days'
           ) as wau
         FROM users
         WHERE organization_id = $1
           AND is_active = TRUE`, [organizationId]),
            this.db.query(`SELECT
           COUNT(*) as total,
           AVG(progress) as avg_progress
         FROM objectives
         WHERE organization_id = $1
           AND year = $2`, [
                organizationId,
                new Date().getFullYear(),
            ]),
        ]);
        const t = taskStats.rows[0] ??
            {};
        const d = docStats.rows[0] ??
            {};
        const m = meetingStats.rows[0] ??
            {};
        const mb = memberStats.rows[0] ??
            {};
        const k = kpis.rows[0] ??
            {};
        const completionRate = Number(t.total) > 0
            ? (Number(t.completed) / Number(t.total)) * 100
            : 50;
        const overdueRate = Number(t.total) > 0
            ? (Number(t.overdue) / Number(t.total)) * 100
            : 0;
        const docIndexRate = Number(d.total) > 0
            ? (Number(d.indexed) / Number(d.total)) * 100
            : 0;
        const wau = Number(mb.active_users) > 0
            ? (Number(mb.wau) / Number(mb.active_users)) * 100
            : 0;
        const meetings30d = Math.min(Number(m.total_30d), 20);
        const okrProgress = Number(k.avg_progress ?? 0);
        const productScore = Math.min(100, completionRate * 0.7 +
            Math.max(0, 100 - overdueRate) * 0.3);
        const teamScore = Math.min(100, wau * 0.6 +
            (meetings30d / 20) * 100 * 0.4);
        const growthScore = Math.min(100, okrProgress * 0.5 +
            docIndexRate * 0.5);
        const financialScore = 50;
        const overall = productScore * 0.3 +
            teamScore * 0.25 +
            growthScore * 0.25 +
            financialScore * 0.2;
        const healthScore = {
            overall: Math.round(overall),
            financial: Math.round(financialScore),
            growth: Math.round(growthScore),
            team: Math.round(teamScore),
            product: Math.round(productScore),
            breakdown: {
                taskCompletionRate: Math.round(completionRate),
                overdueTaskRate: Math.round(overdueRate),
                documentIndexRate: Math.round(docIndexRate),
                weeklyActiveUsers: Math.round(wau),
                meetings30d,
                okrProgress: Math.round(okrProgress),
            },
        };
        await this.db
            .query(`INSERT INTO health_scores
           (
             organization_id,
             overall_score,
             financial_score,
             growth_score,
             team_score,
             product_score,
             breakdown
           )
         VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
            organizationId,
            healthScore.overall,
            healthScore.financial,
            healthScore.growth,
            healthScore.team,
            healthScore.product,
            JSON.stringify(healthScore.breakdown),
        ])
            .catch(() => null);
        return healthScore;
    }
    async getHealthScoreHistory(organizationId, limit = 30) {
        const res = await this.db.query(`SELECT
         scored_at,
         overall_score,
         financial_score,
         growth_score,
         team_score,
         product_score
       FROM health_scores
       WHERE organization_id = $1
       ORDER BY scored_at DESC
       LIMIT $2`, [organizationId, limit]);
        return res.rows;
    }
    async getDashboard(organizationId, userId) {
        const currentQ = `Q${Math.ceil((new Date().getMonth() + 1) / 3)}`;
        const currentYear = new Date().getFullYear();
        const healthScore = await this.computeHealthScore(organizationId);
        const healthNumbers = {
            overall: Number(healthScore.overall ?? 0),
            financial: Number(healthScore.financial ?? 0),
            growth: Number(healthScore.growth ?? 0),
            team: Number(healthScore.team ?? 0),
            product: Number(healthScore.product ?? 0),
        };
        const [okrs, kpis, taskBreakdown, teamVelocity, aiInsights,] = await Promise.all([
            this.getOkrs(organizationId, currentQ, currentYear),
            this.getAllKpiSnapshots(organizationId, 30),
            this.db.query(`SELECT
           status,
           priority,
           COUNT(*) as count
         FROM tasks
         WHERE organization_id = $1
         GROUP BY status, priority`, [organizationId]),
            this.db.query(`SELECT
           DATE_TRUNC(
             'week',
             updated_at
           ) as week,
           COUNT(*) FILTER (
             WHERE status = 'done'
           ) as completed,
           COUNT(*) as total
         FROM tasks
         WHERE organization_id = $1
           AND updated_at >
               NOW() - INTERVAL '12 weeks'
         GROUP BY week
         ORDER BY week ASC`, [organizationId]),
            this.generateAiInsights(organizationId, healthNumbers),
        ]);
        return {
            quarter: currentQ,
            year: currentYear,
            healthScore,
            okrs,
            kpis,
            taskBreakdown: taskBreakdown.rows,
            teamVelocity: teamVelocity.rows,
            aiInsights,
            generatedAt: new Date().toISOString(),
        };
    }
    async generateAiInsights(organizationId, healthScore) {
        try {
            const prompt = `
You are a business strategy advisor.

Based on these health scores, provide 3 concise actionable insights.

Overall: ${healthScore.overall}/100
Financial: ${healthScore.financial}/100
Growth: ${healthScore.growth}/100
Team: ${healthScore.team}/100
Product: ${healthScore.product}/100

Format your response as JSON:

{
  "insights": [
    {
      "type": "strength|warning|opportunity",
      "title": "...",
      "description": "..."
    }
  ]
}
`;
            const result = await this.aiService.chat([
                {
                    role: 'user',
                    content: prompt,
                },
            ]);
            if (typeof result !== 'string') {
                return null;
            }
            try {
                const match = result.match(/\{[\s\S]*\}/);
                if (match) {
                    return JSON.parse(match[0]);
                }
            }
            catch {
                return null;
            }
            return null;
        }
        catch (error) {
            this.logger.warn(`AI insight generation failed for organization ${organizationId}`, error instanceof Error
                ? error.message
                : String(error));
            return null;
        }
    }
    async recordUsage(organizationId, userId, metric, quantity = 1, metadata) {
        await this.db.query(`INSERT INTO usage_records
         (
           organization_id,
           user_id,
           metric,
           quantity,
           metadata
         )
       VALUES ($1,$2,$3,$4,$5)`, [
            organizationId,
            userId,
            metric,
            quantity,
            JSON.stringify(metadata ?? {}),
        ]);
    }
    async getUsageSummary(organizationId, days = 30) {
        const safeDays = Math.max(1, Math.floor(days));
        const res = await this.db.query(`SELECT
         metric,
         SUM(quantity) as total,
         COUNT(*) as events
       FROM usage_records
       WHERE organization_id = $1
         AND created_at >
             NOW() - INTERVAL '${safeDays} days'
       GROUP BY metric
       ORDER BY total DESC`, [organizationId]);
        return res.rows;
    }
};
exports.FounderOsService = FounderOsService;
exports.FounderOsService = FounderOsService = FounderOsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        ai_service_1.AiService])
], FounderOsService);
//# sourceMappingURL=founder-os.service.js.map