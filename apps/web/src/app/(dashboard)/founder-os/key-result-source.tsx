'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2, Radio, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

export type KeyResultSourceOption = {
  id: string;
  label: string;
  financial: boolean;
  kind: 'flow' | 'snapshot';
  origin: string;
  lowerIsBetter: boolean;
  available: boolean;
};

type Record_ = Record<string, unknown>;

export function useKeyResultSources() {
  return useQuery({
    queryKey: ['founder-os', 'kr-sources'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const payload = (await api.get('/founder-os/key-result-sources')).data;
      const data = payload?.data ?? payload;
      return (Array.isArray(data) ? data : []) as KeyResultSourceOption[];
    },
  });
}

const apiError = (error: unknown, fallback: string) => {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join(' ') : message || fallback;
};

/** "Track progress from" picker: manual updates or a live organisation metric. */
export function SourceSelect({
  id, value, onChange, sources, disabled,
}: { id: string; value: string; onChange: (value: string) => void; sources: KeyResultSourceOption[]; disabled?: boolean }) {
  const financial = sources.filter((source) => source.financial && source.available);
  const workspace = sources.filter((source) => !source.financial && source.available);
  return (
    <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-border-strong bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-violet-500">
      <option value="manual">Update manually</option>
      {financial.length > 0 && (
        <optgroup label="Financial records (Executive Intelligence)">
          {financial.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
        </optgroup>
      )}
      {workspace.length > 0 && (
        <optgroup label="Workspace activity">
          {workspace.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
        </optgroup>
      )}
    </select>
  );
}

/** One line explaining what a selected source measures. */
export function sourceHint(source: KeyResultSourceOption | undefined, quarter: string) {
  if (!source) return 'You update the current value yourself.';
  const how = source.kind === 'snapshot' ? 'uses the value today' : `counts ${quarter} so far`;
  return `Updates automatically from ${source.origin.toLowerCase()} and ${how}.${source.lowerIsBetter ? ' Lower is better: set a target below the starting value.' : ''}`;
}

const timeAgo = (value: unknown) => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};

/** Shows where a key result's value comes from, whether data exists, and lets you link or unlink it. */
export function KeyResultSourceControl({ keyResult, sources }: { keyResult: Record_; sources: KeyResultSourceOption[] }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState('ei:mrr');
  const [currency, setCurrency] = useState(String(keyResult.source_currency ?? 'USD').trim() || 'USD');
  const id = String(keyResult.id ?? '');
  const dataSource = String(keyResult.data_source ?? 'manual');
  const linked = dataSource !== 'manual';
  const source = sources.find((item) => item.id === dataSource);
  const chosen = sources.find((item) => item.id === choice);

  const save = useMutation({
    mutationFn: (next: { dataSource: string; sourceCurrency?: string }) => api.patch(`/founder-os/okrs/key-results/${encodeURIComponent(id)}/source`, next),
    onSuccess: async (_result, next) => {
      toast.success(next.dataSource === 'manual' ? 'Key result switched to manual updates.' : 'Key result now updates from your data.');
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ['founder-os'] });
    },
    onError: (error) => toast.error(apiError(error, 'The key result could not be updated.')),
  });

  if (!id) return null;

  return (
    <div className="mt-2 text-xs">
      {linked ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">
            <Radio className="h-3 w-3" /> Live
          </span>
          <span className="text-muted-foreground">
            {source?.label ?? dataSource}{keyResult.source_currency ? ` (${String(keyResult.source_currency).trim()})` : ''}
            {timeAgo(keyResult.synced_at) ? ` · updated ${timeAgo(keyResult.synced_at)}` : ''}
          </span>
          <button type="button" disabled={save.isPending} onClick={() => save.mutate({ dataSource: 'manual' })}
            className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50">
            <Unlink className="h-3 w-3" /> Switch to manual
          </button>
          {keyResult.source_available === false && (
            <p className="w-full text-amber-700 dark:text-amber-300">
              No data yet from {source?.origin.toLowerCase() ?? 'this source'} for this quarter.{' '}
              {source?.financial && <Link href="/executive-intelligence?view=sources" className="font-medium underline underline-offset-2">Import it in Executive Intelligence</Link>}
            </p>
          )}
        </div>
      ) : editing ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg border border-violet-500/20 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (choice === 'manual') { setEditing(false); return; }
            if (chosen?.financial && !/^[A-Za-z]{3}$/.test(currency)) { toast.error('Enter a three-letter currency, for example USD.'); return; }
            save.mutate({ dataSource: choice, ...(chosen?.financial ? { sourceCurrency: currency.toUpperCase() } : {}) });
          }}
        >
          <label className="min-w-[200px] flex-1 text-muted-foreground">Track from
            <div className="mt-1"><SourceSelect id={`link-${id}`} value={choice} onChange={setChoice} sources={sources} disabled={save.isPending} /></div>
          </label>
          {chosen?.financial && (
            <label className="w-24 text-muted-foreground">Currency
              <input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                className="mt-1 block w-full rounded-lg border border-border-strong bg-card px-2.5 py-2 text-sm uppercase text-foreground" />
            </label>
          )}
          <button type="submit" disabled={save.isPending} className="inline-flex h-[38px] items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Link
          </button>
          <button type="button" onClick={() => setEditing(false)} className="h-[38px] rounded-lg px-2.5 text-muted-foreground hover:bg-muted">Cancel</button>
        </form>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-violet-700 underline-offset-2 hover:underline dark:text-violet-300">
          <Link2 className="h-3 w-3" /> Link to live data
        </button>
      )}
    </div>
  );
}
