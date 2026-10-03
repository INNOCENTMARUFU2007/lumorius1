import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bull';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { AiService } from '../ai/ai.service';
import { ConfigService } from '@nestjs/config';
export declare class MeetingsProcessor {
    private readonly db;
    private readonly storage;
    private readonly aiService;
    private readonly configService;
    private readonly eventEmitter;
    private readonly logger;
    private openai;
    constructor(db: DatabaseService, storage: StorageService, aiService: AiService, configService: ConfigService, eventEmitter: EventEmitter2);
    transcribeMeeting(job: Job<{
        meetingId: string;
        organizationId: string;
    }>): Promise<void>;
    private analyzeTranscript;
}
//# sourceMappingURL=meetings.processor.d.ts.map