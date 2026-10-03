import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../database/database.service';
export declare class TasksService {
    private readonly db;
    private readonly eventEmitter;
    constructor(db: DatabaseService, eventEmitter: EventEmitter2);
    create(organizationId: string, userId: string, dto: {
        title: string;
        description?: string;
        priority?: string;
        assigneeId?: string;
        projectId?: string;
        teamId?: string;
        dueDate?: string;
        tags?: string[];
    }): Promise<Record<string, unknown>>;
    findAll(organizationId: string, query: {
        status?: string;
        priority?: string;
        assigneeId?: string;
        projectId?: string;
        teamId?: string;
        search?: string;
        page?: number;
        pageSize?: number;
    }): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    findById(id: string, organizationId: string): Promise<Record<string, unknown>>;
    update(id: string, organizationId: string, dto: Partial<{
        title: string;
        description: string;
        status: string;
        priority: string;
        assigneeId: string;
        dueDate: string;
        tags: string[];
    }>): Promise<Record<string, unknown>>;
    delete(id: string, organizationId: string): Promise<{
        deleted: boolean;
    }>;
    createProject(organizationId: string, userId: string, dto: {
        name: string;
        description?: string;
        teamId?: string;
        startDate?: string;
        endDate?: string;
    }): Promise<Record<string, unknown>>;
    findProjects(organizationId: string): Promise<Record<string, unknown>[]>;
    findProjectById(id: string, organizationId: string): Promise<Record<string, unknown>>;
}
//# sourceMappingURL=tasks.service.d.ts.map