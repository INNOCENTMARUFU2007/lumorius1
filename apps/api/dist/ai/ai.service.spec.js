"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const config_1 = require("@nestjs/config");
const ai_service_1 = require("./ai.service");
const database_service_1 = require("../database/database.service");
const helpers_1 = require("../test/helpers");
const mockOpenAI = {
    chat: {
        completions: {
            create: jest.fn(),
        },
    },
    embeddings: {
        create: jest.fn(),
    },
};
jest.mock('openai', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockOpenAI),
}));
const mockConfigService = {
    get: jest.fn((key) => {
        const config = {
            'OPENAI_API_KEY': 'sk-test-key',
            'OPENAI_MODEL': 'gpt-4o',
            'MAX_TOKENS': 2048,
        };
        return config[key];
    }),
};
const mockChunks = [
    {
        id: 'chunk-1',
        content: 'Lumorius AI is an enterprise operating system.',
        document: { name: 'Product Brief.pdf' },
        similarity: 0.92,
    },
    {
        id: 'chunk-2',
        content: 'It integrates with Slack, Notion, and Google Workspace.',
        document: { name: 'Integrations.pdf' },
        similarity: 0.87,
    },
];
const mockChatResponse = {
    choices: [
        {
            message: {
                role: 'assistant',
                content: 'Lumorius AI is an enterprise operating system that integrates with multiple tools.',
            },
            finish_reason: 'stop',
        },
    ],
    usage: {
        prompt_tokens: 150,
        completion_tokens: 42,
        total_tokens: 192,
    },
    model: 'gpt-4o',
};
const mockEmbeddingResponse = {
    data: [{ embedding: Array(1536).fill(0.1) }],
    usage: { prompt_tokens: 10, total_tokens: 10 },
};
describe('AiService', () => {
    let service;
    let db;
    beforeEach(async () => {
        db = (0, helpers_1.createMockDatabaseService)();
        mockOpenAI.chat.completions.create.mockReset();
        mockOpenAI.embeddings.create.mockReset();
        const module = await testing_1.Test.createTestingModule({
            providers: [
                ai_service_1.AiService,
                { provide: database_service_1.DatabaseService, useValue: db },
                { provide: config_1.ConfigService, useValue: mockConfigService },
            ],
        }).compile();
        service = module.get(ai_service_1.AiService);
    });
    describe('chat()', () => {
        it('calls OpenAI with correct messages and returns response', async () => {
            mockOpenAI.chat.completions.create.mockResolvedValue(mockChatResponse);
            const result = await service.chat({
                userId: 'user-1',
                orgId: 'org-1',
                message: 'What is Lumorius?',
                history: [],
            });
            expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
            const call = mockOpenAI.chat.completions.create.mock.calls[0][0];
            expect(call.model).toBe('gpt-4o');
            expect(call.messages.some((m) => m.content.includes('What is Lumorius?'))).toBe(true);
            expect(result).toBeDefined();
        });
        it('includes conversation history in messages array', async () => {
            mockOpenAI.chat.completions.create.mockResolvedValue(mockChatResponse);
            await service.chat({
                userId: 'user-1',
                orgId: 'org-1',
                message: 'Follow-up question',
                history: [
                    { role: 'user', content: 'First question' },
                    { role: 'assistant', content: 'First answer' },
                ],
            });
            const call = mockOpenAI.chat.completions.create.mock.calls[0][0];
            const contents = call.messages.map((m) => m.content);
            expect(contents).toContain('First question');
            expect(contents).toContain('First answer');
        });
        it('handles OpenAI API error gracefully', async () => {
            mockOpenAI.chat.completions.create.mockRejectedValue(new Error('OpenAI API rate limit exceeded'));
            await expect(service.chat({ userId: 'u1', orgId: 'o1', message: 'test', history: [] })).rejects.toThrow();
        });
    });
    describe('generateEmbedding()', () => {
        it('returns a 1536-dimension embedding vector', async () => {
            mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse);
            const result = await service.createEmbedding('test document content');
            expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
                model: 'text-embedding-3-small',
                input: 'test document content',
            });
            expect(result).toHaveLength(1536);
        });
        it('truncates very long text before embedding', async () => {
            mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse);
            const longText = 'a'.repeat(10000);
            await service.createEmbedding(longText);
            const call = mockOpenAI.embeddings.create.mock.calls[0][0];
            expect(call.input.length).toBeLessThanOrEqual(8000);
        });
    });
    describe('searchSimilarChunks()', () => {
        it('queries DB with embedding and returns ranked chunks', async () => {
            mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse);
            db.query.mockResolvedValue({ rows: mockChunks });
            const results = await service.searchSimilarChunks({
                embedding: [0.1, 0.2, 0.3],
                query: 'What does Lumorius integrate with?',
                orgId: 'org-1',
                limit: 5,
            });
            expect(mockOpenAI.embeddings.create).toHaveBeenCalledTimes(1);
            expect(db.query).toHaveBeenCalledTimes(1);
            expect(results).toHaveLength(2);
            expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
        });
        it('returns empty array when no chunks found', async () => {
            mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse);
            db.query.mockResolvedValue({ rows: [] });
            const results = await service.searchSimilarChunks({
                embedding: [0.1, 0.2, 0.3],
                query: 'unknown query',
                orgId: 'org-1',
                limit: 5,
            });
            expect(results).toEqual([]);
        });
    });
    describe('answerQuestion()', () => {
        it('retrieves context and generates grounded answer', async () => {
            mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse);
            db.query.mockResolvedValue({ rows: mockChunks });
            mockOpenAI.chat.completions.create.mockResolvedValue(mockChatResponse);
            const result = await service.answerQuestion({
                question: 'What does Lumorius integrate with?',
                userId: 'user-1',
                orgId: 'org-1',
            });
            expect(result.answer).toBeDefined();
            expect(result.sources).toBeDefined();
            expect(Array.isArray(result.sources)).toBe(true);
        });
        it('responds gracefully when no documents found', async () => {
            mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse);
            db.query.mockResolvedValue({ rows: [] });
            mockOpenAI.chat.completions.create.mockResolvedValue({
                choices: [{ message: { content: 'No documents found.' }, finish_reason: 'stop' }],
                usage: { total_tokens: 10 },
                model: 'gpt-4o',
            });
            const result = await service.answerQuestion({
                question: 'obscure query',
                userId: 'user-1',
                orgId: 'org-1',
            });
            expect(result.answer).toBeDefined();
            expect(result.sources).toHaveLength(0);
        });
    });
});
//# sourceMappingURL=ai.service.spec.js.map