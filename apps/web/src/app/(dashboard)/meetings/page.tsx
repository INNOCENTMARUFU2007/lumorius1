'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import {
  AlertCircle, ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardList, Clock3, FileText, Loader2, Mic, Search, Trash2, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import api from '@/lib/api';
import { repairDisplayText } from '@/lib/repair-text';
import { PageHeader } from '@/components/ui/primitives';

const PAGE_SIZE = 9;
const ACTIVE = ['recording', 'uploading', 'processing', 'transcribing', 'analyzing'] as const;
const FILTERS = [
  { id: 'all', label: 'All meetings', icon: CalendarDays, color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300' },
  { id: 'completed', label: 'Completed', icon: CheckCircle2, color: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
  { id: 'in_flight', label: 'In progress', icon: Clock3, color: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  { id: 'failed', label: 'Needs attention', icon: AlertCircle, color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
] as const;
const MODES = [
  { id: 'recording', label: 'Recording' }, { id: 'transcript', label: 'Transcript' }, { id: 'notes', label: 'Notes' },
] as const;
const inputClass = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
type Filter = typeof FILTERS[number]['id'];
type Mode = typeof MODES[number]['id'];

type Meeting = {
  id: string;
  title?: string | null;
  status: string;
  created_at: string;
  created_by_name?: string | null;
  duration_seconds?: number | string | null;
  summary?: string | null;
  action_item_count?: number | string;
  source_type?: string;
};

type MeetingPage = { data: Meeting[]; total: number; totalPages: number; statusCounts: Record<string, number> };
type Commitment = {
  action_id: string;
  meeting_id: string;
  meeting_title?: string | null;
  action_text: string;
  due_at?: string | null;
  review_status: string;
  task_status?: string | null;
};
type Envelope<T> = { data: T };

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function apiMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const value = (error.response as { data?: { message?: unknown } } | undefined)?.data?.message;
    if (typeof value === 'string') return value;
  }
  return fallback;
}

function statusName(value?: string | null) {
  return (value ?? 'unknown').replaceAll('_', ' ');
}

export default function MeetingsPage() {
  const { user } = useAuth();
  if (!user) return null;
  const account = user.organizationId + '/' + user.id;
  return <MeetingsDashboard key={account} account={account} />;
}

function MeetingsDashboard({ account }: { account: string }) {
  const cache = useQueryClient();
  const [mode, setMode] = useState<Mode>('recording');
  const [title, setTitle] = useState('');
  const [consent, setConsent] = useState(false);
  const [content, setContent] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearchTerm(search.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const summary = useQuery({
    queryKey: ['meetings', 'dashboard-summary', account],
    queryFn: async ({ signal }) => (await api.get<Envelope<MeetingPage>>('/meetings', { signal, params: { pageSize: 1 } })).data.data,
    refetchInterval: (query) => ACTIVE.some((status) => (query.state.data?.statusCounts?.[status] ?? 0) > 0) ? 8000 : false,
  });
  const counts = summary.data?.statusCounts;
  const active = counts && ACTIVE.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  const library = useQuery({
    queryKey: ['meetings', 'dashboard-library', account, searchTerm, filter, page],
    queryFn: async ({ signal }) => (await api.get<Envelope<MeetingPage>>('/meetings', {
      signal, params: { page, pageSize: PAGE_SIZE, search: searchTerm || undefined, status: filter === 'all' ? undefined : filter },
    })).data.data,
    refetchInterval: active ? 8000 : false,
  });
  const reviewQueue = useQuery({
    queryKey: ['meetings', 'dashboard-commitments', account],
    queryFn: async ({ signal }) => (await api.get<Envelope<{ commitments: Commitment[] }>>('/meetings/intelligence/commitments', {
      signal, params: { limit: 5 },
    })).data.data.commitments,
    refetchInterval: active ? 15000 : false,
  });
  const lastPage = Math.max(1, library.data?.totalPages ?? 1);
  useEffect(() => {
    if (library.data && page > lastPage) setPage(lastPage);
  }, [library.data, page, lastPage]);

  const refresh = () => void cache.invalidateQueries({ queryKey: ['meetings'] });
  const ingest = useMutation({
    mutationFn: async (file?: File) => {
      if (file) {
        if (!consent) throw new Error('Confirm participant consent before uploading.');
        const form = new FormData();
        form.append('file', file);
        form.append('consentConfirmed', 'true');
        if (title.trim()) form.append('title', title.trim());
        await api.post('/meetings/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post(mode === 'notes' ? '/meetings/notes' : '/meetings/transcripts', {
          title: title.trim() || undefined, content: content.trim(),
        });
      }
    },
    onSuccess: (_, file) => {
      toast.success('Meeting queued for analysis');
      setTitle('');
      if (file) setConsent(false);
      else setContent('');
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete('/meetings/' + encodeURIComponent(id)),
    onSuccess: () => { toast.success('Meeting deleted'); refresh(); },
    onError: (error) => toast.error(apiMessage(error, 'Could not delete the meeting.')),
  });
  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    onDropAccepted: ([file]) => { if (file && !ingest.isPending) ingest.mutate(file); },
    onDropRejected: ([item]) => toast.error(item?.errors[0]?.message ?? 'Select a supported recording.'),
    accept: { 'audio/*': [], 'video/*': [] },
    multiple: false,
    maxSize: 500 * 1024 * 1024,
    noClick: true,
    disabled: !consent || ingest.isPending,
  });

  const stats = {
    all: summary.data?.total,
    completed: counts && (counts.completed ?? 0),
    in_flight: active,
    failed: counts && (counts.failed ?? 0),
  };
  const meetings = library.data?.data ?? [];
  const selectFilter = (id: Filter) => { setFilter(id); setPage(1); };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-8">
      <PageHeader
        hero
        icon={Mic}
        title="Meeting Intelligence"
        description="Turn recordings, transcripts, and notes into summaries, decisions, and commitments your team can follow up on."
        actions={<>
          <a href="#meeting-import" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-glow-primary transition hover:bg-primary/90"><Upload className="h-4 w-4" /> Add a meeting</a>
          <a href="#meeting-review" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card/60 px-3.5 text-sm font-medium transition hover:bg-muted"><ClipboardList className="h-4 w-4" /> Open commitments</a>
        </>}
      />

      <section aria-label="Meeting counts" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {FILTERS.map(({ id, label, icon: Icon, color }) => (
          <a key={id} href="#meeting-library" onClick={() => { setSearch(''); setSearchTerm(''); selectFilter(id); }} className="rounded-2xl border border-border bg-card p-4 transition hover:border-brand-500/45">
            <span className={`inline-flex rounded-lg p-2 ${color}`}><Icon className="h-4 w-4" /></span>
            <p className="mt-3 text-2xl font-semibold tabular-nums">{stats[id]?.toLocaleString() ?? '—'}</p>
            <p className="mt-1 text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
          </a>
        ))}
      </section>
      {summary.isError && <p role="status" className="text-sm text-muted-foreground">Meeting counts are unavailable. <button type="button" className="underline" onClick={() => void summary.refetch()}>Retry</button></p>}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <section id="meeting-import" className="scroll-mt-5 space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Upload className="h-5 w-5 text-brand-500" /> Add a meeting</h2>
          <div aria-label="Source type" className="flex flex-wrap gap-1 rounded-xl bg-muted/60 p-1">
            {MODES.map(({ id, label }) => <button key={id} type="button" aria-pressed={mode === id} disabled={ingest.isPending} onClick={() => { setMode(id); ingest.reset(); }} className={`rounded-lg px-3 py-1.5 text-sm ${mode === id ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
          </div>
          <label className="block space-y-1 text-xs font-medium">
            <span>Meeting title (optional)</span>
            <input value={title} maxLength={300} disabled={ingest.isPending} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Product planning" className={inputClass} />
          </label>
          {mode === 'recording' ? <>
            <label className="flex gap-2.5 rounded-xl bg-muted/45 p-3 text-xs leading-5">
              <input type="checkbox" checked={consent} disabled={ingest.isPending} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>I confirm that I have obtained the required participant consent for this recording to be uploaded and processed using AI, and that the upload complies with my organisation’s policies.</span>
            </label>
            <div {...getRootProps()} className={`rounded-xl border border-dashed p-4 text-center ${isDragActive ? 'border-brand-500 bg-brand-500/10' : 'border-border'}`}>
              <input {...getInputProps()} />
              <p className="text-sm font-medium">{isDragActive ? 'Drop recording to upload' : 'Drop an audio or video file'}</p>
              <p className="mt-1 text-xs text-muted-foreground">Up to 500 MB</p>
              <button type="button" onClick={open} disabled={!consent || ingest.isPending} className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">{ingest.isPending ? 'Uploading…' : 'Choose recording'}</button>
            </div>
          </> : (
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (content.trim() && !ingest.isPending) ingest.mutate(undefined); }}>
              <label className="block space-y-1 text-xs font-medium">
                <span>{mode === 'notes' ? 'Meeting notes' : 'Transcript'}</span>
                <textarea required value={content} maxLength={1_000_000} rows={5} onChange={(e) => setContent(e.target.value)} disabled={ingest.isPending} className={inputClass} />
              </label>
              <button type="submit" disabled={!content.trim() || ingest.isPending} className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{ingest.isPending ? 'Importing…' : 'Import and analyse'}</button>
            </form>
          )}
          {ingest.isError && <p role="alert" className="text-sm text-destructive">{apiMessage(ingest.error, 'Meeting import failed. Check the source and try again.')}</p>}
        </section>

        <section id="meeting-review" className="scroll-mt-5 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><ClipboardList className="h-5 w-5 text-brand-500" /> Open commitments</h2>
          <p className="mt-1 text-sm text-muted-foreground">Review meeting follow-ups, with the earliest due dates first.</p>
          {reviewQueue.isPending ? <p className="mt-4 text-sm text-muted-foreground">Loading commitments…</p> : reviewQueue.isError ? (
            <p className="mt-4 text-sm text-muted-foreground">Commitments could not be loaded. <button type="button" className="underline" onClick={() => void reviewQueue.refetch()}>Retry</button></p>
          ) : !reviewQueue.data.length ? <p className="mt-4 rounded-xl bg-muted/45 p-4 text-sm text-muted-foreground">No open meeting commitments.</p> : (
            <ul className="mt-3 divide-y divide-border">
              {reviewQueue.data.map((item) => (
                <li key={item.action_id}>
                  <Link href={`/meetings/${encodeURIComponent(item.meeting_id)}#meeting-actions`} className="group flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted/60">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{repairDisplayText(item.action_text)}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{repairDisplayText(item.meeting_title || 'Untitled meeting')}{item.due_at && formatDate(item.due_at) ? ` · Due ${formatDate(item.due_at)}` : ''}</p>
                    </div>
                    <span className="rounded-md bg-muted px-2 py-1 text-xs capitalize text-muted-foreground">{statusName(item.task_status ?? item.review_status)}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand-500" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section id="meeting-library" className="scroll-mt-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-semibold">Meeting library</h2>
          <button type="button" onClick={refresh} disabled={library.isFetching} className="rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">Refresh</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input aria-label="Search by meeting title" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by meeting title…" className={inputClass + ' pl-9'} />
          </label>
          <select aria-label="Filter by meeting status" value={filter} onChange={(e) => selectFilter(e.target.value as Filter)} className={inputClass + ' sm:w-44'}>
            {FILTERS.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}
          </select>
        </div>
        {library.isPending ? <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Loading meetings…</p> : library.isError ? (
          <p role="alert" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">Meetings could not be loaded. <button type="button" className="underline" onClick={() => void library.refetch()}>Try again</button></p>
        ) : !meetings.length ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">{searchTerm || filter !== 'all' ? 'No meetings match your filters.' : 'Add a recording, transcript, or notes to start your library.'}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {meetings.map((meeting) => {
              const name = repairDisplayText(meeting.title?.trim() || 'Untitled meeting');
              const minutes = meeting.duration_seconds == null || meeting.duration_seconds === '' ? NaN : Number(meeting.duration_seconds) / 60;
              const items = Number(meeting.action_item_count ?? 0);
              const status = meeting.status;
              const tone = status === 'completed' ? 'bg-teal-500/10 text-teal-700 dark:text-teal-300'
                : status === 'failed' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground';
              return (
                <article key={meeting.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 transition hover:border-brand-500/35">
                  <div className="flex items-start justify-between gap-2">
                    <div className="rounded-lg bg-brand-500/10 p-2 text-brand-500"><FileText className="h-4 w-4" /></div>
                    <span className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${tone}`}>{statusName(status)}</span>
                  </div>
                  <h3 className="mt-3 break-words font-semibold">{name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{[formatDate(meeting.created_at), meeting.source_type && statusName(meeting.source_type), Number.isFinite(minutes) && minutes > 0 ? `${Math.max(1, Math.round(minutes))} min` : '', meeting.created_by_name && repairDisplayText(meeting.created_by_name)].filter(Boolean).join(' · ')}</p>
                  {meeting.summary?.trim() && <p className="mt-3 line-clamp-2 text-sm leading-5 text-muted-foreground">{repairDisplayText(meeting.summary)}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    <Link href={`/meetings/${encodeURIComponent(meeting.id)}`} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500/10 px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500/15 dark:text-brand-300"><ArrowRight className="h-3.5 w-3.5" /> Open meeting</Link>
                    {items > 0 && <span className="text-xs text-muted-foreground">{items} action {items === 1 ? 'item' : 'items'}</span>}
                    <button type="button" disabled={remove.isPending} aria-label={`Delete ${name}`} title="Delete meeting" onClick={() => { if (window.confirm(`Delete “${name}” permanently?`)) remove.mutate(meeting.id); }} className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {library.data && library.data.total > 0 && (
          <nav aria-label="Meeting pages" className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{library.data.total.toLocaleString()} {library.data.total === 1 ? 'meeting' : 'meetings'}</span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page" className="rounded-lg border border-border p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span>Page {page} of {lastPage}</span>
              <button type="button" disabled={page >= lastPage} onClick={() => setPage(page + 1)} aria-label="Next page" className="rounded-lg border border-border p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}
