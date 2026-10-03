import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bull';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { EmbeddingService } from './embedding.service';
import { AiService } from '../ai/ai.service';
export declare class DocumentsProcessor {
    private readonly db;
    private readonly storage;
    private readonly embeddingService;
    private readonly aiService;
    private readonly eventEmitter;
    private readonly logger;
    constructor(db: DatabaseService, storage: StorageService, embeddingService: EmbeddingService, aiService: AiService, eventEmitter: EventEmitter2);
    processDocument(job: Job<{
        documentId: string;
        organizationId: string;
    }>): Promise<void>;
}
//# sourceMappingURL=documents.processor.d.ts.map