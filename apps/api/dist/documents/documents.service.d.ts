import { Queue } from 'bull';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { AiService } from '../ai/ai.service';
export declare class DocumentsService {
    private readonly db;
    private readonly storage;
    private readonly aiService;
    private readonly documentsQueue;
    private readonly logger;
    constructor(db: DatabaseService, storage: StorageService, aiService: AiService, documentsQueue: Queue);
    upload(file: Express.Multer.File, organizationId: string, userId: string, opts: {
        teamId?: string;
        tags?: string[];
    }): Promise<Record<string, unknown>>;
    findAll(organizationId: string, query: {
        search?: string;
        status?: string;
        type?: string;
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
    findById(docId: string, organizationId: string): Promise<Record<string, unknown>>;
    delete(docId: string, organizationId: string): Promise<{
        deleted: boolean;
    }>;
    search(organizationId: string, query: string, opts: {
        documentIds?: string[];
        topK?: number;
    }): Promise<Record<string, unknown>[]>;
    ask(organizationId: string, question: string, opts: {
        documentIds?: string[];
        teamId?: string;
    }): Promise<{
        answer: string;
        sources: {
            chunkId: unknown;
            documentId: unknown;
            documentName: unknown;
            content: string;
            score: unknown;
        }[];
        confidence: unknown;
    }>;
    getDownloadUrl(docId: string, organizationId: string): Promise<{
        url: string;
        expiresIn: number;
    }>;
}
//# sourceMappingURL=documents.service.d.ts.map