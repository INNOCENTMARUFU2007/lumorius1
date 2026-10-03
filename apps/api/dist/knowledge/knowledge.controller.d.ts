import { KnowledgeService } from './knowledge.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
export declare class KnowledgeController {
    private readonly knowledgeService;
    constructor(knowledgeService: KnowledgeService);
    getGraph(user: JwtPayload, nodeId?: string, nodeType?: string, depth?: number, search?: string): Promise<{
        nodes: Record<string, unknown>[];
        relations: Record<string, unknown>[];
    }>;
    createNode(user: JwtPayload, body: Record<string, unknown>): Promise<Record<string, unknown>>;
    getNode(user: JwtPayload, id: string): Promise<Record<string, unknown>>;
    createRelation(user: JwtPayload, body: Record<string, unknown>): Promise<{
        fromNodeId: string;
        toNodeId: string;
        relationType: string;
        strength?: number;
        id: string;
    }>;
    search(user: JwtPayload, body: {
        query: string;
    }): Promise<Record<string, unknown>[]>;
    sync(user: JwtPayload): Promise<{
        synced: number;
    }>;
}
//# sourceMappingURL=knowledge.controller.d.ts.map