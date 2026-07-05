import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DatabaseService,
  ) {
    const openaiKey = this.configService.get<string>('ai.openai.apiKey');
    const anthropicKey = this.configService.get<string>('ai.anthropic.apiKey');

    if (openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }
    if (anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicKey });
    }
  }

  async chat(
    messages: ChatMessage[],
    opts: { provider?: string; model?: string; temperature?: number } = {},
  ): Promise<string> {
    const provider = opts.provider ?? this.configService.get('ai.defaultProvider', 'openai');

    if (provider === 'anthropic' && this.anthropic) {
      return this.chatWithAnthropic(messages, opts);
    }
    if (this.openai) {
      return this.chatWithOpenAI(messages, opts);
    }
    throw new BadRequestException('No AI provider configured. Please set OPENAI_API_KEY or ANTHROPIC_API_KEY in your .env file.');
  }

  async createEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new BadRequestException('OpenAI API key required for embeddings. Set OPENAI_API_KEY in your .env file.');
    }
    const response = await this.openai.embeddings.create({
      model: this.configService.get('ai.embeddingModel', 'text-embedding-3-small'),
      input: text.substring(0, 8000),
    });
    return response.data[0]?.embedding ?? [];
  }

  async createEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.openai) {
      throw new BadRequestException('OpenAI API key required for embeddings.');
    }
    const response = await this.openai.embeddings.create({
      model: this.configService.get('ai.embeddingModel', 'text-embedding-3-small'),
      input: texts.map((t) => t.substring(0, 8000)),
    });
    return response.data.map((d) => d.embedding);
  }

  async strategyAdvisor(
    organizationId: string,
    question: string,
    context: Record<string, unknown>,
  ) {
    const systemPrompt = `You are the AI Strategy Advisor for Lumorius AI, acting as a CEO/COO advisor.
You have access to company data and provide strategic insights, SWOT analysis, and actionable recommendations.
Be concise, direct, and focused on actionable next steps.
Organization context: ${JSON.stringify(context)}`;

    const analysis = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ]);

    return { analysis, model: 'strategy-advisor-v1' };
  }

  async generateWeeklyReport(organizationId: string, data: Record<string, unknown>) {
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

    const content = await this.chat([{ role: 'user', content: prompt }]);
    return { content, generatedAt: new Date().toISOString() };
  }

  async detectRisksAndOpportunities(data: Record<string, unknown>) {
    const prompt = `Analyze this business data and identify:
1. Top 3 RISKS (with severity: low/medium/high/critical and recommendation)
2. Top 3 OPPORTUNITIES (with impact: low/medium/high and next step)

Data: ${JSON.stringify(data, null, 2)}

Return a JSON object with keys "risks" and "opportunities".`;

    const response = await this.chat([{ role: 'user', content: prompt }]);
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {}
    return { risks: [], opportunities: [] };
  }

  async sendMessage(
    userId: string,
    organizationId: string,
    message: string,
    conversationId?: string,
    context?: Record<string, unknown>,
  ) {
    let convId = conversationId;

    if (!convId) {
      convId = uuidv4();
      await this.db.query(
        `INSERT INTO ai_conversations (id, user_id, organization_id, type)
         VALUES ($1, $2, $3, 'general')`,
        [convId, userId, organizationId],
      );
    }

    await this.db.query(
      `INSERT INTO ai_messages (id, conversation_id, role, content) VALUES ($1, $2, 'user', $3)`,
      [uuidv4(), convId, message],
    );

    const historyResult = await this.db.query<{ role: string; content: string }>(
      `SELECT role, content FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC LIMIT 20`,
      [convId],
    );

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an AI assistant for Lumorius AI, an AI Operating System for businesses.
You help teams with strategy, decision-making, data analysis, and operations.
${context ? `Context: ${JSON.stringify(context)}` : ''}`,
      },
      ...historyResult.rows.map((r) => ({
        role: r.role as 'user' | 'assistant',
        content: r.content,
      })),
    ];

    const response = await this.chat(messages);

    await this.db.query(
      `INSERT INTO ai_messages (id, conversation_id, role, content) VALUES ($1, $2, 'assistant', $3)`,
      [uuidv4(), convId, response],
    );

    await this.db.query(
      'UPDATE ai_conversations SET updated_at = NOW() WHERE id = $1',
      [convId],
    );

    return { conversationId: convId, response, role: 'assistant' };
  }

  async getConversations(userId: string, organizationId: string) {
    const result = await this.db.query(
      `SELECT id, title, type, created_at, updated_at
       FROM ai_conversations
       WHERE user_id = $1 AND organization_id = $2
       ORDER BY updated_at DESC LIMIT 50`,
      [userId, organizationId],
    );
    return result.rows;
  }

  async getConversationMessages(conversationId: string, userId: string) {
    const conv = await this.db.findOne('ai_conversations', { id: conversationId, user_id: userId });
    if (!conv) throw new BadRequestException('Conversation not found');

    const result = await this.db.query(
      `SELECT id, role, content, created_at FROM ai_messages
       WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    );
    return result.rows;
  }

  private async chatWithOpenAI(
    messages: ChatMessage[],
    opts: { model?: string; temperature?: number },
  ): Promise<string> {
    const response = await this.openai!.chat.completions.create({
      model: opts.model ?? 'gpt-4o-mini',
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: 4096,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  private async chatWithAnthropic(
    messages: ChatMessage[],
    opts: { model?: string; temperature?: number },
  ): Promise<string> {
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const response = await this.anthropic!.messages.create({
      model: opts.model ?? 'claude-3-haiku-20240307',
      max_tokens: 4096,
      system: systemMessage?.content,
      messages: conversationMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      temperature: opts.temperature ?? 0.7,
    });

    const block = response.content[0];
    return block && block.type === 'text' ? block.text : '';
  }
}
