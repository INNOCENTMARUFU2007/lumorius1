import { DocumentsService } from './documents.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
export declare class DocumentsController {
    private readonly documentsService;
    constructor(documentsService: DocumentsService);
    upload(file: Express.Multer.File, user: JwtPayload, body: {
        teamId?: string;
        tags?: string;
    }): Promise<Record<string, unknown>>;
    findAll(user: JwtPayload, search?: string, status?: string, type?: string, teamId?: string, page?: string, pageSize?: string): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    getSearchFacets(user: JwtPayload): Promise<{
        types: Record<string, unknown>[];
        tags: Record<string, unknown>[];
        total: number;
    }>;
    findOne(user: JwtPayload, id: string): Promise<Record<string, unknown>>;
    getDownloadUrl(user: JwtPayload, id: string): Promise<{
        url: string;
        expiresIn: number;
    }>;
    delete(user: JwtPayload, id: string): Promise<{
        deleted: boolean;
    }>;
    search(user: JwtPayload, body: {
        query: string;
        documentIds?: string[];
        topK?: number;
        type?: string;
        tag?: string;
        createdAfter?: string;
        teamId?: string;
        myHistory?: boolean;
    }): Promise<Record<string, unknown>[]>;
    ask(user: JwtPayload, body: {
        question: string;
        documentIds?: string[];
        teamId?: string;
        type?: string;
        tag?: string;
        createdAfter?: string;
        myHistory?: boolean;
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
}
//# sourceMappingURL=documents.controller.d.ts.map