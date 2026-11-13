import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type AiPricingOperationType = 'chat' | 'embedding' | 'transcription';

export interface CreateAiPricingInput {
  provider: string;
  model: string;
  operationType: AiPricingOperationType;
  effectiveFrom?: string;
  inputUsdPer1mTokens?: string | number | null;
  outputUsdPer1mTokens?: string | number | null;
  audioUsdPerMinute?: string | number | null;
}

export interface AiPricingFilters {
  provider?: string;
  model?: string;
  operationType?: string;
}

export interface AiPricingRow {
  id: string;
  provider: string;
  model: string;
  operation_type: AiPricingOperationType;
  input_usd_per_1m_tokens: string | null;
  output_usd_per_1m_tokens: string | null;
  audio_usd_per_minute: string | null;
  effective_from: Date | string;
  created_by: string | null;
  created_at: Date | string;
}

@Injectable()
export class AiFinancialService {
  constructor(private readonly db: DatabaseService) {}

  async listPricing(filters: AiPricingFilters = {}): Promise<AiPricingRow[]> {
    const provider = this.optionalFilter(filters.provider, 'provider', 80);
    const model = this.optionalFilter(filters.model, 'model', 200);
    const operationType = this.optionalFilter(filters.operationType, 'operationType', 20);

    if (operationType && !['chat', 'embedding', 'transcription'].includes(operationType)) {
      throw new BadRequestException('Unsupported AI pricing operation type.');
    }

    const result = await this.db.query<AiPricingRow>(
      `SELECT
         id, provider, model, operation_type,
         input_usd_per_1m_tokens, output_usd_per_1m_tokens,
         audio_usd_per_minute, effective_from, created_by, created_at
       FROM ai_model_pricing
       WHERE ($1::text IS NULL OR provider = $1)
         AND ($2::text IS NULL OR model = $2)
         AND ($3::text IS NULL OR operation_type = $3)
       ORDER BY provider ASC, model ASC, operation_type ASC,
                effective_from DESC, created_at DESC
       LIMIT 200`,
      [provider, model, operationType],
    );

    return result.rows;
  }

  async createPricing(input: CreateAiPricingInput, createdBy?: string): Promise<AiPricingRow> {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('AI pricing input is required.');
    }

    const provider = this.requiredString(input.provider, 'provider', 80).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(provider)) {
      throw new BadRequestException('Provider must contain only lowercase letters, numbers, underscores or hyphens.');
    }

    const model = this.requiredString(input.model, 'model', 200);
    if (/\s/.test(model)) {
      throw new BadRequestException('Model identifiers must not contain whitespace.');
    }

    const operationType = input.operationType;
    if (!['chat', 'embedding', 'transcription'].includes(operationType)) {
      throw new BadRequestException('operationType must be chat, embedding or transcription.');
    }

    const inputRate = this.parseRate(input.inputUsdPer1mTokens, 'inputUsdPer1mTokens');
    const outputRate = this.parseRate(input.outputUsdPer1mTokens, 'outputUsdPer1mTokens');
    const audioRate = this.parseRate(input.audioUsdPerMinute, 'audioUsdPerMinute');

    if (operationType === 'chat' && (inputRate === null || outputRate === null || audioRate !== null)) {
      throw new BadRequestException('Chat pricing requires input and output token rates; audio rate must be omitted.');
    }
    if (operationType === 'embedding' && (inputRate === null || outputRate !== null || audioRate !== null)) {
      throw new BadRequestException('Embedding pricing requires only an input token rate.');
    }
    if (operationType === 'transcription' && (audioRate === null || inputRate !== null || outputRate !== null)) {
      throw new BadRequestException('Transcription pricing requires only an audio-per-minute rate.');
    }

    const effectiveFrom = this.parseEffectiveFrom(input.effectiveFrom);
    if (createdBy && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(createdBy)) {
      throw new BadRequestException('Authenticated administrator identity is not a valid user UUID.');
    }

    const result = await this.db.query<AiPricingRow>(
      `INSERT INTO ai_model_pricing (
         provider, model, operation_type,
         input_usd_per_1m_tokens, output_usd_per_1m_tokens,
         audio_usd_per_minute, effective_from, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (provider, model, operation_type, effective_from) DO NOTHING
       RETURNING
         id, provider, model, operation_type,
         input_usd_per_1m_tokens, output_usd_per_1m_tokens,
         audio_usd_per_minute, effective_from, created_by, created_at`,
      [provider, model, operationType, inputRate, outputRate, audioRate, effectiveFrom, createdBy ?? null],
    );

    if (!result.rows[0]) {
      throw new ConflictException('A pricing version already exists for this provider, model, operation type and effective timestamp. Pricing versions are immutable.');
    }

    return result.rows[0];
  }

  private requiredString(value: unknown, field: string, maxLength: number): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} is required and must be text.`);
    }
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) {
      throw new BadRequestException(`${field} must contain between 1 and ${maxLength} characters.`);
    }
    return normalized;
  }

  private optionalFilter(value: unknown, field: string, maxLength: number): string | null {
    if (value === undefined || value === null || value === '') return null;
    return this.requiredString(value, field, maxLength);
  }

  private parseRate(value: unknown, field: string): string | null {
    if (value === undefined || value === null || value === '') return null;
    const raw = typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '';

    if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,12})?$/.test(raw)) {
      throw new BadRequestException(`${field} must be a non-negative decimal with up to 8 integer and 12 fractional digits.`);
    }
    return raw;
  }

  private parseEffectiveFrom(value?: string): Date {
    if (value === undefined || value === null || value === '') return new Date();
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
      throw new BadRequestException('effectiveFrom must be an ISO-8601 timestamp with an explicit timezone.');
    }
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
      throw new BadRequestException('effectiveFrom is not a valid timestamp.');
    }
    return parsed;
  }
}