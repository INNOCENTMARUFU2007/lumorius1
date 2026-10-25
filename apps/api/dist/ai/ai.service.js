"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var AiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = __importDefault(require("openai"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const database_service_1 = require("../database/database.service");
const uuid_1 = require("uuid");
let AiService = AiService_1 = class AiService {
    constructor(configService, db) {
        this.configService = configService;
        this.db = db;
        this.logger = new common_1.Logger(AiService_1.name);
        this.openai = null;
        this.anthropic = null;
        const openaiKey = this.configService.get('ai.openai.apiKey');
        const anthropicKey = this.configService.get('ai.anthropic.apiKey');
        if (openaiKey) {
            this.openai = new openai_1.default({ apiKey: openaiKey });
        }
        if (anthropicKey) {
            this.anthropic = new sdk_1.default({ apiKey: anthropicKey });
        }
    }
    async chat(messages, opts = {}) {
        const provider = opts.provider ??
            this.configService.get('ai.defaultProvider', 'openai');
        let result;
        if (provider === 'anthropic' && this.anthropic) {
            result = await this.chatWithAnthropic(messages, opts);
        }
        else if (this.openai) {
            result = await this.chatWithOpenAI(messages, opts);
        }
        else {
            throw new common_1.BadRequestException('No AI provider configured. Set valid OPENAI_API_KEY or ANTHROPIC_API_KEY credentials in your .env file.');
        }
        await this.recordUsage({
            organizationId: opts.organizationId,
            userId: opts.userId,
            feature: opts.feature ?? 'chat',
            model: result.model,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
        });
        return result.content;
    }
    async recordUsage(input) {
        const { organizationId } = input;
        if (!organizationId) {
            return;
        }
        const promptTokens = Math.max(0, Math.trunc(input.promptTokens || 0));
        const completionTokens = Math.max(0, Math.trunc(input.completionTokens || 0));
        const totalTokens = promptTokens + completionTokens;
        if (totalTokens <= 0) {
            this.logger.warn(`Provider returned no token usage for model ${input.model}; usage was not recorded for organization ${organizationId}.`);
            return;
        }
        await this.db.query(`INSERT INTO ai_usage (
         organization_id,
         user_id,
         model,
         prompt_tokens,
         completion_tokens,
         total_tokens,
         cost_usd,
         feature
       )
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`, [
            organizationId,
            input.userId ?? null,
            input.model,
            promptTokens,
            completionTokens,
            totalTokens,
            input.feature ?? 'chat',
        ]);
        this.logger.debug(`Recorded ${totalTokens} AI tokens for organization ${organizationId}.`);
    }
    async createEmbedding(text, usageContext = {}) {
        if (!this.openai) {
            throw new common_1.BadRequestException('OpenAI API key required for embeddings. Set OPENAI_API_KEY in your .env file.');
        }
        const model = this.configService.get('ai.embeddingModel', 'text-embedding-3-small');
        const response = await this.openai.embeddings.create({
            model,
            input: text.substring(0, 8000),
        });
        await this.recordUsage({
            ...usageContext,
            feature: usageContext.feature ?? 'embedding',
            model: response.model || model,
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: 0,
        });
        return response.data[0]?.embedding ?? [];
    }
    async createEmbeddings(texts, usageContext = {}) {
        if (!this.openai) {
            throw new common_1.BadRequestException('OpenAI API key required for embeddings.');
        }
        const model = this.configService.get('ai.embeddingModel', 'text-embedding-3-small');
        const response = await this.openai.embeddings.create({
            model,
            input: texts.map((text) => text.substring(0, 8000)),
        });
        await this.recordUsage({
            ...usageContext,
            feature: usageContext.feature ?? 'document_embeddings',
            model: response.model || model,
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: 0,
        });
        return response.data.map((item) => item.embedding);
    }
    async searchSimilarChunks(input) {
        const organizationId = input.organizationId ?? input.orgId;
        const query = input.query?.trim();
        if (!organizationId) {
            throw new common_1.BadRequestException('Organization ID is required for document search.');
        }
        if (!query) {
            throw new common_1.BadRequestException('A search query is required.');
        }
        const requestedLimit = input.limit ?? 5;
        const limit = Number.isFinite(requestedLimit)
            ? Math.min(50, Math.max(1, Math.trunc(requestedLimit)))
            : 5;
        const embedding = await this.createEmbedding(query, {
            organizationId,
            userId: input.userId,
            feature: 'document_search',
        });
        if (!embedding.length) {
            return [];
        }
        const vector = `[${embedding.join(',')}]`;
        const result = await this.db.query(`SELECT
         dc.id AS chunk_id,
         dc.content,
         dc.document_id,
         d.name AS document_name,
         1 - (dc.embedding <=> $2::vector) AS score
       FROM document_chunks dc
       JOIN documents d
         ON dc.document_id = d.id
       WHERE d.organization_id = $1
         AND d.status = 'indexed'
         AND dc.embedding IS NOT NULL
       ORDER BY dc.embedding <=> $2::vector ASC
       LIMIT $3`, [organizationId, vector, limit]);
        return result.rows
            .map((row) => {
            const rawDocument = row.document;
            const nestedName = rawDocument &&
                typeof rawDocument === 'object' &&
                'name' in rawDocument &&
                typeof rawDocument.name === 'string'
                ? rawDocument.name
                : undefined;
            const documentName = typeof row.document_name === 'string'
                ? row.document_name
                : nestedName;
            const chunkId = typeof row.chunk_id === 'string'
                ? row.chunk_id
                : typeof row.id === 'string'
                    ? row.id
                    : undefined;
            const similarity = Number(row.similarity ?? row.score ?? 0);
            return {
                ...row,
                id: typeof row.id === 'string' ? row.id : chunkId,
                chunk_id: chunkId,
                content: typeof row.content === 'string' ? row.content : '',
                document_id: typeof row.document_id === 'string'
                    ? row.document_id
                    : undefined,
                document_name: documentName,
                document: documentName
                    ? { name: documentName }
                    : undefined,
                similarity: Number.isFinite(similarity) ? similarity : 0,
            };
        })
            .sort((a, b) => b.similarity - a.similarity);
    }
    async answerQuestion(input) {
        const organizationId = input.organizationId ?? input.orgId;
        const question = input.question?.trim();
        if (!organizationId) {
            throw new common_1.BadRequestException('Organization ID is required to answer a document question.');
        }
        if (!question) {
            throw new common_1.BadRequestException('A question is required.');
        }
        const chunks = await this.searchSimilarChunks({
            query: question,
            organizationId,
            userId: input.userId,
            limit: input.limit ?? 5,
        });
        const sources = chunks.map((chunk) => ({
            id: chunk.chunk_id ?? chunk.id,
            documentId: chunk.document_id,
            documentName: chunk.document_name ??
                chunk.document?.name ??
                'Unknown document',
            similarity: chunk.similarity,
        }));
        if (chunks.length === 0) {
            return {
                answer: 'I could not find relevant indexed documents to answer that question. Upload and index relevant documents, then try again.',
                sources: [],
            };
        }
        const context = chunks
            .map((chunk, index) => {
            const documentName = chunk.document_name ??
                chunk.document?.name ??
                'Unknown document';
            return `[Source ${index + 1}: ${documentName}]\n${chunk.content}`;
        })
            .join('\n\n');
        const answer = await this.chat([
            {
                role: 'system',
                content: 'Answer the user using only the supplied document context. ' +
                    'Do not invent facts or claim that a source supports something it does not. ' +
                    'If the context is insufficient, clearly state that limitation. ' +
                    'When useful, identify the source document by name.\n\n' +
                    `DOCUMENT CONTEXT:\n${context}`,
            },
            {
                role: 'user',
                content: question,
            },
        ], {
            organizationId,
            userId: input.userId,
            feature: 'document_question_answering',
        });
        return { answer, sources };
    }
    async strategyAdvisor(organizationId, question, context) {
        const systemPrompt = `You are the AI Strategy Advisor for Lumorius AI, acting as a CEO/COO advisor.
You provide strategic insights, SWOT analysis, and actionable recommendations.
Be concise, direct, and focused on actionable next steps.
Organization context: ${JSON.stringify(context)}`;
        const analysis = await this.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question },
        ], {
            organizationId,
            feature: 'strategy_advisor',
        });
        return { analysis, model: 'strategy-advisor-v1' };
    }
    async generateWeeklyReport(data, usageContext = {}) {
        const prompt = `Generate a comprehensive weekly business report in markdown format for the following data:
${JSON.stringify(data, null, 2)}

Include:
1. Executive Summary (3-4 sentences)
2. Key Wins This Week
3. Challenges & Blockers
4. Critical Metrics Review
5. Top Priorities for Next Week
6. Strategic Recommendations

Be direct, data-driven, and actionable.`;
        const content = await this.chat([{ role: 'user', content: prompt }], {
            ...usageContext,
            feature: usageContext.feature ?? 'weekly_report',
        });
        return {
            content,
            generatedAt: new Date().toISOString(),
        };
    }
    async detectRisksAndOpportunities(data, usageContext = {}) {
        const prompt = `Analyze this business data and identify:
1. Top 3 RISKS (with severity: low/medium/high/critical and recommendation)
2. Top 3 OPPORTUNITIES (with impact: low/medium/high and next step)

Data: ${JSON.stringify(data, null, 2)}

Return a JSON object with keys "risks" and "opportunities".`;
        const response = await this.chat([{ role: 'user', content: prompt }], {
            ...usageContext,
            feature: usageContext.feature ?? 'risk_analysis',
        });
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        }
        catch {
            this.logger.warn('AI risk analysis did not return valid JSON.');
        }
        return { risks: [], opportunities: [] };
    }
    async sendMessage(userId, organizationId, message, conversationId, context) {
        const cleanMessage = message?.trim();
        if (!cleanMessage) {
            throw new common_1.BadRequestException('Message cannot be empty.');
        }
        let convId = conversationId;
        if (convId) {
            const existing = await this.db.query(`SELECT id
         FROM ai_conversations
         WHERE id = $1
           AND user_id = $2
           AND organization_id = $3
         LIMIT 1`, [convId, userId, organizationId]);
            if (!existing.rows[0]) {
                throw new common_1.NotFoundException('Conversation not found.');
            }
        }
        else {
            convId = (0, uuid_1.v4)();
            const title = cleanMessage.length > 100
                ? `${cleanMessage.substring(0, 97)}...`
                : cleanMessage;
            const defaultModel = this.configService.get('ai.defaultModel', 'gpt-4o-mini');
            await this.db.query(`INSERT INTO ai_conversations (
           id,
           user_id,
           organization_id,
           title,
           model
         )
         VALUES ($1, $2, $3, $4, $5)`, [
                convId,
                userId,
                organizationId,
                title,
                defaultModel,
            ]);
        }
        await this.db.query(`INSERT INTO ai_messages (
         id,
         conversation_id,
         role,
         content
       )
       VALUES ($1, $2, 'user', $3)`, [(0, uuid_1.v4)(), convId, cleanMessage]);
        const historyResult = await this.db.query(`SELECT role, content
       FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 20`, [convId]);
        const messages = [
            {
                role: 'system',
                content: `You are an AI assistant for Lumorius AI, an AI Operating System for businesses.
You help teams with strategy, decision-making, data analysis, and operations.
${context ? `Context: ${JSON.stringify(context)}` : ''}`,
            },
            ...historyResult.rows
                .filter((row) => row.role === 'user' ||
                row.role === 'assistant')
                .map((row) => ({
                role: row.role,
                content: row.content,
            })),
        ];
        const response = await this.chat(messages, {
            organizationId,
            userId,
            feature: 'assistant_chat',
        });
        await this.db.query(`INSERT INTO ai_messages (
         id,
         conversation_id,
         role,
         content
       )
       VALUES ($1, $2, 'assistant', $3)`, [(0, uuid_1.v4)(), convId, response]);
        await this.db.query(`UPDATE ai_conversations
       SET updated_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND organization_id = $3`, [convId, userId, organizationId]);
        return {
            conversationId: convId,
            response,
            role: 'assistant',
        };
    }
    async getConversations(userId, organizationId) {
        const result = await this.db.query(`SELECT
         id,
         title,
         model,
         model AS type,
         created_at,
         updated_at
       FROM ai_conversations
       WHERE user_id = $1
         AND organization_id = $2
       ORDER BY updated_at DESC
       LIMIT 50`, [userId, organizationId]);
        return result.rows;
    }
    async getConversationMessages(conversationId, userId) {
        const conv = await this.db.findOne('ai_conversations', {
            id: conversationId,
            user_id: userId,
        });
        if (!conv) {
            throw new common_1.NotFoundException('Conversation not found.');
        }
        const result = await this.db.query(`SELECT
         id,
         role,
         content,
         created_at
       FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`, [conversationId]);
        return result.rows;
    }
    async chatWithOpenAI(messages, opts) {
        if (!this.openai) {
            throw new common_1.BadRequestException('OpenAI is not configured.');
        }
        const requestedModel = opts.model ?? 'gpt-4o-mini';
        const response = await this.openai.chat.completions.create({
            model: requestedModel,
            messages,
            temperature: opts.temperature ?? 0.7,
            max_tokens: 4096,
        });
        return {
            content: response.choices[0]?.message?.content ?? '',
            model: response.model || requestedModel,
            promptTokens: response.usage?.prompt_tokens ?? 0,
            completionTokens: response.usage?.completion_tokens ?? 0,
        };
    }
    async chatWithAnthropic(messages, opts) {
        if (!this.anthropic) {
            throw new common_1.BadRequestException('Anthropic is not configured.');
        }
        const systemMessage = messages.find((message) => message.role === 'system');
        const conversationMessages = messages.filter((message) => message.role !== 'system');
        const requestedModel = opts.model ?? 'claude-3-haiku-20240307';
        const response = await this.anthropic.messages.create({
            model: requestedModel,
            max_tokens: 4096,
            system: systemMessage?.content,
            messages: conversationMessages.map((message) => ({
                role: message.role,
                content: message.content,
            })),
            temperature: opts.temperature ?? 0.7,
        });
        const content = response.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text)
            .join('\n');
        return {
            content,
            model: response.model || requestedModel,
            promptTokens: response.usage?.input_tokens ?? 0,
            completionTokens: response.usage?.output_tokens ?? 0,
        };
    }
};
exports.AiService = AiService;
exports.AiService = AiService = AiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        database_service_1.DatabaseService])
], AiService);
//# sourceMappingURL=ai.service.js.map