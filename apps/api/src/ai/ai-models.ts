import { BadRequestException } from '@nestjs/common';
import type { SqlRunner } from '../database/database.service';

/**
 * Lumorius runs on exactly two models, chosen by the owner:
 *   OpenAI    GPT-4.1           (default)
 *   Anthropic Claude Haiku 5.5  (lower cost)
 * Embeddings for document search always use OpenAI, because Anthropic does not
 * offer an embeddings endpoint.
 */
export type AiProvider = 'openai' | 'anthropic';
export const AI_PROVIDERS: readonly AiProvider[] = ['openai', 'anthropic'];

export interface ModelOption {
  id: string;
  label: string;
  note: string;
}

/** Claude model IDs are complete as written (no date suffix). */
export const ANTHROPIC_MODELS: ModelOption[] = [
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Anthropic, lower cost' },
];

export const OPENAI_MODELS: ModelOption[] = [
  { id: 'gpt-4.1', label: 'GPT-4.1', note: 'OpenAI' },
];

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  openai: 'gpt-4.1',
  anthropic: 'claude-haiku-5-5',
};

const allowedFor = (provider: AiProvider) => (provider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS);

/** A placeholder such as "sk-ant-..." is not a key; real provider keys are much longer. */
export function looksLikeRealKey(value: string | undefined | null): value is string {
  const key = String(value ?? '').trim();
  return key.length >= 20 && !/x{6,}|\.\.\.|your[-_]?key|changeme|placeholder/i.test(key);
}

export function normalizeProvider(value: unknown): AiProvider {
  const provider = String(value ?? '').trim().toLowerCase();
  if (provider === 'openai' || provider === 'anthropic') return provider;
  throw new BadRequestException('AI provider must be "openai" or "anthropic".');
}

export function normalizeModel(provider: AiProvider, value: unknown): string {
  const model = String(value ?? '').trim();
  if (!model) return DEFAULT_MODEL[provider];
  const allowed = allowedFor(provider);
  if (!allowed.some((m) => m.id === model)) {
    throw new BadRequestException(`Choose ${allowed.map((m) => m.id).join(' or ')}.`);
  }
  return model;
}

export interface WorkspaceAiSettings {
  provider: AiProvider | null;
  model: string | null;
  /** Run AI knowledge-graph extraction automatically after each upload. Off by default to save tokens. */
  autoKnowledgeExtraction: boolean;
}

export async function readWorkspaceAiSettings(db: SqlRunner, organizationId: string): Promise<WorkspaceAiSettings> {
  const res = await db.query<{ ai: Record<string, unknown> | null }>(
    `SELECT settings -> 'ai' AS ai FROM organizations WHERE id = $1`,
    [organizationId],
  );
  const ai = res.rows[0]?.ai ?? {};
  const provider = ai.provider === 'openai' || ai.provider === 'anthropic' ? (ai.provider as AiProvider) : null;
  return {
    provider,
    // Only the approved model counts; a previously saved model (e.g. Sonnet) falls back to the default.
    model: provider && allowedFor(provider).some((m) => m.id === ai.model) ? String(ai.model) : null,
    autoKnowledgeExtraction: ai.autoKnowledgeExtraction === true,
  };
}
