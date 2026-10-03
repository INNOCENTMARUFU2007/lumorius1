import { Queue } from 'bull';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
export declare class MeetingsService {
    private readonly db;
    private readonly storage;
    private readonly meetingsQueue;
    private readonly logger;
    constructor(db: DatabaseService, storage: StorageService, meetingsQueue: Queue);
    upload(file: Express.Multer.File, organizationId: string, userId: string, opts: {
        title?: string;
        teamId?: string;
        scheduledAt?: string;
    }): Promise<Record<string, unknown>>;
    findAll(organizationId: string, query: {
        search?: string;
        status?: string;
        teamId?: string;
        page?: number;
        pageSize?: number;
    }): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    findById(meetingId: string, organizationId: string): Promise<Record<string, unknown>>;
    getTranscript(meetingId: string, organizationId: string): Promise<Record<string, unknown>>;
    getAnalysis(meetingId: string, organizationId: string): Promise<Record<string, unknown>>;
    delete(meetingId: string, organizationId: string): Promise<{
        deleted: boolean;
    }>;
}
//# sourceMappingURL=meetings.service.d.ts.map