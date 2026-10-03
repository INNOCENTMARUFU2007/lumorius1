import { MeetingsService } from './meetings.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
export declare class MeetingsController {
    private readonly meetingsService;
    constructor(meetingsService: MeetingsService);
    upload(file: Express.Multer.File, user: JwtPayload, body: {
        title?: string;
        teamId?: string;
        scheduledAt?: string;
    }): Promise<Record<string, unknown>>;
    findAll(user: JwtPayload, search?: string, status?: string, teamId?: string, page?: number, pageSize?: number): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    findOne(user: JwtPayload, id: string): Promise<Record<string, unknown>>;
    getTranscript(user: JwtPayload, id: string): Promise<Record<string, unknown>>;
    getAnalysis(user: JwtPayload, id: string): Promise<Record<string, unknown>>;
    delete(user: JwtPayload, id: string): Promise<{
        deleted: boolean;
    }>;
}
//# sourceMappingURL=meetings.controller.d.ts.map