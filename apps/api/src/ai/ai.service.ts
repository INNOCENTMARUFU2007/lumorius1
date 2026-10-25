import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';

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

interface ProviderResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

interface SimilarChunk {
  id?: string;
  chunk_id?: string;
  content: string;
  document_id?: string;
  document_name?: string;
  document?: { name: string };
  similarity: number;
  score?: number;
  [key: string]: unknown;
}
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI | null = null;
  private openrouter: OpenAI | null = null;
  private anthropic: Anthropic | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {
    const openaiKey =
      this.configService.get<string>('ai.openai.apiKey') ??
      process.env.OPENAI_API_KEY;

    const openrouterKey =
      this.configService.get<string>('ai.openrouter.apiKey') ??
      process.env.OPENROUTER_API_KEY;

    const anthropicKey =
      this.configService.get<string>('ai.anthropic.apiKey') ??
      process.env.ANTHROPIC_API_KEY;

    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }

    if (openrouterKey) {
      const baseURL =
        this.configService.get<string>('ai.openrouter.baseURL') ??
        process.env.OPENROUTER_BASE_URL ??
        'https://openrouter.ai/api/v1';

      this.openrouter = new OpenAI({
        apiKey: openrouterKey,
        baseURL,
      });
    }

    if (anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicKey });
    }
  }
  async chat(
    messages: ChatMessage[],
    opts: ChatOptions = {},
  ): Promise<string> {
    const provider = (
      opts.provider ??
      this.configService.get<string>('ai.defaultProvider') ??
      process.env.AI_DEFAULT_PROVIDER ??
      (this.openrouter && !this.openai ? 'openrouter' : 'openai')
    ).toLowerCase();

    let result: ProviderResult;

    if (provider === 'anthropic') {
      const client = this.anthropic;
      if (!client) {
        throw new BadRequestException(
          'Anthropic selected but ANTHROPIC_API_KEY is not configured.',
        );
      }
      result = await this.chatWithAnthropic(messages, opts);
    } else if (provider === 'openrouter') {
      const client = this.openrouter;
      if (!client) {
        throw new BadRequestException(
          'OpenRouter selected but OPENROUTER_API_KEY is not configured.',
        );
      }

      const requestedModel =
        opts.model ??
        this.configService.get<string>('ai.openrouter.model') ??
        process.env.AI_OPENROUTER_MODEL ??
        'openai/gpt-4o-mini';

      const model = requestedModel.includes('/')
        ? requestedModel
        : `openai/${requestedModel}`;

      result = await this.chatWithOpenAI(
        messages,
        { ...opts, model },
        client,
      );
    } else if (provider === 'openai') {
      const client = this.openai;
      if (!client) {
        throw new BadRequestException(
          'OpenAI selected but OPENAI_API_KEY is not configured.',
        );
      }

      result = await this.chatWithOpenAI(messages, opts, client);
    } else {
      throw new BadRequestException(
        `Unsupported AI provider "${provider}". Use openai, openrouter, or anthropic.`,
      );
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

  /**
   * Records provider-reported token usage for an organization.
   * Cost remains zero until provider-specific pricing is configured.
   */
  private async recordUsage(input: {
    organizationId?: string;
    userId?: string;
    feature?: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
  }): Promise<void> {
    const { organizationId } = input;

    if (!organizationId) {
      return;
    }

    const promptTokens = Math.max(
      0,
      Math.trunc(input.promptTokens || 0),
    );

    const completionTokens = Math.max(
      0,
      Math.trunc(input.completionTokens || 0),
    );

    const totalTokens = promptTokens + completionTokens;

    if (totalTokens <= 0) {
      this.logger.warn(
        `Provider returned no token usage for model ${input.model}; usage was not recorded for organization ${organizationId}.`,
      );
      return;
    }

    await this.db.query(
      `INSERT INTO ai_usage (
         organization_id,
         user_id,
         model,
         prompt_tokens,
         completion_tokens,
         total_tokens,
         cost_usd,
         feature
       )
       VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
      [
        organizationId,
        input.userId ?? null,
        input.model,
        promptTokens,
        completionTokens,
        totalTokens,
        input.feature ?? 'chat',
      ],
    );

    this.logger.debug(
      `Recorded ${totalTokens} AI tokens for organization ${organizationId}.`,
    );
  }

  private getEmbeddingClientAndModel(): {
    client: OpenAI;
    model: string;
  } {
    const configuredProvider =
      this.configService.get<string>('ai.embeddingProvider') ??
      process.env.AI_EMBEDDING_PROVIDER ??
      this.configService.get<string>('ai.defaultProvider') ??
      process.env.AI_DEFAULT_PROVIDER;

    const provider =
      configuredProvider === 'openrouter'
        ? 'openrouter'
        : configuredProvider === 'openai'
          ? 'openai'
          : this.openai
            ? 'openai'
            : 'openrouter';

    const client =
      provider === 'openrouter'
        ? this.openrouter
        : this.openai;

    if (!client) {
      throw new BadRequestException(
        provider === 'openrouter'
          ? 'OpenRouter API key required for embeddings.'
          : 'OpenAI API key required for embeddings.',
      );
    }

    const configuredModel =
      this.configService.get<string>('ai.embeddingModel') ??
      process.env.AI_EMBEDDING_MODEL;

    const selectedModel =
      configuredModel ??
      (provider === 'openrouter'
        ? 'openai/text-embedding-3-small'
        : 'text-embedding-3-small');

    const model =
      provider === 'openrouter' && !selectedModel.includes('/')
        ? `openai/${selectedModel}`
        : selectedModel;

    return { client, model };
  }

  async createEmbedding(
    text: string,
    usageContext: UsageContext = {},
  ): Promise<number[]> {
    const { client, model } = this.getEmbeddingClientAndModel();

    const response = await client.embeddings.create({
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

  async createEmbeddings(
    texts: string[],
    usageContext: UsageContext = {},
  ): Promise<number[][]> {
    const { client, model } = this.getEmbeddingClientAndModel();

    const response = await client.embeddings.create({
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
  /**
   * Retrieve relevant indexed document chunks within one organization.
   */
  async searchSimilarChunks(input: {
    query: string;
    orgId?: string;
    organizationId?: string;
    userId?: string;
    limit?: number;
  }): Promise<SimilarChunk[]> {
    const organizationId = input.organizationId ?? input.orgId;
    const query = input.query?.trim();

    if (!organizationId) {
      throw new BadRequestException('Organization ID is required for document search.');
    }
    if (!query) {
      throw new BadRequestException('A search query is required.');
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
    const result = await this.db.query<Record<string, unknown>>(
      `SELECT
         dc.id AS chunk_id,
         dc.content,
         dc.document_id,
         d.name AS document_name,
         1 - (dc.embedding <=> $2::vector) AS score
       FROM document_chunks dc
       JOIN documents d ON dc.document_id = d.id
       WHERE d.organization_id = $1
         AND d.status = 'indexed'
         AND dc.embedding IS NOT NULL
       ORDER BY dc.embedding <=> $2::vector ASC
       LIMIT $3`,
      [organizationId, vector, limit],
    );

    return result.rows
      .map((row): SimilarChunk => {
        const nestedDocument = row.document;
        const nestedName =
          nestedDocument &&
          typeof nestedDocument === 'object' &&
          'name' in nestedDocument &&
          typeof nestedDocument.name === 'string'
            ? nestedDocument.name
            : undefined;

        const chunkId =
          typeof row.chunk_id === 'string'
            ? row.chunk_id
            : typeof row.id === 'string'
              ? row.id
              : undefined;

        const documentName =
          typeof row.document_name === 'string'
            ? row.document_name
            : nestedName;

        const rawScore = Number(row.similarity ?? row.score ?? 0);

        return {
          ...row,
          id: typeof row.id === 'string' ? row.id : chunkId,
          chunk_id: chunkId,
          content: typeof row.content === 'string' ? row.content : '',
          document_id:
            typeof row.document_id === 'string' ? row.document_id : undefined,
          document_name: documentName,
          document: documentName ? { name: documentName } : undefined,
          similarity: Number.isFinite(rawScore) ? rawScore : 0,
        };
      })
      .sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Answer using retrieved document context and return source references.
   */
  async answerQuestion(input: {
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
  }> {
    const organizationId = input.organizationId ?? input.orgId;
    const question = input.question?.trim();

    if (!organizationId) {
      throw new BadRequestException(
        'Organization ID is required to answer a document question.',
      );
    }
    if (!question) {
      throw new BadRequestException('A question is required.');
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
      documentName:
        chunk.document_name ?? chunk.document?.name ?? 'Unknown document',
      similarity: chunk.similarity,
    }));

    if (chunks.length === 0) {
      return {
        answer:
          'I could not find relevant indexed documents to answer that question. Upload and index relevant documents, then try again.',
        sources: [],
      };
    }

    const context = chunks
      .map((chunk, index) => {
        const name =
          chunk.document_name ?? chunk.document?.name ?? 'Unknown document';
        return `[Source ${index + 1}: ${name}]\n${chunk.content}`;
      })
      .join('\n\n');

    const answer = await this.chat(
      [
        {
          role: 'system',
          content:
            'Answer using only the supplied document context. Do not invent facts. ' +
            'If the context is insufficient, state that limitation. Identify source documents when useful.\n\n' +
            `DOCUMENT CONTEXT:\n${context}`,
        },
        { role: 'user', content: question },
      ],
      {
        organizationId,
        userId: input.userId,
        feature: 'document_question_answering',
      },
    );

    return { answer, sources };
  }
  async strategyAdvisor(
    organizationId: string,
    question: string,
    context: Record<string, unknown>,
  ) {
    const systemPrompt =
      `You are the AI Strategy Advisor for Lumorius AI, acting as a CEO/COO advisor.
You provide strategic insights, SWOT analysis, and actionable recommendations.
Be concise, direct, and focused on actionable next steps.
Organization context: ${JSON.stringify(context)}`;

    const analysis = await this.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      {
        organizationId,
        feature: 'strategy_advisor',
      },
    );

    return { analysis, model: 'strategy-advisor-v1' };
  }

  async generateWeeklyReport(
    data: Record<string, unknown>,
    usageContext: UsageContext = {},
  ) {
    const prompt =
      `Generate a comprehensive weekly business report in markdown format for the following data:
${JSON.stringify(data, null, 2)}

Include:
1. Executive Summary (3-4 sentences)
2. Key Wins This Week
3. Challenges & Blockers
4. Critical Metrics Review
5. Top Priorities for Next Week
6. Strategic Recommendations

Be direct, data-driven, and actionable.`;

    const content = await this.chat(
      [{ role: 'user', content: prompt }],
      {
        ...usageContext,
        feature: usageContext.feature ?? 'weekly_report',
      },
    );

    return {
      content,
      generatedAt: new Date().toISOString(),
    };
  }

  async detectRisksAndOpportunities(
    data: Record<string, unknown>,
    usageContext: UsageContext = {},
  ) {
    const prompt =
      `Analyze this business data and identify:
1. Top 3 RISKS (with severity: low/medium/high/critical and recommendation)
2. Top 3 OPPORTUNITIES (with impact: low/medium/high and next step)

Data: ${JSON.stringify(data, null, 2)}

Return a JSON object with keys "risks" and "opportunities".`;

    const response = await this.chat(
      [{ role: 'user', content: prompt }],
      {
        ...usageContext,
        feature: usageContext.feature ?? 'risk_analysis',
      },
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      this.logger.warn(
        'AI risk analysis did not return valid JSON.',
      );
    }

    return { risks: [], opportunities: [] };
  }

  async sendMessage(
    userId: string,
    organizationId: string,
    message: string,
    conversationId?: string,
    context?: Record<string, unknown>,
  ) {
    const cleanMessage = message?.trim();

    if (!cleanMessage) {
      throw new BadRequestException(
        'Message cannot be empty.',
      );
    }

    let convId = conversationId;

    if (convId) {
      // Confirm the conversation belongs to this user and organization.
      const existing = await this.db.query(
        `SELECT id
         FROM ai_conversations
         WHERE id = $1
           AND user_id = $2
           AND organization_id = $3
         LIMIT 1`,
        [convId, userId, organizationId],
      );

      if (!existing.rows[0]) {
        throw new NotFoundException(
          'Conversation not found.',
        );
      }
    } else {
      convId = uuidv4();

      const title =
        cleanMessage.length > 100
          ? `${cleanMessage.substring(0, 97)}...`
          : cleanMessage;

      const defaultModel =
        this.configService.get<string>(
          'ai.defaultModel',
          'gpt-4o-mini',
        );

      // ai_conversations has title and model, not type.
      await this.db.query(
        `INSERT INTO ai_conversations (
           id,
           user_id,
           organization_id,
           title,
           model
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [
          convId,
          userId,
          organizationId,
          title,
          defaultModel,
        ],
      );
    }

    await this.db.query(
      `INSERT INTO ai_messages (
         id,
         conversation_id,
         role,
         content
       )
       VALUES ($1, $2, 'user', $3)`,
      [uuidv4(), convId, cleanMessage],
    );

    const historyResult = await this.db.query<{
      role: string;
      content: string;
    }>(
      `SELECT role, content
       FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 20`,
      [convId],
    );

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          `You are an AI assistant for Lumorius AI, an AI Operating System for businesses.
You help teams with strategy, decision-making, data analysis, and operations.
${context ? `Context: ${JSON.stringify(context)}` : ''}`,
      },
      ...historyResult.rows
        .filter(
          (row) =>
            row.role === 'user' ||
            row.role === 'assistant',
        )
        .map((row) => ({
          role: row.role as 'user' | 'assistant',
          content: row.content,
        })),
    ];

    const response = await this.chat(messages, {
      organizationId,
      userId,
      feature: 'assistant_chat',
    });

    await this.db.query(
      `INSERT INTO ai_messages (
         id,
         conversation_id,
         role,
         content
       )
       VALUES ($1, $2, 'assistant', $3)`,
      [uuidv4(), convId, response],
    );

    await this.db.query(
      `UPDATE ai_conversations
       SET updated_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND organization_id = $3`,
      [convId, userId, organizationId],
    );

    return {
      conversationId: convId,
      response,
      role: 'assistant',
    };
  }

  async getConversations(
    userId: string,
    organizationId: string,
  ) {
    const result = await this.db.query(
      `SELECT
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
       LIMIT 50`,
      [userId, organizationId],
    );

    return result.rows;
  }

  async getConversationMessages(
    conversationId: string,
    userId: string,
  ) {
    const conv = await this.db.findOne(
      'ai_conversations',
      {
        id: conversationId,
        user_id: userId,
      },
    );

    if (!conv) {
      throw new NotFoundException(
        'Conversation not found.',
      );
    }

    const result = await this.db.query(
      `SELECT
         id,
         role,
         content,
         created_at
       FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId],
    );

    return result.rows;
  }

  private async chatWithOpenAI(
    messages: ChatMessage[],
    opts: ChatOptions,
    client: OpenAI,
  ): Promise<ProviderResult> {
    const requestedModel = opts.model ?? 'gpt-4o-mini';

    const response = await client.chat.completions.create({
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
  private async chatWithAnthropic(
    messages: ChatMessage[],
    opts: ChatOptions,
  ): Promise<ProviderResult> {
    if (!this.anthropic) {
      throw new BadRequestException(
        'Anthropic is not configured.',
      );
    }

    const systemMessage = messages.find(
      (message) => message.role === 'system',
    );

    const conversationMessages = messages.filter(
      (message) => message.role !== 'system',
    );

    const requestedModel =
      opts.model ?? 'claude-3-haiku-20240307';

    const response =
      await this.anthropic.messages.create({
        model: requestedModel,
        max_tokens: 4096,
        system: systemMessage?.content,
        messages: conversationMessages.map(
          (message) => ({
            role: message.role as
              | 'user'
              | 'assistant',
            content: message.content,
          }),
        ),
        temperature: opts.temperature ?? 0.7,
      });

    const content = response.content
      .filter(
        (
          block,
        ): block is Anthropic.TextBlock =>
          block.type === 'text',
      )
      .map((block) => block.text)
      .join('\n');

    return {
      content,
      model: response.model || requestedModel,
      promptTokens:
        response.usage?.input_tokens ?? 0,
      completionTokens:
        response.usage?.output_tokens ?? 0,
    };
  }
}
