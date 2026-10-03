import { AiService } from './ai.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
export declare class AiController {
    private readonly aiService;
    constructor(aiService: AiService);
    sendMessage(user: JwtPayload, body: {
        message: string;
        conversationId?: string;
    }): Promise<{
        conversationId: string;
        response: string;
        role: string;
    }>;
    getConversations(user: JwtPayload): Promise<Record<string, unknown>[]>;
    getMessages(user: JwtPayload, id: string): Promise<Record<string, unknown>[]>;
    strategyAnalyze(user: JwtPayload, body: {
        question: string;
        context?: Record<string, unknown>;
    }): Promise<{
        analysis: string;
        model: string;
    }>;
    detectRisksOpportunities(user: JwtPayload, body: {
        data: Record<string, unknown>;
    }): Promise<any>;
    generateWeeklyReport(user: JwtPayload, body: {
        data: Record<string, unknown>;
    }): Promise<{
        content: string;
        generatedAt: string;
    }>;
}
//# sourceMappingURL=ai.controller.d.ts.map