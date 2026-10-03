import { WorkflowsService } from './workflows.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
export declare class WorkflowsController {
    private readonly workflowsService;
    constructor(workflowsService: WorkflowsService);
    create(user: JwtPayload, body: Record<string, unknown>): Promise<Record<string, unknown>>;
    findAll(user: JwtPayload): Promise<Record<string, unknown>[]>;
    findOne(user: JwtPayload, id: string): Promise<Record<string, unknown>>;
    toggle(user: JwtPayload, id: string): Promise<{
        id: string;
        isActive: boolean;
    }>;
    trigger(user: JwtPayload, id: string, body: Record<string, unknown>): Promise<{
        runId: string;
        status: string;
    }>;
    getRuns(user: JwtPayload, id: string): Promise<Record<string, unknown>[]>;
}
//# sourceMappingURL=workflows.controller.d.ts.map