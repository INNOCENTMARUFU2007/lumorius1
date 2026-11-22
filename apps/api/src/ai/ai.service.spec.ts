import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiService } from './ai.service';
import { DatabaseService } from '../database/database.service';
import { createMockDatabaseService } from '../test/helpers';

// â”€â”€ Mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  default: Object.assign(jest.fn().mockImplementation(() => mockOpenAI), {
    APIError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  }),
}));

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string | number> = {
      'ai.openai.apiKey': 'sk-test-0123456789abcdefghijklmnop',
      'ai.openrouter.baseURL': 'https://openrouter.ai/api/v1',
      'ai.openrouter.model': 'openai/gpt-4o-mini',
      'ai.defaultProvider': 'openai',
      'ai.embeddingModel': 'text-embedding-3-small',
      'MAX_TOKENS':     2048,
    };
    return config[key];
  }),
};

// â”€â”€ Fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const mockChunks = [
  {
    id:       'chunk-1',
    content:  'Lumorius AI is an enterprise operating system.',
    document: { name: 'Product Brief.pdf' },
    similarity: 0.92,
  },
  {
    id:       'chunk-2',
    content:  'It integrates with Slack, Notion, and Google Workspace.',
    document: { name: 'Integrations.pdf' },
    similarity: 0.87,
  },
];

const mockChatResponse = {
  choices: [
    {
      message: {
        role:    'assistant',
        content: 'Lumorius AI is an enterprise operating system that integrates with multiple tools.',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens:     150,
    completion_tokens: 42,
    total_tokens:      192,
  },
  model: 'gpt-4o',
};

const mockEmbeddingResponse = {
  data: [{ embedding: Array(1536).fill(0.1) }],
  usage: { prompt_tokens: 10, total_tokens: 10 },
};

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('AiService', () => {
  let service: AiService;
  let db: ReturnType<typeof createMockDatabaseService>;

  beforeEach(async () => {
    db = createMockDatabaseService();
    mockOpenAI.chat.completions.create.mockReset();
    mockOpenAI.embeddings.create.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: DatabaseService,
          useValue: {
            ...db,
            query: (sql: string, params: unknown[]) =>
              sql.includes('reserve_lumorius_ai_tokens')
                ? Promise.resolve({ rows: [{ budget: -1 }] })
                : db.query(sql, params),
          },
        },
        { provide: ConfigService,    useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  // â”€â”€ chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('chat()', () => {
    it('calls OpenAI with correct messages and returns response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(mockChatResponse);

      const result = await service.chat(
        [{ role: 'user', content: 'What is Lumorius?' }],
        { userId: 'user-1', organizationId: 'org-1', model: 'gpt-4o' },
      );

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
      const call = mockOpenAI.chat.completions.create.mock.calls[0][0];
      expect(call.model).toBe('gpt-4.1'); // only the approved OpenAI model is used, even if another is requested
      expect(call.messages.some((m: any) => m.content.includes('What is Lumorius?'))).toBe(true);
      expect(result).toBeDefined();
    });

    it('includes conversation history in messages array', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue(mockChatResponse);

      await service.chat(
        [
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'First answer' },
          { role: 'user', content: 'Follow-up question' },
        ],
        { userId: 'user-1', organizationId: 'org-1', model: 'gpt-4o' },
      );

      const call = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const contents = call.messages.map((m: any) => m.content);
      expect(contents).toContain('First question');
      expect(contents).toContain('First answer');
    });

    it('rejects providers other than OpenAI and Anthropic', async () => {
      await expect(
        service.chat([{ role: 'user', content: 'test' }], { provider: 'openrouter', organizationId: 'org-1', userId: 'user-1' }),
      ).rejects.toThrow('AI provider must be');
      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });
    it('explains an empty provider balance instead of a generic failure', async () => {
      const { APIError } = (jest.requireMock('openai') as { default: { APIError: new (status: number, message: string) => Error } }).default;
      mockOpenAI.chat.completions.create.mockRejectedValue(new APIError(429, 'You have no credits remaining. Add credits to continue.'));
      await expect(
        service.chat([{ role: 'user', content: 'test' }], { userId: 'u1', organizationId: 'o1' }),
      ).rejects.toMatchObject({ response: { code: 'provider_no_credit' } });
    });

    it('handles OpenAI API error gracefully', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(
        new Error('OpenAI API rate limit exceeded'),
      );

      await expect(
        service.chat([{ role: 'user', content: 'test' }], { userId: 'u1', organizationId: 'o1' }),
      ).rejects.toThrow();
    });
  });

  // â”€â”€ generateEmbedding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    it('always uses OpenAI embeddings, whatever the chat provider', async () => {
      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse);
      const previousProvider = process.env.AI_EMBEDDING_PROVIDER;
      process.env.AI_EMBEDDING_PROVIDER = 'anthropic';
      try {
        await service.createEmbedding('embedding provider test');
        expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
          model: 'text-embedding-3-small',
          input: 'embedding provider test',
        });
      } finally {
        if (previousProvider === undefined) delete process.env.AI_EMBEDDING_PROVIDER;
        else process.env.AI_EMBEDDING_PROVIDER = previousProvider;
      }
    });
    it('truncates very long text before embedding', async () => {
      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse);
      const longText = 'a'.repeat(10000);

      await service.createEmbedding(longText);

      const call = mockOpenAI.embeddings.create.mock.calls[0][0];
      expect(call.input.length).toBeLessThanOrEqual(8000);
    });
  });

  // â”€â”€ searchSimilarChunks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('searchSimilarChunks()', () => {
    it('queries DB with embedding and returns ranked chunks', async () => {
      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse);
      db.query.mockResolvedValue({ rows: mockChunks });

      const results = await service.searchSimilarChunks({
        embedding: [0.1, 0.2, 0.3],
        query:  'What does Lumorius integrate with?',
        orgId:  'org-1',
        userId: 'user-1',
        role: 'member',
        limit:  5,
      } as any);

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledTimes(1);
      expect(
        db.query.mock.calls.some(([sql]) =>
          String(sql).includes('FROM document_chunks dc'),
        ),
      ).toBe(true);
      const retrievalCall = db.query.mock.calls.find(([sql]) =>
        String(sql).includes('FROM document_chunks dc'),
      );
      expect(retrievalCall?.[0]).toContain('team_members');
      expect(retrievalCall?.[1]).toEqual([
        'org-1',
        expect.any(String),
        false,
        'user-1',
        5,
      ]);
      expect(results).toHaveLength(2);
      expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    });

    it('requires authenticated user context before requesting an embedding', async () => {
      await expect(service.searchSimilarChunks({
        query: 'restricted document query',
        orgId: 'org-1',
      } as any)).rejects.toThrow('Authenticated user context is required');

      expect(mockOpenAI.embeddings.create).not.toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalled();
    });

    it('returns empty array when no chunks found', async () => {
      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse);
      db.query.mockResolvedValue({ rows: [] });

      const results = await service.searchSimilarChunks({
        embedding: [0.1, 0.2, 0.3],
        query: 'unknown query',
        orgId: 'org-1',
        userId: 'user-1',
        role: 'member',
        limit: 5,
      } as any);

      expect(results).toEqual([]);
    });
  });

  // â”€â”€ answerQuestion (RAG) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('answerQuestion()', () => {
    it('retrieves context and generates grounded answer', async () => {
      mockOpenAI.embeddings.create.mockResolvedValue(mockEmbeddingResponse);
      db.query.mockResolvedValue({ rows: mockChunks });
      mockOpenAI.chat.completions.create.mockResolvedValue(mockChatResponse);

      const result = await service.answerQuestion({
        question: 'What does Lumorius integrate with?',
        userId:   'user-1',
        orgId:    'org-1',
      } as any);

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
        userId:   'user-1',
        orgId:    'org-1',
      } as any);

      expect(result.answer).toBeDefined();
      expect(result.sources).toHaveLength(0);
    });
  });
});
