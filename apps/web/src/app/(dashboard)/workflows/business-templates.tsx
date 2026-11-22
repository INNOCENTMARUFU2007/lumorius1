'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

type Template = { id: string; name: string; description: string; trigger: string; tasks: readonly string[] };

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Started manually',
  'financial.import_committed': 'When financial records are committed',
  'meeting.completed': 'When a meeting is completed',
  'decision.approved': 'When a decision is approved',
  'document.indexed': 'When a document is indexed',
  'schedule.weekly': 'Every Monday at 09:00',
};

const PROFIT_MISSION = 'What can we do to improve profit this quarter? Compare revenue, costs and margins across our financial records, documents and meetings, and recommend the highest-impact actions with first steps.';

function errorText(error: unknown): string {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(message)) return message.join(' ');
  return message || 'The draft could not be created. Try again.';
}

/** Ready-made workflows for Lumorius modules; each creates an inactive draft. */
export default function BusinessTemplates({ onCreated }: { onCreated?: () => void }) {
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ['workflow-templates'],
    queryFn: async () => (await api.get<{ data: Template[] }>('/workflows/templates')).data.data,
    retry: false,
  });
  const create = useMutation({
    mutationFn: (id: string) => api.post('/workflows/templates/' + id),
    onSuccess: async () => {
      toast.success('Draft workflow created. Review its steps, then activate it.');
      await cache.invalidateQueries({ queryKey: ['workflows'] });
      onCreated?.();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Workflow templates</h2>
        <p className="mt-1 text-sm text-muted-foreground">Each template creates a draft with review tasks. Nothing runs until a manager activates it.</p>
      </div>
      {list.isPending && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} aria-hidden="true" className="lm-skeleton h-48 rounded-xl" />)}</div>}
      {list.isError && <p role="alert" className="rounded-xl border border-destructive/30 bg-card p-4 text-sm text-destructive">Templates could not be loaded. Refresh to try again.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.data?.map((template) => (
          <article key={template.id} className="flex flex-col rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">{template.name}</h3>
            <p className="mt-1 text-xs font-medium text-primary">{TRIGGER_LABELS[template.trigger] ?? template.trigger}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{template.description}</p>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs leading-5 text-foreground/80">
              {template.tasks.map((task) => <li key={task}>{task}</li>)}
            </ol>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
              <button type="button" disabled={create.isPending} onClick={() => create.mutate(template.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {create.isPending && create.variables === template.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create draft
              </button>
              {template.id === 'profit-improvement' && (
                <Link href={'/agent-command?agent=financial-analyst&mission=' + encodeURIComponent(PROFIT_MISSION)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
                  <Sparkles className="h-3.5 w-3.5" /> Plan with the AI analyst
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
