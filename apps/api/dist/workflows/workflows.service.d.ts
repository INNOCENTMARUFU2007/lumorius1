import { Queue } from 'bull';
import { DatabaseService } from '../database/database.service';
export declare class WorkflowsService {
    private readonly db;
    private readonly workflowsQueue;
    constructor(db: DatabaseService, workflowsQueue: Queue);
    create(organizationId: string, userId: string, dto: {
        name: string;
        description?: string;
        triggerType: string;
        triggerConfig: Record<string, unknown>;
        steps: Record<string, unknown>[];
    }): Promise<Record<string, unknown>>;
    findAll(organizationId: string): Promise<Record<string, unknown>[]>;
    findById(id: string, organizationId: string): Promise<Record<string, unknown>>;
    toggle(id: string, organizationId: string): Promise<{
        id: string;
        isActive: boolean;
    }>;
    trigger(id: string, organizationId: string, triggerData: Record<string, unknown>): Promise<{
        runId: string;
        status: string;
    }>;
    getRuns(workflowId: string, organizationId: string): Promise<Record<string, unknown>[]>;
}
//# sourceMappingURL=workflows.service.d.ts.map