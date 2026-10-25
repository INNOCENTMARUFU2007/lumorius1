import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
interface UsageContext {
    organizationId?: string;
    userId?: string;
    feature?: string;
}
interface ChatOptions extends UsageContext {
    provider?: string;
    model?: string;
    temperature?: number;
}
interface SimilarChunk {
    id?: string;
    chunk_id?: string;
    content: string;
    document_id?: string;
    document_name?: string;
    document?: {
        name: string;
    };
    similarity: number;
    score?: number;
    [key: string]: unknown;
}
export declare class AiService {
    private readonly configService;
    private readonly db;
    private readonly logger;
    private openai;
    private anthropic;
    constructor(configService: ConfigService, db: DatabaseService);
    chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
    private recordUsage;
    createEmbedding(text: string, usageContext?: UsageContext): Promise<number[]>;
    createEmbeddings(texts: string[], usageContext?: UsageContext): Promise<number[][]>;
    searchSimilarChunks(input: {
        query: string;
        orgId?: string;
        organizationId?: string;
        userId?: string;
        limit?: number;
        embedding?: number[];
    }): Promise<SimilarChunk[]>;
    answerQuestion(input: {
        question: string;
        userId: string;
        orgId?: string;
        organizationId?: string;
        limit?: number;
    }): Promise<{
        answer: string;
        sources: Array<{
            id?: string;
            documentId?: string;
            documentName: string;
            similarity: number;
        }>;
    }>;
    strategyAdvisor(organizationId: string, question: string, context: Record<string, unknown>): Promise<{
        analysis: string;
        model: string;
    }>;
    generateWeeklyReport(data: Record<string, unknown>, usageContext?: UsageContext): Promise<{
        content: string;
        generatedAt: string;
    }>;
    detectRisksAndOpportunities(data: Record<string, unknown>, usageContext?: UsageContext): Promise<any>;
    sendMessage(userId: string, organizationId: string, message: string, conversationId?: string, context?: Record<string, unknown>): Promise<{
        conversationId: string;
        response: string;
        role: string;
    }>;
    getConversations(userId: string, organizationId: string): Promise<Record<string, unknown>[]>;
    getConversationMessages(conversationId: string, userId: string): Promise<Record<string, unknown>[]>;
    private chatWithOpenAI;
    private chatWithAnthropic;
}
export {};
//# sourceMappingURL=ai.service.d.ts.map