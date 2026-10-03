import { DatabaseService } from '../database/database.service';
import { AiService } from '../ai/ai.service';
export declare class AnalyticsService {
    private readonly db;
    private readonly aiService;
    constructor(db: DatabaseService, aiService: AiService);
    getFounderDashboard(organizationId: string, userId: string): Promise<{
        summary: {
            tasks: Record<string, unknown>;
            documents: Record<string, unknown>;
            meetings: Record<string, unknown>;
        };
        kpis: Record<string, unknown>[];
        goals: Record<string, unknown>[];
        urgentTasks: Record<string, unknown>[];
        risks: any;
        opportunities: any;
        generatedAt: string;
    }>;
    getTaskStats(organizationId: string): Promise<Record<string, unknown>>;
    getDocumentStats(organizationId: string): Promise<Record<string, unknown>>;
    getMeetingStats(organizationId: string): Promise<Record<string, unknown>>;
    getKpiMetrics(organizationId: string): Promise<Record<string, unknown>[]>;
    getGoals(organizationId: string): Promise<Record<string, unknown>[]>;
    createKpiMetric(organizationId: string, userId: string, dto: {
        name: string;
        description?: string;
        unit?: string;
        target?: number;
    }): Promise<Record<string, unknown>>;
    recordKpiValue(metricId: string, organizationId: string, value: number, date?: string): Promise<{
        recorded: boolean;
        date: string;
        value: number;
    }>;
    createGoal(organizationId: string, userId: string, dto: {
        title: string;
        description?: string;
        targetValue?: number;
        unit?: string;
        dueDate?: string;
    }): Promise<Record<string, unknown>>;
    getTeamDashboard(organizationId: string): Promise<{
        members: Record<string, unknown>[];
        tasksByStatus: Record<string, unknown>[];
        meetingsByWeek: Record<string, unknown>[];
    }>;
    generateWeeklyReport(organizationId: string, userId: string): Promise<{
        content: string;
        generatedAt: string;
    }>;
}
//# sourceMappingURL=analytics.service.d.ts.map