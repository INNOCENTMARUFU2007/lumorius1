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
        page?: number | string;
        pageSize?: number | string;
    }): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    getSearchFacets(organizationId: string): Promise<{
        types: Record<string, unknown>[];
        tags: Record<string, unknown>[];
        total: number;
    }>;
    findById(docId: string, organizationId: string): Promise<Record<string, unknown>>;
    delete(docId: string, organizationId: string): Promise<{
        deleted: boolean;
    }>;
    search(organizationId: string, query: string, opts?: {
        documentIds?: string[];
        topK?: number;
        type?: string;
        tag?: string;
        createdAfter?: string;
        teamId?: string;
        uploadedById?: string;
    }): Promise<Record<string, unknown>[]>;
    ask(organizationId: string, question: string, opts: {
        documentIds?: string[];
        teamId?: string;
        type?: string;
        tag?: string;
        createdAfter?: string;
        uploadedById?: string;
    }): Promise<{
        answer: string;
        sources: {
            chunkId: unknown;
            documentId: unknown;
            documentName: unknown;
            content: string;
            score: unknown;
            type: unknown;
            tags: unknown;
            createdAt: unknown;
            teamId: unknown;
        }[];
        confidence: unknown;
    }>;
    getDownloadUrl(docId: string, organizationId: string): Promise<{
        url: string;
        expiresIn: number;
    }>;
}
//# sourceMappingURL=documents.service.d.ts.map