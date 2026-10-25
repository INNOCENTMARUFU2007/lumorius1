import { DatabaseService } from '../database/database.service';
import { AiService } from '../ai/ai.service';
export declare class KnowledgeService {
    private readonly db;
    private readonly aiService;
    constructor(db: DatabaseService, aiService: AiService);
    createNode(organizationId: string, dto: {
        name: string;
        type: string;
        description?: string;
        properties?: Record<string, unknown>;
        sourceType?: string;
        sourceId?: string;
    }): Promise<Record<string, unknown>>;
    findNodeById(id: string, organizationId: string): Promise<Record<string, unknown>>;
    createRelation(organizationId: string, dto: {
        fromNodeId: string;
        toNodeId: string;
        relationType: string;
        strength?: number;
    }): Promise<{
        id: string;
        fromNodeId: string;
        toNodeId: string;
        relationType: string;
        strength: number;
    }>;
    getGraph(organizationId: string, query: {
        nodeId?: string;
        nodeType?: string;
        depth?: number;
        search?: string;
    }): Promise<{
        nodes: Record<string, unknown>[];
        relations: Record<string, unknown>[];
    }>;
    semanticSearch(organizationId: string, query: string): Promise<Record<string, unknown>[]>;
    syncFromDocuments(organizationId: string): Promise<{
        synced: number;
    }>;
}
//# sourceMappingURL=knowledge.service.d.ts.map