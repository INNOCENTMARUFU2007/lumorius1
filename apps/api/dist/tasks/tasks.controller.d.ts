import { TasksService } from './tasks.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
export declare class TasksController {
    private readonly tasksService;
    constructor(tasksService: TasksService);
    createTask(user: JwtPayload, body: Record<string, unknown>): Promise<Record<string, unknown>>;
    findTasks(user: JwtPayload, query: Record<string, string>): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    findTask(user: JwtPayload, id: string): Promise<Record<string, unknown>>;
    updateTask(user: JwtPayload, id: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
    deleteTask(user: JwtPayload, id: string): Promise<{
        deleted: boolean;
    }>;
    findProjects(user: JwtPayload): Promise<Record<string, unknown>[]>;
    createProject(user: JwtPayload, body: Record<string, unknown>): Promise<Record<string, unknown>>;
    findProject(user: JwtPayload, id: string): Promise<Record<string, unknown>>;
}
//# sourceMappingURL=tasks.controller.d.ts.map