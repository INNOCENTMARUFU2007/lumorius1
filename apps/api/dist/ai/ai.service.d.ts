import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export declare class AiService {
    private readonly configService;
    private readonly db;
    private readonly logger;
    private openai;
    private anthropic;
    constructor(configService: ConfigService, db: DatabaseService);
    chat(messages: ChatMessage[], opts?: {
        provider?: string;
        model?: string;
        temperature?: number;
    }): Promise<string>;
    createEmbedding(text: string): Promise<number[]>;
    createEmbeddings(texts: string[]): Promise<number[][]>;
    strategyAdvisor(organizationId: string, question: string, context: Record<string, unknown>): Promise<{
        analysis: string;
        model: string;
    }>;
    generateWeeklyReport(organizationId: string, data: Record<string, unknown>): Promise<{
        content: string;
        generatedAt: string;
    }>;
    detectRisksAndOpportunities(data: Record<string, unknown>): Promise<any>;
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