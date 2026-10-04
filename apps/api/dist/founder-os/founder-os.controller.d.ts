import { FounderOsService } from './founder-os.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
declare class CreateObjectiveDto {
    title: string;
    description?: string;
    quarter: string;
    year: number;
    dueDate?: string;
    ownerId?: string;
}
declare class UpdateObjectiveDto {
    title?: string;
    description?: string;
    status?: string;
    progress?: number;
}
declare class AddKeyResultDto {
    title: string;
    metricType?: string;
    targetValue: number;
    startValue?: number;
    unit?: string;
}
declare class UpdateKeyResultDto {
    currentValue: number;
}
declare class RecordKpiDto {
    metricKey: string;
    value: number;
}
export declare class FounderOsController {
    private readonly founderOsService;
    constructor(founderOsService: FounderOsService);
    dashboard(user: JwtPayload): Promise<{
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
    healthScore(user: JwtPayload): Promise<Record<string, unknown>>;
    healthScoreHistory(user: JwtPayload, limit?: number): Promise<Record<string, unknown>[]>;
    getOkrs(user: JwtPayload, quarter?: string, year?: number): Promise<{
        objectives: Record<string, unknown>[];
        quarter: string;
        year: number;
    }>;
    createObjective(user: JwtPayload, dto: CreateObjectiveDto): Promise<Record<string, unknown>>;
    updateObjective(user: JwtPayload, id: string, dto: UpdateObjectiveDto): Promise<Record<string, unknown>>;
    addKeyResult(objectiveId: string, dto: AddKeyResultDto): Promise<Record<string, unknown>>;
    updateKeyResult(krId: string, dto: UpdateKeyResultDto): Promise<Record<string, unknown>>;
    kpis(user: JwtPayload, days?: number): Promise<Record<string, unknown>[]>;
    kpiTimeseries(user: JwtPayload, key: string, days?: number): Promise<Record<string, unknown>[]>;
    recordKpi(user: JwtPayload, dto: RecordKpiDto): Promise<{
        recorded: boolean;
        date: string;
        metricKey: string;
        value: number;
    }>;
    usage(user: JwtPayload, days?: number): Promise<Record<string, unknown>[]>;
}
export {};
//# sourceMappingURL=founder-os.controller.d.ts.map