'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BookOpen, ChevronDown, Clock3, Copy, FileSearch, Filter, Loader2,
  MessageCircle, Search, Sparkles, Tags, X,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import AdvisorChat from './advisor-chat';

type Mode = 'ask' | 'search' | 'research' | 'advisor';

interface SearchFacets {
  types: Array<{ type: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
  total: number;
}

interface SearchFilters {
  type?: string;
  tag?: string;
  createdAfter?: string;
  myHistory?: boolean;
}

interface Evidence {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  score?: number;
  type?: string;
  tags?: string[];
  createdAt?: string;
}

interface AnswerResult {
  answer: string;
  sources: Evidence[];
  question: string;
  mode: Mode;
  filterKey: string;
}

const MODES: Array<{ id: Mode; label: string; icon: typeof Sparkles; helper: string }> = [
  { id: 'ask', label: 'Ask AI', icon: Sparkles, helper: 'Get a grounded answer from indexed company documents.' },
  { id: 'search', label: 'Company Search', icon: Search, helper: 'Search indexed company knowledge and review ranked evidence.' },
  { id: 'research', label: 'Research', icon: FileSearch, helper: 'Refine evidence by source, tags, document type, and recency.' },
  { id: 'advisor', label: 'Advisor Chat', icon: MessageCircle, helper: 'Continue the existing Lumorius strategy-advisor chat.' },
];

const SUGGESTIONS = [
  'What are the key points in our indexed documents?',
  'Summarize the policies and procedures available to the team.',
  'What decisions or commitments appear in the meeting notes?',
];

function startOfLookback(days: string) {
  if (!days) return undefined;
  return new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString();
}

function errorText(error: unknown) {
  const responseMessage = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(responseMessage)) return responseMessage.join(', ');
  return responseMessage || 'Search could not be completed. Check source availability and try again.';
}

function getFilters(type: string, tag: string, days: string, myHistory: boolean): SearchFilters {
  return {
    type: type || undefined,
    tag: tag || undefined,
    createdAfter: startOfLookback(days),
    myHistory: myHistory || undefined,
  };
}

export default function AiAdvisor() {
  const [mode, setMode] = useState<Mode>('ask');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');
  const [days, setDays] = useState('');
  const [myHistory, setMyHistory] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const docsQuery = useQuery<SearchFacets>({
    queryKey: ['ai', 'indexed-document-facets'],
    queryFn: async () => {
      const response = await api.get('/documents/search-facets');
      return response.data.data;
    },
  });

  const types = useMemo(() => docsQuery.data?.types ?? [], [docsQuery.data]);
  const tags = useMemo(() => docsQuery.data?.tags ?? [], [docsQuery.data]);

  const answerMutation = useMutation({
    mutationFn: async (request: { question: string; mode: Mode; filters: SearchFilters; filterKey: string }) => {
      const response = await api.post('/documents/ask', {
        question: request.question,
        ...request.filters,
      });
      return {
        ...response.data.data,
        question: request.question,
        mode: request.mode,
        filterKey: request.filterKey,
      } as AnswerResult;
    },
  });

  const currentFilterKey = JSON.stringify([type, tag, days, myHistory]);
  const currentResult = answerMutation.data?.mode === mode ? answerMutation.data : null;
  const result = currentResult
    && currentResult.question === query.trim()
    && currentResult.filterKey === currentFilterKey
    ? currentResult
    : null;
  const resultsNeedRefresh = Boolean(currentResult && !result && query.trim());
  const hasFilters = Boolean(type || tag || days || myHistory);
  const returnedTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const source of result?.sources ?? []) {
      for (const sourceTag of source.tags ?? []) counts.set(sourceTag, (counts.get(sourceTag) ?? 0) + 1);
    }
    return counts;
  }, [result]);

  const submit = (event?: FormEvent, value = query) => {
    event?.preventDefault();
    const question = value.trim();
    if (!question || answerMutation.isPending) return;
    answerMutation.mutate({
      question,
      mode,
      filters: getFilters(type, tag, days, myHistory),
      filterKey: currentFilterKey,
    });
  };

  const clearFilters = () => {
    if (answerMutation.isPending) return;
    setType('');
    setTag('');
    setDays('');
    setMyHistory(false);
    if (query.trim()) {
      answerMutation.mutate({
        question: query.trim(),
        mode,
        filters: {},
        filterKey: JSON.stringify(['', '', '', false]),
      });
    }
  };

  const copyAnswer = async () => {
    if (!result?.answer) return;
    try {
      await navigator.clipboard.writeText(result.answer);
      toast.success('Answer copied');
    } catch {
      toast.error('Could not copy the answer');
    }
  };

  const openSource = async (documentId: string) => {
    const sourceWindow = window.open('about:blank', '_blank');
    if (!sourceWindow) {
      toast.error('Allow pop-ups to open the source document.');
      return;
    }
    sourceWindow.opener = null;
    setOpeningId(documentId);
    try {
      const response = await api.get(`/documents/${documentId}/download`);
      const url = response.data.data?.url;
      if (!url) throw new Error('No source URL returned');
      sourceWindow.location.href = url;
    } catch {
      sourceWindow.close();
      toast.error('Could not open this document. Your access may have changed.');
    } finally {
      setOpeningId(null);
    }
  };

  const indexedTotal = docsQuery.data?.total;
  const currentMode = MODES.find((item) => item.id === mode)!;

  return (
    <div className="mx-auto w-full max-w-[1450px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">Company knowledge</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {mode === 'ask' ? 'Ask AI' : mode === 'search' ? 'Company Search' : mode === 'research' ? 'Research' : 'AI Advisor'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{currentMode.helper}</p>
        </div>
        <Link href="/brain" className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted">
          Open source library
        </Link>
      </div>

      <nav aria-label="AI Advisor modes" className="flex flex-wrap gap-2 border-b border-border pb-3">
        {MODES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            aria-pressed={mode === id}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              mode === id ? 'bg-brand-500/10 text-brand-500' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {mode === 'advisor' ? (
        <AdvisorChat />
      ) : (
        <>
          <form onSubmit={(event) => submit(event)} className="rounded-xl border border-brand-500/30 bg-card p-4 shadow-sm sm:p-5">
            <label htmlFor="knowledge-query" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Search your accessible company knowledge
            </label>
            <textarea
              id="knowledge-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={3}
              placeholder="Ask a question or search for a topic in indexed documents…"
              className="w-full resize-y bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1.5 text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    docsQuery.isLoading ? 'bg-amber-500' : docsQuery.isError ? 'bg-red-500' : (indexedTotal ?? 0) > 0 ? 'bg-emerald-500' : 'bg-muted-foreground'
                  }`} />
                  {docsQuery.isLoading
                    ? 'Checking indexed sources…'
                    : docsQuery.isError
                      ? 'Source status unavailable'
                      : (indexedTotal ?? 0) > 0
                        ? `Company Brain · ${indexedTotal} indexed`
                        : 'No indexed documents'}
                </span>
                <span className="text-muted-foreground">No external source connectors are exposed to this search yet.</span>
              </div>
              <button
                type="submit"
                disabled={!query.trim() || answerMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {answerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {mode === 'ask' ? 'Ask AI' : mode === 'search' ? 'Search' : 'Research'}
              </button>
            </div>
          </form>

          {!result && !answerMutation.isPending && (
            <section aria-label="Suggested questions" className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => { setQuery(suggestion); }}
                  className="rounded-full border border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-brand-500/40 hover:text-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/70 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span>File type</span>
                <span className="relative">
                  <select
                    aria-label="Filter by file type"
                    value={type}
                    onChange={(event) => setType(event.target.value)}
                    className="appearance-none rounded-md border border-border bg-card py-1.5 pl-2.5 pr-7 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">All types</option>
                    {types.map(({ type: documentType }) => <option key={documentType} value={documentType}>{documentType.toUpperCase()}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                </span>
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span>Recency</span>
                <span className="relative">
                  <select
                    aria-label="Filter by recency"
                    value={days}
                    onChange={(event) => setDays(event.target.value)}
                    className="appearance-none rounded-md border border-border bg-card py-1.5 pl-2.5 pr-7 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Any time</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                </span>
              </label>
              <label className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                <input
                  type="checkbox"
                  checked={myHistory}
                  onChange={(event) => setMyHistory(event.target.checked)}
                  className="h-3.5 w-3.5 accent-brand-500"
                />
                Uploaded by me
              </label>
              {mode !== 'research' && (
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Tag</span>
                  <span className="relative">
                    <select
                      aria-label="Filter by document tag"
                      value={tag}
                      onChange={(event) => setTag(event.target.value)}
                      className="appearance-none rounded-md border border-border bg-card py-1.5 pl-2.5 pr-7 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">All tags</option>
                      {tags.map(({ tag: documentTag }) => <option key={documentTag} value={documentTag}>{documentTag}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  </span>
                </label>
              )}
            </div>
            <div className="flex items-center gap-2">
              {mode === 'research' && (
                <button
                  type="button"
                  onClick={() => setShowFilters((visible) => !visible)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Filter className="h-3.5 w-3.5" />
                  {showFilters ? 'Hide filters' : 'Show filters'}
                </button>
              )}
              {hasFilters && (
                <button type="button" onClick={clearFilters} disabled={answerMutation.isPending} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                  <X className="h-3.5 w-3.5" />
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {answerMutation.isError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorText(answerMutation.error)}
            </div>
          )}
          {resultsNeedRefresh && !answerMutation.isPending && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-foreground">
              <span>The query or filters changed. Previous results are hidden until they are refreshed.</span>
              <button type="button" onClick={() => submit()} disabled={!query.trim()} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
                Run current query
              </button>
            </div>
          )}

          <div className={`grid grid-cols-1 gap-4 ${mode === 'research' && showFilters ? 'xl:grid-cols-[minmax(0,1fr)_260px]' : ''}`}>
            <section aria-label="Answer and evidence" className="min-w-0 space-y-4">
              {answerMutation.isPending ? (
                <div className="space-y-4 rounded-xl border border-border bg-card p-5" aria-live="polite">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
                    Searching indexed documents and preparing an answer…
                  </div>
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                </div>
              ) : result ? (
                <>
                  {mode !== 'ask' && (
                    <div className="rounded-lg border border-border bg-card px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Query</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{result.question}</p>
                    </div>
                  )}
                  <article className="rounded-xl border border-border bg-card p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-brand-500/10 p-2 text-brand-500"><Sparkles className="h-4 w-4" /></span>
                        <div>
                          <h2 className="font-semibold text-foreground">{mode === 'ask' ? 'AI answer' : 'AI summary'}</h2>
                          <p className="text-xs text-muted-foreground">
                            {result.sources.length} evidence passage{result.sources.length === 1 ? '' : 's'} returned
                          </p>
                        </div>
                      </div>
                      {result.answer && (
                        <button type="button" onClick={copyAnswer} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground">
                          <Copy className="h-3.5 w-3.5" />
                          Copy answer
                        </button>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{result.answer}</p>
                  </article>

                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h2 className="text-sm font-semibold text-foreground">Evidence</h2>
                      <span className="text-xs text-muted-foreground">
                        {result.sources.length ? 'Ranked passages from indexed documents' : 'No matching passages'}
                      </span>
                    </div>
                    {result.sources.length ? (
                      <div className="space-y-2">
                        {result.sources.map((source, index) => (
                          <article key={source.chunkId || `${source.documentId}-${index}`} className="rounded-xl border border-border bg-card p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                <span className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground"><BookOpen className="h-4 w-4" /></span>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-500">Source {index + 1}</p>
                                  <h3 className="mt-0.5 truncate text-sm font-medium text-foreground">{source.documentName}</h3>
                                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                                    <span>{source.type ? source.type.toUpperCase() : 'Company Brain'}</span>
                                    {source.createdAt && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{new Date(source.createdAt).toLocaleDateString()}</span>}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => openSource(source.documentId)}
                                disabled={openingId === source.documentId}
                                className="shrink-0 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
                              >
                                {openingId === source.documentId ? 'Opening…' : 'Open source'}
                              </button>
                            </div>
                            <p className="mt-3 border-l-2 border-brand-500/40 pl-3 text-sm leading-5 text-muted-foreground">{source.content}</p>
                            {!!source.tags?.length && (
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {source.tags.map((sourceTag) => (
                                  <span key={sourceTag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{sourceTag}</span>
                                ))}
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
                        <FileSearch className="mx-auto h-6 w-6 text-muted-foreground" />
                        <p className="mt-2 text-sm font-medium text-foreground">No matching indexed passages</p>
                        <p className="mt-1 text-xs text-muted-foreground">Try a broader question, clear filters, or index more documents in Company Brain.</p>
                      </div>
                    )}
                  </div>

                  <section aria-label="Related questions" className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-xs text-muted-foreground">Ask next</span>
                    {['What else should I know?', 'Summarize the evidence', 'What is still unclear?'].map((followup) => (
                      <button key={followup} type="button" onClick={() => { setQuery(followup); }} className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                        {followup}
                      </button>
                    ))}
                  </section>
                </>
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 text-center">
                  <span className="rounded-2xl bg-brand-500/10 p-3 text-brand-500"><Sparkles className="h-6 w-6" /></span>
                  <p className="mt-3 text-sm font-semibold text-foreground">Answers use indexed company documents</p>
                  <p className="mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
                    Results are scoped to your organization. Only indexed passages are searched; no external connector or unsupported source is implied.
                  </p>
                </div>
              )}
            </section>

            {mode === 'research' && showFilters && (
              <aside aria-label="Research filters" className="h-fit rounded-xl border border-border bg-card p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Filter results</h2>
                  <button type="button" onClick={clearFilters} disabled={!hasFilters || answerMutation.isPending} className="text-xs text-brand-500 hover:underline disabled:text-muted-foreground disabled:no-underline">Clear all</button>
                </div>
                <div className="space-y-5">
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sources</h3>
                    <div className="rounded-lg bg-muted/40 px-3 py-2.5">
                      <p className="flex items-center gap-2 text-xs font-medium text-foreground">
                        <BookOpen className="h-3.5 w-3.5 text-brand-500" />
                        Company Brain
                      </p>
                      <p className="mt-1 pl-5 text-[10px] text-muted-foreground">
                        {result ? `${result.sources.length} passages in current results` : `${indexedTotal ?? 0} indexed documents`}
                      </p>
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-muted-foreground">External sources are not connected to this search service.</p>
                  </section>
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Collections</h3>
                    <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                      Collections are not modeled in the current document API.
                    </div>
                  </section>
                  <section>
                    <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Tags className="h-3.5 w-3.5" />Tags</h3>
                    {tags.length ? (
                      <div className="max-h-64 space-y-1 overflow-y-auto">
                        {tags.map(({ tag: documentTag }) => (
                          <label key={documentTag} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted">
                            <input
                              type="radio"
                              name="research-tag"
                              checked={tag === documentTag}
                              onChange={() => setTag(tag === documentTag ? '' : documentTag)}
                              className="accent-brand-500"
                            />
                            <span className="min-w-0 flex-1 truncate">{documentTag}</span>
                            <span className="tabular-nums">{returnedTags.get(documentTag) ?? 0}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No document tags are available.</p>
                    )}
                    <p className="mt-2 text-[10px] text-muted-foreground">Counts show passages returned in the current search.</p>
                  </section>
                  <section className="space-y-2 border-t border-border pt-4">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="research-type">File type</label>
                    <select id="research-type" value={type} onChange={(event) => setType(event.target.value)} className="w-full rounded-md border border-border bg-card px-2.5 py-2 text-xs text-foreground">
                      <option value="">All types</option>
                      {types.map(({ type: documentType }) => <option key={documentType} value={documentType}>{documentType.toUpperCase()}</option>)}
                    </select>
                  </section>
                </div>
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}
