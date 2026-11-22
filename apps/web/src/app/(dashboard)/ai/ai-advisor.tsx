'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight, Bookmark, BookOpen, Bot, Copy, FileSearch, Loader2,
  MessageCircle, Search, Send, Sparkles, X,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { repairDisplayText } from '@/lib/repair-text';
import AdvisorChat from './advisor-chat';

const MODES = [
  { id: 'ask', label: 'Ask AI', icon: Sparkles, hint: 'Get an answer with citations from company sources.' },
  { id: 'search', label: 'Search', icon: Search, hint: 'Find matching passages in your indexed documents.' },
  { id: 'research', label: 'Research', icon: FileSearch, hint: 'Save evidence as you work. Ask a question across your selected documents.' },
  { id: 'advisor', label: 'Strategy chat', icon: MessageCircle, hint: 'Discuss trade-offs, pressure-test a plan, or continue a saved conversation.' },
] as const;

const PROMPTS = ['What can we do to improve profit?', 'Which costs grew the most recently?', 'What decisions are recorded in our meeting notes?', 'Which commitments still need follow-up?'];
const field = 'w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
const button = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-45';
const MAX_SAVED = 12;

type Mode = typeof MODES[number]['id'];
type QueryMode = Exclude<Mode, 'advisor'>;
type Filters = { type: string; tag: string; days: string; mine: boolean };
type Facets = { types: Array<{ type: string; count: number }>; tags: Array<{ tag: string; count: number }>; total: number };
type Evidence = {
  id: string; citationId: string; documentId?: string; name: string; excerpt: string;
  type?: string; tags: string[]; cited: boolean;
};
type Request = { mode: QueryMode; query: string; filters: Filters; documentIds: string[]; allowGeneralAnswer: boolean };
type Result = { answer?: string; answerMode?: 'grounded' | 'general' | 'no_evidence'; sources: Evidence[] };
type RecordValue = Record<string, unknown>;
const EMPTY_FILTERS: Filters = { type: '', tag: '', days: '', mine: false };

function record(value: unknown): RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordValue : {};
}
function message(error: unknown) {
  const payload = record(record(record(error).response).data).message;
  return typeof payload === 'string' ? payload : 'The request could not be completed. Try again.';
}
function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
function normalizeSource(value: unknown, index: number): Evidence {
  const source = record(value);
  const citationId = stringValue(source.citationId) || `S${index + 1}`;
  const documentId = stringValue(source.documentId ?? source.document_id) || undefined;
  const name = repairDisplayText(stringValue(source.documentName ?? source.document_name ?? record(source.entity).name) || 'Knowledge evidence');
  const excerpt = repairDisplayText(stringValue(source.excerpt ?? source.content));
  const tags = source.tags ?? source.document_tags;
  return {
    id: stringValue(source.chunkId ?? source.chunk_id ?? source.evidenceId) || `${documentId ?? name}:${excerpt}`,
    citationId,
    documentId,
    name,
    excerpt,
    type: stringValue(source.type ?? source.document_type) || undefined,
    tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [],
    cited: source.cited === true,
  };
}

export default function AiAdvisor() {
  const { user, isLoading } = useAuth();
  if (!user) return <p className="p-6 text-sm text-muted-foreground">{isLoading ? 'Loading AI Advisor…' : 'Sign in to use AI Advisor.'}</p>;
  const account = `${user.organizationId}/${user.id}`;
  return <AdvisorWorkspace key={account} account={account} />;
}

function AdvisorWorkspace({ account }: { account: string }) {
  const [mode, setMode] = useState<Mode>('advisor');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [saved, setSaved] = useState<Evidence[]>([]);
  const [scope, setScope] = useState<Array<{ id: string; name: string }>>([]);
  const [citedOnly, setCitedOnly] = useState(false);
  const [generalFallback, setGeneralFallback] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const selectedMode = MODES.find((item) => item.id === mode)!;
  const ModeIcon = selectedMode.icon;

  const facets = useQuery({
    queryKey: ['ai', 'indexed-document-facets', account],
    queryFn: async ({ signal }) => (await api.get<{ data: Facets }>('/documents/search-facets', { signal })).data.data,
    enabled: mode !== 'advisor',
    staleTime: 30_000,
  });

  const request = useMutation<Result, unknown, Request>({
    mutationFn: async ({ mode: target, query: text, filters: selected, documentIds, allowGeneralAnswer }) => {
      const options = {
        type: selected.type || undefined,
        tag: selected.tag || undefined,
        createdAfter: selected.days ? new Date(Date.now() - Number(selected.days) * 86_400_000).toISOString() : undefined,
        myHistory: selected.mine || undefined,
        documentIds: documentIds.length ? documentIds : undefined,
      };
      if (target !== 'ask') {
        const { data } = await api.post<{ data: unknown[] }>('/documents/search', { query: text, topK: target === 'research' ? 20 : 12, ...options });
        if (!Array.isArray(data.data)) throw new Error('Unexpected search response');
        return { sources: data.data.map(normalizeSource) };
      }
      const { data } = await api.post<{ data: { answer: string; answerMode?: Result['answerMode']; sources?: unknown[]; knowledgeSources?: unknown[] } }>('/documents/ask', { question: text, allowGeneralAnswer, ...options });
      return {
        answer: data.data.answer,
        answerMode: data.data.answerMode,
        sources: [...(data.data.sources ?? []), ...(data.data.knowledgeSources ?? [])].map(normalizeSource),
      };
    },
  });
  const documentIds = scope.map(({ id }) => id);
  const hasFilters = Boolean(filters.type || filters.tag || filters.days || filters.mine);
  const allowGeneralAnswer = mode === 'ask' && generalFallback && !hasFilters && !documentIds.length;
  const current = request.variables?.mode === mode && request.variables.query === query.trim()
    && request.variables.allowGeneralAnswer === allowGeneralAnswer
    && JSON.stringify(request.variables.filters) === JSON.stringify(filters)
    && JSON.stringify(request.variables.documentIds) === JSON.stringify(documentIds);
  const result = current ? request.data : undefined;
  const visibleSources = (result?.sources ?? []).filter((source) => !citedOnly || source.cited);
  const citedIds = new Set(result?.sources.map(({ citationId }) => citationId));

  function changeMode(next: Mode) {
    setMode(next);
    setCitedOnly(false);
    if (next !== 'ask') setScope([]);
  }

  function submit(event?: FormEvent<HTMLFormElement>, text = query) {
    event?.preventDefault();
    if (mode === 'advisor' || !text.trim() || request.isPending) return;
    setQuery(text.trim());
    setCitedOnly(false);
    request.mutate({ mode, query: text.trim(), filters, documentIds, allowGeneralAnswer });
  }

  function askAbout(sources: Evidence[]) {
    const documents = new Map<string, string>();
    for (const source of sources) if (source.documentId) documents.set(source.documentId, source.name);
    if (!documents.size) return;
    changeMode('ask');
    setFilters(EMPTY_FILTERS);
    setScope(Array.from(documents, ([id, name]) => ({ id, name })));
    setQuery('');
    // The composer stays mounted when switching between document modes.
    input.current?.focus();
    input.current?.scrollIntoView({ block: 'center' });
  }

  function toggleSaved(source: Evidence) {
    if (saved.some((entry) => entry.id === source.id)) setSaved(saved.filter((entry) => entry.id !== source.id));
    else if (saved.length < MAX_SAVED) setSaved([...saved, source]);
  }

  async function copyAnswer() {
    if (!result?.answer) return;
    const references = result.sources.filter((source) => source.cited).map((source) => `[${source.citationId}] ${source.name}`);
    try {
      await navigator.clipboard.writeText([query, result.answer, references.length ? 'Sources\n' + references.join('\n') : ''].filter(Boolean).join('\n\n'));
      toast.success('Answer copied');
    } catch {
      toast.error('Could not copy the answer');
    }
  }

  async function openSource(documentId: string) {
    if (opening) return;
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      toast.error('Allow pop-ups to open the source document.');
      return;
    }
    tab.opener = null;
    setOpening(documentId);
    try {
      const { data } = await api.get<{ data: { url: string } }>(`/documents/${encodeURIComponent(documentId)}/download`);
      const url = new URL(data.data.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported source URL');
      tab.location.href = url.href;
    } catch {
      tab.close();
      toast.error('Could not open the document. Its access may have changed.');
    } finally {
      setOpening(null);
    }
  }

  return (
    <main className="mx-auto max-w-[1460px] space-y-5 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">AI Advisor</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
            Ask about your business. Answers draw on your documents, meetings, decisions, tasks and committed financial records, with sources you can check.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/agent-command" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"><Bot className="h-4 w-4" /> Run an agent <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          <Link href="/brain" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"><BookOpen className="h-4 w-4" /> Source library <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <Sparkles className="h-5 w-5 text-cyan-500" />
        <label htmlFor="advisor-tool" className="text-sm font-semibold">Advisor tools</label>
        <select id="advisor-tool" value={mode} onChange={event=>changeMode(event.target.value as Mode)} className="rounded-xl border border-border bg-background px-4 py-2 text-sm">
          <option value="advisor">Conversation & strategy</option><option value="ask">Ask company knowledge</option><option value="search">Find sources</option><option value="research">Research & saved evidence</option>
        </select>
        <p className="text-xs text-muted-foreground">{selectedMode.hint}</p>
        {saved.length>0 && <button onClick={()=>changeMode('research')} className="ml-auto rounded-lg border border-border px-3 py-2 text-xs">{saved.length} saved sources</button>}
      </div>

      <div hidden={mode !== 'advisor'}><AdvisorChat account={account} /></div>
      {mode !== 'advisor' && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            <form onSubmit={(event) => submit(event)} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <label htmlFor="advisor-query" className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold"><ModeIcon className="h-4 w-4 text-brand-500" /> {selectedMode.label}</label>
              {scope.length > 0 && <div className="flex flex-wrap gap-1.5 px-4 pt-3" aria-label="Selected sources">
                {scope.map((doc) => <button type="button" key={doc.id} onClick={() => setScope(scope.filter(({ id }) => id !== doc.id))}
                  aria-label={`Remove source ${doc.name}`} className="inline-flex max-w-full items-center gap-1 rounded-md bg-brand-500/10 px-2 py-1 text-xs text-brand-600 dark:text-brand-300"><span className="truncate">{doc.name}</span><X className="h-3 w-3 shrink-0" /></button>)}
              </div>}
              <textarea id="advisor-query" ref={input} value={query} onChange={(event) => setQuery(event.target.value)} maxLength={2000} rows={3}
                onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}
                placeholder={mode === 'ask' ? 'Ask a question about these sources…' : 'Enter a keyword, topic, or phrase…'}
                className="block w-full resize-y bg-transparent px-4 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40" />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
                <span className="text-xs text-muted-foreground">Enter to submit · Shift + Enter for a new line</span>
                <button type="submit" disabled={!query.trim() || request.isPending} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-45">
                  {request.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {mode === 'ask' ? 'Ask' : 'Find evidence'}
                </button>
              </div>
              {mode === 'ask' && !hasFilters && !scope.length && <label className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                <input type="checkbox" checked={generalFallback} onChange={(event) => setGeneralFallback(event.target.checked)} className="accent-brand-500" />
                Use general AI if company sources do not match
              </label>}
            </form>

            {current && request.isError && <p role="alert" className="rounded-xl border border-destructive/30 bg-card p-4 text-sm text-destructive">{message(request.error)}</p>}
            {request.isPending && <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-brand-500" /> {request.variables?.mode === 'ask' ? 'Finding sources and preparing an answer…' : 'Finding matching passages…'}</p>}
            {!request.isPending && !result && !query && mode === 'ask' && !scope.length && (
              <div className="flex flex-wrap gap-2">{PROMPTS.map((prompt) => <button key={prompt} type="button" onClick={() => submit(undefined, prompt)} className={button}>{prompt}</button>)}</div>
            )}
            {!request.isPending && request.data && !result && query.trim() && <p className="text-xs text-muted-foreground">Run the current query to see results for these settings.</p>}

            {result?.answer && <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{result.answerMode === 'general' ? 'General AI answer' : 'Answer'}</h2><button type="button" onClick={() => void copyAnswer()} className={button}><Copy className="h-3.5 w-3.5" /> Copy answer</button></div>
              {result.answerMode === 'general' && <p className="mt-2 text-xs text-muted-foreground">No matching company sources were used for this answer.</p>}
              <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">
                {result.answer.split(/(\[[SK]\d+\])/g).map((part, index) => {
                  const id = part.slice(1, -1);
                  return /^\[[SK]\d+\]$/.test(part) && citedIds.has(id)
                    ? <a key={index} href={`#advisor-evidence-${id}`} className="font-semibold text-brand-600 underline underline-offset-2 dark:text-brand-300">{part}</a>
                    : part;
                })}
              </div>
            </article>}

            {result && <section className="space-y-2" aria-label="Evidence">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Evidence <span className="ml-1 text-xs font-normal tabular-nums text-muted-foreground">{visibleSources.length}</span></h2>
                {result.answer && result.sources.some(({ cited }) => cited) && <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={citedOnly} onChange={(event) => setCitedOnly(event.target.checked)} className="accent-brand-500" /> Cited only</label>}
              </div>
              {!visibleSources.length && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No matching evidence. Try a different phrase or broaden the filters.</p>}
              {visibleSources.map((source) => {
                const isSaved = saved.some(({ id }) => id === source.id);
                return <article id={`advisor-evidence-${source.citationId}`} key={source.citationId} className="scroll-mt-5 rounded-xl border border-border bg-card p-4 target:border-brand-500">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{source.citationId}</span>
                      <div className="min-w-0"><h3 className="break-words text-sm font-semibold">{source.name}</h3><p className="mt-0.5 text-xs text-muted-foreground">{[source.type?.toUpperCase(), source.cited && 'Cited in answer', ...source.tags].filter(Boolean).join(' · ')}</p></div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {source.documentId && <button type="button" onClick={() => void openSource(source.documentId!)} disabled={Boolean(opening)} className={button}>Open <ArrowUpRight className="h-3.5 w-3.5" /></button>}
                      {source.documentId && mode !== 'ask' && <button type="button" onClick={() => askAbout([source])} className={button}>Ask about this</button>}
                      <button type="button" aria-pressed={isSaved} onClick={() => toggleSaved(source)} disabled={!isSaved && saved.length >= MAX_SAVED} className={button}><Bookmark className={`h-3.5 w-3.5 ${isSaved ? 'fill-current' : ''}`} /> {isSaved ? 'Saved' : 'Save'}</button>
                    </div>
                  </div>
                  {source.excerpt && <p className="mt-3 break-words border-l-2 border-brand-500/40 pl-3 text-sm leading-6 text-muted-foreground">{source.excerpt}</p>}
                </article>;
              })}
            </section>}
          </div>

          <aside className="space-y-3">
            <section aria-label="Source filters" className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Source filters</h2>{hasFilters && <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs underline">Clear</button>}</div>
              <p className="text-xs text-muted-foreground">{typeof facets.data?.total === 'number' ? `${facets.data.total.toLocaleString()} accessible indexed documents` : facets.isError ? 'Source counts unavailable' : 'Loading source counts…'}</p>
              {facets.isError && <button type="button" onClick={() => void facets.refetch()} className="text-xs underline">Retry source counts</button>}
              <label className="block space-y-1 text-xs font-medium"><span>File type</span><select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })} className={field}><option value="">All types</option>{facets.data?.types.map(({ type, count }) => <option key={type} value={type}>{type.toUpperCase()} ({count})</option>)}</select></label>
              <label className="block space-y-1 text-xs font-medium"><span>Tag</span><select value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })} className={field}><option value="">All tags</option>{facets.data?.tags.map(({ tag, count }) => <option key={tag} value={tag}>{tag} ({count})</option>)}</select></label>
              <label className="block space-y-1 text-xs font-medium"><span>Uploaded</span><select value={filters.days} onChange={(e) => setFilters({ ...filters, days: e.target.value })} className={field}><option value="">Any time</option>{[7, 30, 90].map((days) => <option key={days} value={days}>Last {days} days</option>)}</select></label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.checked })} className="accent-brand-500" /> Uploaded by me</label>
            </section>
            {(mode === 'research' || saved.length > 0) && <section aria-label="Saved evidence" className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-1.5 text-sm font-semibold"><Bookmark className="h-4 w-4 text-brand-500" /> Saved evidence</h2><span className="text-xs text-muted-foreground">{saved.length}/{MAX_SAVED}</span></div>
              {!saved.length ? <p className="mt-2 text-xs text-muted-foreground">Save passages from your results to build a shortlist for this session.</p> : <>
                <ul className="mt-2 max-h-64 divide-y divide-border overflow-auto">{saved.map((source) => <li key={source.id} className="flex items-start justify-between gap-2 py-2">
                  <details className="min-w-0"><summary className="cursor-pointer break-words text-xs font-medium">{source.name}</summary><p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{source.excerpt || 'No excerpt available.'}</p></details>
                  <button type="button" onClick={() => toggleSaved(source)} aria-label={`Remove saved passage from ${source.name}`} className="rounded p-0.5 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                </li>)}</ul>
                <button type="button" onClick={() => askAbout(saved)} disabled={!saved.some(({ documentId }) => documentId)} className={button + ' mt-3'}><Sparkles className="h-3.5 w-3.5" /> Ask across saved documents</button>
              </>}
            </section>}
          </aside>
        </div>
      )}
    </main>
  );
}
