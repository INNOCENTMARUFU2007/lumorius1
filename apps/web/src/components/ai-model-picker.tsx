'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

interface ModelOption { id: string; label: string; note: string }
interface ProviderInfo { id: 'openai' | 'anthropic'; name: string; configured: boolean; allowsCustomModel: boolean; models: ModelOption[] }
export interface AiSettings {
  provider: 'openai' | 'anthropic';
  model: string;
  autoKnowledgeExtraction: boolean;
  providers: ProviderInfo[];
  embeddings: { provider: 'openai'; configured: boolean };
}

const unwrap = <T,>(body: unknown): T => ((body as { data?: T })?.data ?? body) as T;

export function useAiSettings() {
  const { user } = useAuth();
  return useQuery<AiSettings>({
    queryKey: ['ai', 'settings', user?.organizationId],
    enabled: Boolean(user?.organizationId),
    staleTime: 60_000,
    queryFn: async () => unwrap<AiSettings>((await api.get('/ai/settings')).data),
  });
}

/**
 * Workspace AI engine: OpenAI (any model) or Anthropic Claude. Used by the AI
 * Advisor, Company Brain answers, meetings and every agent. `compact` renders a
 * single-line version for the Agent Command header.
 */
export function AiModelPicker({ compact = false, showAutomation = false }: { compact?: boolean; showAutomation?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const settings = useAiSettings();
  const canEdit = ['owner', 'admin'].includes(String(user?.role ?? '').toLowerCase());

  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai');
  const [model, setModel] = useState('');
  useEffect(() => {
    if (settings.data) {
      setProvider(settings.data.provider);
      setModel(settings.data.model);
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async (input: { provider?: string; model?: string; autoKnowledgeExtraction?: boolean }) =>
      unwrap<AiSettings>((await api.patch('/ai/settings', input)).data),
    onSuccess: (data) => {
      queryClient.setQueryData(['ai', 'settings', user?.organizationId], data);
      toast.success('AI settings saved');
    },
    onError: (error) => {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(typeof message === 'string' ? message : 'Could not save AI settings.');
    },
  });

  if (settings.isPending) return <div className="lm-skeleton h-10 w-full max-w-md" />;
  const providers = Array.isArray(settings.data?.providers) ? settings.data.providers : [];
  if (settings.isError || !settings.data || providers.length === 0) {
    return (
      <p className="text-sm text-destructive">
        AI settings could not be loaded.{' '}
        <button type="button" className="underline" onClick={() => void settings.refetch()}>Retry</button>
      </p>
    );
  }

  const current = providers.find((p) => p.id === provider);
  const presetIds = current?.models.map((m) => m.id) ?? [];
  const isCustom = Boolean(model) && !presetIds.includes(model);
  const dirty = provider !== settings.data.provider || model !== settings.data.model;
  const selectClass = 'h-9 rounded-lg border border-border bg-background px-2.5 text-sm disabled:opacity-60';

  return (
    <div className={cn(compact ? 'flex flex-wrap items-center gap-2' : 'space-y-4')}>
      <div className={cn('flex flex-wrap items-end gap-2', compact && 'items-center')}>
        <label className="text-sm">
          {!compact && <span className="mb-1 block font-medium">Provider</span>}
          <select
            aria-label="AI provider"
            className={selectClass}
            value={provider}
            disabled={!canEdit || save.isPending}
            onChange={(e) => {
              const next = e.target.value as 'openai' | 'anthropic';
              setProvider(next);
              setModel(providers.find((p) => p.id === next)?.models[0]?.id ?? '');
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.configured}>
                {p.name}{p.configured ? '' : ' (no API key)'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {!compact && <span className="mb-1 block font-medium">Model</span>}
          <select
            aria-label="AI model"
            className={selectClass}
            value={isCustom ? '__custom' : model}
            disabled={!canEdit || save.isPending}
            onChange={(e) => setModel(e.target.value === '__custom' ? '' : e.target.value)}
          >
            {current?.models.map((m) => (
              <option key={m.id} value={m.id}>{m.label} · {m.note}</option>
            ))}
            {current?.allowsCustomModel && <option value="__custom">Other OpenAI model…</option>}
          </select>
        </label>
        {current?.allowsCustomModel && (isCustom || model === '') && (
          <label className="text-sm">
            {!compact && <span className="mb-1 block font-medium">Model ID</span>}
            <input
              aria-label="OpenAI model ID"
              className={cn(selectClass, 'w-44 font-mono')}
              placeholder="e.g. gpt-4.1"
              value={model}
              disabled={!canEdit || save.isPending}
              onChange={(e) => setModel(e.target.value.trim())}
            />
          </label>
        )}
        {canEdit && (
          <button
            type="button"
            disabled={!dirty || !model || save.isPending}
            onClick={() => save.mutate({ provider, model })}
            className="h-9 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      {!compact && (
        <p className="text-sm text-muted-foreground">
          {canEdit ? 'Used by the AI Advisor, Company Brain answers, meeting summaries and every AI agent.' : 'Only an owner or admin can change the AI model.'}{' '}
          Document search always uses OpenAI embeddings{settings.data.embeddings?.configured ? '.' : ', which needs OPENAI_API_KEY on the server.'}
        </p>
      )}

      {showAutomation && (
        <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-primary"
            checked={settings.data.autoKnowledgeExtraction}
            disabled={!canEdit || save.isPending}
            onChange={(e) => save.mutate({ autoKnowledgeExtraction: e.target.checked })}
          />
          <span>
            <span className="block font-medium">Build the Knowledge Graph automatically after each upload</span>
            <span className="block text-muted-foreground">Off by default. When off, AI extraction only runs when someone presses “Sync documents” on the Knowledge Graph page, so tokens are only spent when you ask.</span>
          </span>
        </label>
      )}
    </div>
  );
}
