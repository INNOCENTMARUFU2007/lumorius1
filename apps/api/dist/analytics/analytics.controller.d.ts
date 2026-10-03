import { AnalyticsService } from './analytics.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
export declare class AnalyticsController {
    private readonly analyticsService;
    constructor(analyticsService: AnalyticsService);
    getFounderDashboard(user: JwtPayload): Promise<{
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
    getTeamDashboard(user: JwtPayload): Promise<{
        members: Record<string, unknown>[];
        tasksByStatus: Record<string, unknown>[];
        meetingsByWeek: Record<string, unknown>[];
    }>;
    getKpis(user: JwtPayload): Promise<Record<string, unknown>[]>;
    createKpi(user: JwtPayload, body: Record<string, unknown>): Promise<Record<string, unknown>>;
    recordKpiValue(user: JwtPayload, id: string, body: {
        value: number;
        date?: string;
    }): Promise<{
        recorded: boolean;
        date: string;
        value: number;
    }>;
    getGoals(user: JwtPayload): Promise<Record<string, unknown>[]>;
    createGoal(user: JwtPayload, body: Record<string, unknown>): Promise<Record<string, unknown>>;
    generateWeeklyReport(user: JwtPayload): Promise<{
        content: string;
        generatedAt: string;
    }>;
}
//# sourceMappingURL=analytics.controller.d.ts.map