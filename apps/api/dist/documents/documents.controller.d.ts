import { DocumentsService } from './documents.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
export declare class DocumentsController {
    private readonly documentsService;
    constructor(documentsService: DocumentsService);
    upload(file: Express.Multer.File, user: JwtPayload, body: {
        teamId?: string;
        tags?: string;
    }): Promise<Record<string, unknown>>;
    findAll(user: JwtPayload, search?: string, status?: string, type?: string, teamId?: string, page?: number, pageSize?: number): Promise<{
        data: Record<string, unknown>[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
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
    }): Promise<Record<string, unknown>[]>;
    ask(user: JwtPayload, body: {
        question: string;
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
}
//# sourceMappingURL=documents.controller.d.ts.map