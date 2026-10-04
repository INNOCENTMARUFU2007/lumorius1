import { DatabaseService } from '../database/database.service';
import { AiService } from '../ai/ai.service';
export declare class FounderOsService {
    private readonly db;
    private readonly aiService;
    private readonly logger;
    constructor(db: DatabaseService, aiService: AiService);
    getOkrs(organizationId: string, quarter?: string, year?: number): Promise<{
        objectives: Record<string, unknown>[];
        quarter: string;
        year: number;
    }>;
    createObjective(organizationId: string, userId: string, dto: {
        title: string;
        description?: string;
        quarter: string;
        year: number;
        dueDate?: string;
        ownerId?: string;
    }): Promise<Record<string, unknown>>;
    updateObjective(organizationId: string, objectiveId: string, dto: {
        title?: string;
        description?: string;
        status?: string;
        progress?: number;
    }): Promise<Record<string, unknown>>;
    addKeyResult(objectiveId: string, dto: {
        title: string;
        metricType?: string;
        targetValue: number;
        startValue?: number;
        unit?: string;
    }): Promise<Record<string, unknown>>;
    updateKeyResult(krId: string, currentValue: number): Promise<Record<string, unknown>>;
    recordKpiSnapshot(organizationId: string, metricKey: string, value: number, metadata?: Record<string, unknown>): Promise<{
        recorded: boolean;
        date: string;
        metricKey: string;
        value: number;
    }>;
    getKpiTimeseries(organizationId: string, metricKey: string, days?: number): Promise<Record<string, unknown>[]>;
    getAllKpiSnapshots(organizationId: string, days?: number): Promise<Record<string, unknown>[]>;
    computeHealthScore(organizationId: string): Promise<Record<string, unknown>>;
    getHealthScoreHistory(organizationId: string, limit?: number): Promise<Record<string, unknown>[]>;
    getDashboard(organizationId: string, userId: string): Promise<{
        quarter: string;
        year: number;
        healthScore: Record<string, unknown>;
        okrs: {
            objectives: Record<string, unknown>[];
            quarter: string;
            year: number;
        };
        kpis: Record<string, unknown>[];
        taskBreakdown: Record<string, unknown>[];
        teamVelocity: Record<string, unknown>[];
        aiInsights: any;
        generatedAt: string;
    }>;
    private generateAiInsights;
    recordUsage(organizationId: string, userId: string, metric: string, quantity?: number, metadata?: Record<string, unknown>): Promise<void>;
    getUsageSummary(organizationId: string, days?: number): Promise<Record<string, unknown>[]>;
}
//# sourceMappingURL=founder-os.service.d.ts.map