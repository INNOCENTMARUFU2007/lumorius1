'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  FileType2,
  FilePlus2,
  FolderOpen,
  Loader2,
  MessageSquareText,
  Network,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { formatBytes, formatRelative } from '@/lib/utils';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/primitives';

type DocumentRecord = {
  id: string;
  name?: string;
  original_name?: string;
  type?: string;
  mime_type?: string;
  size_bytes?: number | string;
  status?: string;
  chunk_count?: number | string;
  created_at?: string;
  team_id?: string | null;
  uploaded_by_id?: string;
};

type DocumentResult = {
  data: DocumentRecord[];
  total: number;
  totalPages: number;
  statusCounts: Record<string, number>;
};

type Envelope<T> = { data: T };
type KnowledgeAnalytics = {
  entities: number;
  relationships: number;
  disputedEvidence: number;
  evidenceLast30Days: number;
};
type LibraryStatus = 'all' | 'indexed' | 'indexing' | 'failed';
type AskScope = { id: string; name: string };
type AskRequest = { question: string; scope: AskScope | null };

const PAGE_SIZE = 12;
const LIBRARY_STATUSES: { value: LibraryStatus; label: string }[] = [
  { value: 'all', label: 'All documents' },
  { value: 'indexed', label: 'Indexed' },
  { value: 'indexing', label: 'Indexing' },
  { value: 'failed', label: 'Needs attention' },
];

type BrainSource = {
  citationId?: string;
  documentId?: string;
  documentName?: string;
  chunkId?: string;
  chunkIndex?: number | string;
  excerpt?: string;
  content?: string;
  cited?: boolean;
  hybridScore?: number;
  semanticScore?: number | null;
};

type BrainKnowledgeSource = {
  citationId?: string;
  evidenceId?: string;
  evidenceType?: string;
  status?: string;
  sourceVerified?: boolean;
  confidence?: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  documentId?: string;
  documentName?: string;
  documentType?: string;
  chunkId?: string;
  chunkIndex?: number | string;
  excerpt?: string;
  cited?: boolean;
  entity?: {
    id: string;
    name?: string | null;
    type?: string | null;
  } | null;
  relationship?: {
    id: string;
    sourceId?: string | null;
    targetId?: string | null;
    source?: string | null;
    type?: string | null;
    target?: string | null;
  } | null;
  semanticScore?: number;
  lexicalScore?: number;
  relevanceScore?: number;
};

type BrainAnswer = {
  answer: string;
  sources?: BrainSource[];
  knowledgeSources?: BrainKnowledgeSource[];
  citationsUsed?: string[];
  retrievalMode?: string;
  knowledgeRetrieval?: {
    enabled?: boolean;
    mode?: string;
    total?: number;
  };
};

type ChatTurn = { id: string; question: string; scopeName?: string; answer?: BrainAnswer; error?: string };

const QUICK_QUESTIONS = [
  'What are our current strategic priorities?',
  'Summarise the key decisions recorded in our documents.',
  'What risks or unresolved issues should leadership review?',
];

function documentName(document: DocumentRecord) {
  return document.original_name ?? document.name ?? 'Untitled document';
}

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const message = (error.response as { data?: { message?: unknown } } | undefined)?.data?.message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}

function getFileIcon(document: DocumentRecord) {
  const extension = (document.original_name ?? document.name ?? '').split('.').pop()?.toLowerCase();
  if (['xlsx', 'xls', 'csv'].includes(extension ?? '')) return FileSpreadsheet;
  if (['doc', 'docx', 'txt', 'md'].includes(extension ?? '')) return FileType2;
  return FileText;
}

function statusStyles(status?: string) {
  switch ((status ?? '').toLowerCase()) {
    case 'indexed':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    case 'processing':
    case 'uploading':
      return 'border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400';
    case 'failed':
      return 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400';
    default:
      return 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400';
  }
}

function renderCitedAnswer(value: string) {
  return value.split(/(\[(?:S|K)\d+\])/g).map((part, index) => {
    const match = part.match(/^\[((?:S|K)\d+)\]$/);

    if (match) {
      const citationId = match[1];

      return (
        <a
          key={`${citationId}-${index}`}
          href={`#brain-source-${citationId}`}
          className="font-semibold text-brand-500 underline decoration-brand-500/40 underline-offset-2 hover:text-brand-600"
        >
          {part}
        </a>
      );
    }

    return <span key={`answer-${index}`}>{part}</span>;
  });
}

function formatEvidenceDate(value?: string): string {
  if (!value) return 'Not recorded';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : date.toLocaleString();
}

function formatConfidence(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Not available';
  }

  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
export default function BrainPage() {
  const { user } = useAuth();
  if (!user) return null;
  return <BrainDashboard key={user.organizationId + '/' + user.id} accountKey={user.organizationId + '/' + user.id}
    userId={user.id} canManage={['owner', 'admin', 'super_admin'].includes(user.role)} />;
}

function BrainDashboard({ accountKey, userId, canManage }: { accountKey: string; userId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<LibraryStatus>('all');
  const [question, setQuestion] = useState('');
  const [thread, setThread] = useState<ChatTurn[]>([]);
  const threadEnd = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState<AskScope | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const questionInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchTerm(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const summaryQuery = useQuery({
    queryKey: ['documents', 'brain-summary', accountKey],
    queryFn: async ({ signal }) => (await api.get<Envelope<DocumentResult>>('/documents', {
      params: { pageSize: 1 }, signal,
    })).data.data,
    refetchInterval: (query) => {
      const counts = query.state.data?.statusCounts;
      return (counts?.uploading ?? 0) + (counts?.processing ?? 0) > 0 ? 5000 : false;
    },
  });
  const knowledgeQuery = useQuery({
    queryKey: ['knowledge', 'brain-summary', accountKey],
    queryFn: async ({ signal }) =>
      (await api.get<Envelope<KnowledgeAnalytics>>('/knowledge/analytics', { signal })).data.data,
    staleTime: 60_000,
  });
  const documentsQuery = useQuery({
    queryKey: ['documents', 'brain-library', accountKey, searchTerm, statusFilter, page],
    queryFn: async ({ signal }) => (await api.get<Envelope<DocumentResult>>('/documents', {
      params: { search: searchTerm || undefined, status: statusFilter === 'all' ? undefined : statusFilter, page, pageSize: PAGE_SIZE },
      signal,
    })).data.data,
  });

  const counts = summaryQuery.data?.statusCounts;
  const indexing = (counts?.uploading ?? 0) + (counts?.processing ?? 0);
  useEffect(() => {
    if (counts) void queryClient.invalidateQueries({ queryKey: ['documents', 'brain-library', accountKey] });
  }, [counts?.indexed, counts?.uploading, counts?.processing, counts?.failed, accountKey, queryClient]);

  const lastPage = Math.max(1, documentsQuery.data?.totalPages ?? 1);
  useEffect(() => {
    if (documentsQuery.data && page > lastPage) setPage(lastPage);
  }, [documentsQuery.data, lastPage, page]);

  const invalidateDocuments = () => {
    void queryClient.invalidateQueries({ queryKey: ['documents'] });
    void queryClient.invalidateQueries({ queryKey: ['knowledge'] });
  };

  const uploadMutation = useMutation({
    mutationFn: async ({ files, note }: { files: File[]; note?: boolean }) => {
      let uploaded = 0;
      let done = 0;
      const failed: { file: string; message: string }[] = [];
      setUploadProgress({ done: 0, total: files.length });
      // Four uploads in flight at once: much faster than one-by-one, gentle on the API rate limit.
      const queue = [...files];
      const worker = async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          const form = new FormData();
          form.append('file', file);
          if (note) form.append('tags', 'company-note');
          try {
            await api.post('/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            uploaded += 1;
          } catch (error) {
            failed.push({ file: file.name, message: errorMessage(error, 'Upload failed. Try again.') });
          }
          done += 1;
          setUploadProgress({ done, total: files.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
      setUploadProgress(null);
      return { uploaded, failed };
    },
    onError: () => setUploadProgress(null),
    onSuccess: ({ uploaded, failed }, { note }) => {
      if (uploaded) {
        toast.success(note ? 'Note queued for indexing' : `${uploaded} document${uploaded === 1 ? '' : 's'} queued for indexing`);
        invalidateDocuments();
        if (note) {
          setNoteTitle('');
          setNoteBody('');
          setNoteOpen(false);
        }
      }
      if (failed.length) toast.error(`${failed.length} upload${failed.length === 1 ? '' : 's'} failed`, {
        description: `${failed[0].file}: ${failed[0].message}`,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      toast.success('Document deleted');
      invalidateDocuments();
    },
    onError: () => toast.error('Could not delete this document.'),
  });

  const downloadMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.get<Envelope<{ url: string }>>(`/documents/${id}/download`);
      return response.data.data.url;
    },
    onSuccess: (url) => window.location.assign(url),
    onError: (error) => toast.error(errorMessage(error, 'Could not download this document.')),
  });

  const askMutation = useMutation<BrainAnswer, Error, AskRequest & { turnId: string }>({
    mutationFn: async ({ question, scope }) => {
      const history = thread
        .filter((turn) => turn.answer?.answer)
        .slice(-4)
        .map((turn) => ({ question: turn.question, answer: turn.answer!.answer }));
      const response = await api.post<Envelope<BrainAnswer>>('/documents/ask', {
        question, documentIds: scope ? [scope.id] : undefined, history,
      });
      return response.data.data;
    },
    onSuccess: (data, { turnId }) => setThread((turns) => turns.map((t) => (t.id === turnId ? { ...t, answer: data } : t))),
    onError: (error, { turnId }) =>
      setThread((turns) => turns.map((t) => (t.id === turnId ? { ...t, error: errorMessage(error, 'Company Brain could not answer that question. Try again.') } : t))),
  });

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [thread]);

  const uploadFiles = uploadMutation.mutate;
  const onDrop = useCallback((files: File[]) => {
    if (files.length) uploadFiles({ files });
  }, [uploadFiles]);
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    disabled: uploadMutation.isPending,
    maxSize: 100 * 1024 * 1024,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/csv': ['.csv'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    onDropRejected: (rejections) => {
      const first = rejections[0];
      const reason = first?.errors[0]?.message ?? 'The selected file is not supported.';
      toast.error(reason);
    },
  });

  const documents = documentsQuery.data?.data ?? [];
  const total = summaryQuery.data?.total;
  const coverage = total && counts ? Math.round(((counts.indexed ?? 0) / total) * 100) : null;
  const selectStatus = (value: LibraryStatus) => {
    setPage(1);
    setStatusFilter(value);
  };

  const ask = (value = question) => {
    const cleanQuestion = value.trim();
    if (!cleanQuestion || askMutation.isPending) return;
    const turnId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setThread((turns) => [...turns, { id: turnId, question: cleanQuestion, scopeName: scope?.name }]);
    setQuestion('');
    askMutation.mutate({ question: cleanQuestion, scope, turnId });
  };

  const answer = askMutation.data;
  const sources = answer?.sources ?? [];
  const knowledgeSources = answer?.knowledgeSources ?? [];
  const knowledge = knowledgeQuery.data;
  const statCards = [
    { label: 'Documents', value: total, filter: 'all', icon: FolderOpen, color: 'bg-violet-500/10 text-violet-600 dark:text-violet-300' },
    { label: 'Indexed', value: counts && (counts.indexed ?? 0), filter: 'indexed', icon: CheckCircle2, color: 'bg-teal-500/10 text-teal-700 dark:text-teal-300' },
    { label: 'Indexing', value: counts && indexing, filter: 'indexing', icon: Clock3, color: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
    { label: 'Needs attention', value: counts && (counts.failed ?? 0), filter: 'failed', icon: AlertCircle, color: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  ] as const;

  const copyAnswer = async () => {
    if (!answer) return;
    const evidence = [...sources, ...knowledgeSources].filter((source) =>
      source.citationId && (source.cited || answer.citationsUsed?.includes(source.citationId)),
    ).map((source) => {
      const label = source.documentName ?? ('entity' in source ? source.entity?.name : undefined) ?? 'Knowledge evidence';
      return `[${source.citationId}] ${label}`;
    });
    const text = [askMutation.variables?.question, answer.answer, evidence.length ? 'Sources\n' + evidence.join('\n') : ''].filter(Boolean).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Answer and citations copied');
    } catch {
      toast.error('Could not copy the answer.');
    }
  };


  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-7 pb-10">
      <PageHeader
        hero
        icon={BrainCircuit}
        title="Company Brain"
        description="Find what your company knows, check the source, and capture what the team should remember."
        actions={<>
          <a href="#brain-ask" onClick={() => questionInput.current?.focus()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-glow-primary transition hover:bg-primary/90 disabled:opacity-60">
            <MessageSquareText className="h-4 w-4" /> Ask a question
          </a>
          <a href="#brain-library" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card/60 px-3.5 text-sm font-medium transition hover:bg-muted disabled:opacity-60">
            <FolderOpen className="h-4 w-4" /> Browse sources
          </a>
        </>}
      >
        <div className="rounded-xl border border-border bg-card/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-success" /> Search coverage</span>
            {coverage !== null && <span className="text-lg font-semibold tabular-nums text-foreground">{coverage}%</span>}
          </div>
          {coverage !== null && (
            <div role="progressbar" aria-label="Share of accessible documents indexed" aria-valuenow={coverage} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: coverage + '%' }} />
            </div>
          )}
          <p className="mt-2.5 text-xs leading-5 text-muted-foreground">
            {summaryQuery.isError ? 'Document status could not be loaded.' : total === undefined ? 'Loading document status…' : total === 0 ? 'Add a document or note to start building your library.' : `${counts?.indexed ?? 0} of ${total} accessible documents are indexed.`}
          </p>
          {summaryQuery.isError && <button onClick={() => void summaryQuery.refetch()} className="mt-2 text-xs font-medium text-primary underline" type="button">Retry</button>}
        </div>
      </PageHeader>

      <section aria-label="Document status" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {statCards.map(({ label, value, filter, icon: Icon, color }) => (
          <a key={filter} href="#brain-library" onClick={() => { setSearch(''); setSearchTerm(''); selectStatus(filter); }}
            className="group rounded-2xl border border-border bg-card p-3.5 transition hover:border-brand-500/40 hover:shadow-sm sm:p-4">
            <div className="flex items-center gap-2">
              <span className={`rounded-lg p-2 ${color}`}><Icon className="h-4 w-4" /></span>
              <span className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</span>
              <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
            </div>
            <p className="mt-2.5 text-2xl font-semibold tracking-tight tabular-nums">{value === undefined ? '—' : value.toLocaleString()}</p>
          </a>
        ))}
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div id="brain-ask" className="scroll-mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Ask Company Brain</h2>
              <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">AI answers from the documents you can access, with citations you can check. Follow-up questions keep the context.</p>
            </div>
            {thread.length > 0 && (
              <button type="button" disabled={askMutation.isPending} onClick={() => { setThread([]); askMutation.reset(); }}
                className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted disabled:opacity-50">
                New chat
              </button>
            )}
          </div>

          {thread.length > 0 && (
            <div role="log" aria-live="polite" aria-label="Company Brain conversation" className="max-h-[560px] space-y-5 overflow-y-auto bg-muted/20 px-5 py-5 sm:px-6">
              {thread.map((turn) => (
                <div key={turn.id} className="space-y-3">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-6 text-primary-foreground">
                      {turn.question}
                      {turn.scopeName && <span className="mt-1 block text-xs opacity-80">Only in: {turn.scopeName}</span>}
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 text-sm leading-7">
                      {turn.answer ? (
                        <>
                          <div className="whitespace-pre-wrap text-foreground">{renderCitedAnswer(turn.answer.answer)}</div>
                          {(turn.answer.sources?.length ?? 0) + (turn.answer.knowledgeSources?.length ?? 0) > 0 && (
                            <details className="mt-2 text-sm">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                {(turn.answer.sources?.length ?? 0) + (turn.answer.knowledgeSources?.length ?? 0)} sources
                              </summary>
                              <ul className="mt-2 space-y-1.5">
                                {(turn.answer.sources ?? []).map((source, index) => (
                                  <li key={source.chunkId ?? `${turn.id}-s${index}`} className="flex gap-2 text-sm">
                                    <span className="font-mono text-xs text-primary">{source.citationId ?? `S${index + 1}`}</span>
                                    <span className="min-w-0 truncate text-muted-foreground">{source.documentName ?? 'Company document'}</span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </>
                      ) : turn.error ? (
                        <p role="alert" className="text-destructive">{turn.error}</p>
                      ) : (
                        <span className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching your documents…</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={threadEnd} />
            </div>
          )}

          <form
            className="p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              ask();
            }}
          >
            {scope && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-brand-500/10 px-3 py-2 text-xs">
                <span className="min-w-0 truncate"><strong>Source:</strong> {scope.name}</span>
                <button type="button" aria-label="Search all accessible sources" disabled={askMutation.isPending}
                  onClick={() => setScope(null)} className="shrink-0 rounded p-1 hover:bg-brand-500/10 disabled:opacity-50"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
            <label htmlFor="company-brain-question" className="sr-only">Your question</label>
            <div className="rounded-2xl border border-border bg-background p-2 transition focus-within:border-brand-500/60 focus-within:ring-2 focus-within:ring-brand-500/10">
              <textarea
                ref={questionInput}
                id="company-brain-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    ask();
                  }
                }}
                rows={thread.length ? 2 : 3}
                maxLength={2000}
                placeholder={thread.length ? 'Ask a follow-up…' : 'e.g. What are our strategic priorities and which documents support them?'}
                className="w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground/70"
              />
              <div className="flex items-center justify-between gap-3 border-t border-border px-2 pt-2">
                <span className="text-xs text-muted-foreground">Enter to ask · Shift + Enter for a new line</span>
                <button
                  type="submit"
                  disabled={askMutation.isPending || !question.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {askMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Ask
                </button>
              </div>
            </div>

            {!scope && thread.length === 0 && <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Try asking</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_QUESTIONS.map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    disabled={askMutation.isPending}
                    onClick={() => ask(prompt)}
                    className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-brand-500/40 hover:bg-brand-500/[0.05] hover:text-foreground disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>}
          </form>

          <AnimatePresence mode="wait">
            {answer && !askMutation.isPending && (
              <motion.div key="answer" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border-t border-border bg-muted/20 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold">Evidence for the latest answer</div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => void copyAnswer()} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"><Copy className="h-3.5 w-3.5" /> Copy</button>
                    <button type="button" onClick={() => askMutation.reset()} aria-label="Hide evidence" className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{askMutation.variables?.question}</p>

                {(sources.length > 0 || knowledgeSources.length > 0) && (
                  <div className="mt-5 border-t border-border pt-4">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold  text-muted-foreground">
                        Evidence and sources
                      </p>

                      <span className="text-xs text-muted-foreground">
                        {sources.length + knowledgeSources.length} source records
                      </span>
                    </div>

                    {sources.length > 0 && (
                      <section>
                        <div className="mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-brand-500" />
                          <h3 className="text-xs font-semibold">
                            Direct document sources
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            [S#]
                          </span>
                        </div>

                        <div className="grid gap-2">
                          {sources.map((source, index) => {
                            const citationId = source.citationId ?? `S${index + 1}`;

                            return (
                              <details
                                id={`brain-source-${citationId}`}
                                key={source.chunkId ?? source.documentId ?? citationId}
                                className="group scroll-mt-24 rounded-xl border border-border bg-card p-3"
                              >
                                <summary className="flex cursor-pointer list-none items-center gap-3">
                                  <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-brand-500/10 px-2 text-xs font-bold text-brand-500">
                                    {citationId}
                                  </span>

                                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                                    {source.documentName ?? 'Company document'}
                                  </span>

                                  {source.cited && (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                  )}

                                  <span className="text-xs text-muted-foreground">
                                    Chunk {source.chunkIndex ?? '—'}
                                  </span>

                                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-open:rotate-45" />
                                </summary>

                                {(source.excerpt || source.content) && (
                                  <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-xs leading-6 text-muted-foreground">
                                    {source.excerpt ?? source.content}
                                  </p>
                                )}
                              </details>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {knowledgeSources.length > 0 && (
                      <section className="mt-5">
                        <div className="mb-3 flex items-center gap-2">
                          <Network className="h-4 w-4 text-cyan-500" />
                          <h3 className="text-xs font-semibold">
                            Knowledge graph evidence
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            [K#]
                          </span>
                        </div>

                        <div className="grid gap-2">
                          {knowledgeSources.map((source, index) => {
                            const citationId = source.citationId ?? `K${index + 1}`;

                            const title = source.entity?.name
                              ?? (
                                source.relationship
                                  ? `${source.relationship.source ?? 'Unknown'} → ${source.relationship.target ?? 'Unknown'}`
                                  : source.documentName ?? 'Knowledge evidence'
                              );

                            const status = (source.status ?? 'active').toLowerCase();

                            return (
                              <details
                                id={`brain-source-${citationId}`}
                                key={source.evidenceId ?? citationId}
                                className="group scroll-mt-24 rounded-xl border border-cyan-500/20 bg-card p-3"
                              >
                                <summary className="flex cursor-pointer list-none items-center gap-3">
                                  <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-cyan-500/10 px-2 text-xs font-bold text-cyan-600 dark:text-cyan-400">
                                    {citationId}
                                  </span>

                                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                                    {title}
                                  </span>

                                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${
                                    status === 'active'
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                      : status === 'disputed'
                                        ? 'bg-amber-500/10 text-amber-600'
                                        : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {status}
                                  </span>

                                  {source.cited && (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                  )}

                                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-open:rotate-45" />
                                </summary>

                                <div className="mt-3 space-y-3 border-t border-border pt-3">
                                  {source.entity && (
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <p className="text-xs font-semibold">
                                          {source.entity.name}
                                        </p>
                                        <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                                          Entity · {source.entity.type ?? 'Unknown type'}
                                        </p>
                                      </div>

                                      <Link
                                        href={`/knowledge?nodeId=${encodeURIComponent(source.entity.id)}`}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition hover:border-brand-500/40 hover:bg-brand-500/5"
                                      >
                                        <Network className="h-3.5 w-3.5" />
                                        Open entity
                                        <ArrowUpRight className="h-3 w-3" />
                                      </Link>
                                    </div>
                                  )}

                                  {source.relationship && (
                                    <div className="rounded-lg bg-muted/40 p-3">
                                      <p className="text-xs font-semibold  text-muted-foreground">
                                        Recorded relationship
                                      </p>

                                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium">
                                        {source.relationship.sourceId ? (
                                          <Link
                                            href={`/knowledge?nodeId=${encodeURIComponent(source.relationship.sourceId)}`}
                                            className="rounded-md border border-border bg-background px-2 py-1 text-brand-500 transition hover:border-brand-500/50 hover:bg-brand-500/5"
                                          >
                                            {source.relationship.source ?? 'Source entity'}
                                            <ArrowUpRight className="ml-1 inline h-3 w-3" />
                                          </Link>
                                        ) : (
                                          <span>{source.relationship.source ?? 'Unknown source'}</span>
                                        )}

                                        <span className="text-cyan-600">
                                          {source.relationship.type?.replace(/[_-]+/g, ' ')}
                                        </span>

                                        {source.relationship.targetId ? (
                                          <Link
                                            href={`/knowledge?nodeId=${encodeURIComponent(source.relationship.targetId)}`}
                                            className="rounded-md border border-border bg-background px-2 py-1 text-brand-500 transition hover:border-brand-500/50 hover:bg-brand-500/5"
                                          >
                                            {source.relationship.target ?? 'Target entity'}
                                            <ArrowUpRight className="ml-1 inline h-3 w-3" />
                                          </Link>
                                        ) : (
                                          <span>{source.relationship.target ?? 'Unknown target'}</span>
                                        )}
                                      </div>

                                      <p className="mt-2 text-xs text-muted-foreground">
                                        Select either entity to inspect its graph neighborhood.
                                      </p>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-2">
                                    {source.sourceVerified ? (
                                      <>
                                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                          Source links verified
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                        <span className="text-xs font-medium text-amber-600">
                                          Source links not fully verified
                                        </span>
                                      </>
                                    )}
                                  </div>

                                  {source.excerpt && (
                                    <blockquote className="whitespace-pre-wrap border-l-2 border-cyan-500/50 pl-3 text-xs leading-6 text-muted-foreground">
                                      {source.excerpt}
                                    </blockquote>
                                  )}

                                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3">
                                    <div>
                                      <p className="text-xs text-muted-foreground">
                                        Evidence confidence
                                      </p>
                                      <p className="mt-1 text-xs font-semibold">
                                        {formatConfidence(source.confidence)}
                                      </p>
                                    </div>

                                    <div>
                                      <p className="text-xs text-muted-foreground">
                                        Retrieval relevance
                                      </p>
                                      <p className="mt-1 text-xs font-semibold">
                                        {formatConfidence(source.relevanceScore)}
                                      </p>
                                    </div>

                                    <div>
                                      <p className="text-xs text-muted-foreground">
                                        First observed
                                      </p>
                                      <p className="mt-1 text-xs">
                                        {formatEvidenceDate(source.firstSeenAt)}
                                      </p>
                                    </div>

                                    <div>
                                      <p className="text-xs text-muted-foreground">
                                        Last observed
                                      </p>
                                      <p className="mt-1 text-xs">
                                        {formatEvidenceDate(source.lastSeenAt)}
                                      </p>
                                    </div>
                                  </div>

                                  <p className="text-xs text-muted-foreground">
                                    Source: {source.documentName ?? 'Unknown document'}
                                    {' · '}
                                    Chunk {source.chunkIndex ?? '—'}
                                    {' · '}
                                    {source.evidenceType?.replace(/[_-]+/g, ' ') ?? 'Knowledge evidence'}
                                  </p>
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {answer.knowledgeRetrieval?.mode && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Graph retrieval: {answer.knowledgeRetrieval.mode}
                        {' · '}
                        {answer.knowledgeRetrieval.total ?? knowledgeSources.length} evidence matches
                      </p>
                    )}
                  </div>
                )}

                {sources.length === 0 && knowledgeSources.length === 0 && (
                  <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs leading-5 text-muted-foreground">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    No source references were returned. Treat this answer as unverified until supporting documents are available.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <aside className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-semibold"><FilePlus2 className="h-5 w-5 text-brand-500" /> Add company knowledge</h2>
            <div {...getRootProps()} className={`mt-4 rounded-xl border border-dashed p-4 text-center transition ${isDragActive ? 'border-brand-500 bg-brand-500/10' : 'border-border bg-muted/25'}`}>
              <input {...getInputProps()} />
              <p className="text-sm font-medium">{isDragActive ? 'Drop files to upload' : 'Drop files here'}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">PDF, DOCX, XLSX, PPTX, CSV, TXT and MD. Select as many files as you like, up to 100 MB each.</p>
              <button type="button" onClick={open} disabled={uploadMutation.isPending} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                {uploadMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />} {uploadProgress ? `Uploading ${uploadProgress.done} of ${uploadProgress.total}…` : 'Choose files'}
              </button>
              {uploadProgress && (
                <div className="mx-auto mt-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={uploadProgress.total} aria-valuenow={uploadProgress.done} aria-label="Upload progress">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(uploadProgress.done / uploadProgress.total) * 100}%` }} />
                </div>
              )}
            </div>
            <button type="button" aria-expanded={noteOpen} aria-controls="brain-note" onClick={() => setNoteOpen(!noteOpen)} className="mt-3 inline-flex w-full items-center justify-between gap-2 rounded-xl bg-brand-500/10 px-3 py-2.5 text-sm font-semibold text-brand-600 hover:bg-brand-500/15 dark:text-brand-300">
              <span className="inline-flex items-center gap-2"><FileText className="h-4 w-4" /> Capture a note</span>
              {noteOpen ? <X className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {noteOpen && (
              <form id="brain-note" className="mt-3 space-y-3" onSubmit={(event) => {
                event.preventDefault();
                const title = noteTitle.trim();
                const body = noteBody.trim();
                if (!title || !body || uploadMutation.isPending) return;
                const fileName = title.replace(/[\\/:*?"<>|]/g, '_');
                uploadFiles({ files: [new File([title + '\n\n' + body], fileName + '.txt', { type: 'text/plain' })], note: true });
              }}>
                <label className="block text-xs font-medium">Title
                  <input required maxLength={120} value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="block text-xs font-medium">Note
                  <textarea required maxLength={20000} rows={4} value={noteBody} onChange={(event) => setNoteBody(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </label>
                <p className="text-xs text-muted-foreground">Saved as a searchable document visible to your workspace.</p>
                <button type="submit" disabled={uploadMutation.isPending || !noteTitle.trim() || !noteBody.trim()} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50">Save note</button>
              </form>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-semibold"><Network className="h-5 w-5 text-brand-500" /> Knowledge graph</h2>
            {knowledge ? (
              <dl className="mt-4 grid grid-cols-2 gap-2">
                {[
                  ['Entities', knowledge.entities],
                  ['Relationships', knowledge.relationships],
                  ['Evidence added in 30 days', knowledge.evidenceLast30Days],
                  ['Disputed evidence', knowledge.disputedEvidence],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-muted/50 p-3">
                    <dt className="text-xs leading-4 text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">{value.toLocaleString()}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="mt-3 text-xs text-muted-foreground">{knowledgeQuery.isError ? 'Graph metrics are temporarily unavailable.' : 'Loading graph metrics…'}</p>}
            <Link href="/knowledge" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-300">Explore graph and evidence <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </aside>
      </section>

      {/* Document library */}
      <section id="brain-library" className="scroll-mt-6 space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Source library</h2>
          </div>
          <button
            type="button"
            onClick={invalidateDocuments}
            disabled={documentsQuery.isFetching || summaryQuery.isFetching || knowledgeQuery.isFetching}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${documentsQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by document name…"
                aria-label="Search company documents"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-10 text-sm outline-none transition focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/10"
              />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {LIBRARY_STATUSES.map(({ value, label }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => selectStatus(value)}
                  aria-pressed={statusFilter === value}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition ${statusFilter === value ? 'bg-brand-500 text-white shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {documentsQuery.isError ? (
            <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-5 text-center">
              <AlertCircle className="mx-auto h-6 w-6 text-rose-500" />
              <p className="mt-2 text-sm font-medium">Documents could not be loaded</p>
              <p className="mt-1 text-xs text-muted-foreground">Check the API connection and your access permissions.</p>
              <button type="button" onClick={() => documentsQuery.refetch()} className="mt-3 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white">Try again</button>
            </div>
          ) : documentsQuery.isLoading ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-muted/70" />)}
            </div>
          ) : documents.length === 0 ? (
            <div className="my-5 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><BookOpen className="h-6 w-6" /></div>
              <h3 className="mt-3 text-sm font-semibold">{search || statusFilter !== 'all' ? 'No matching documents' : 'Your knowledge library is ready'}</h3>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{search || statusFilter !== 'all' ? 'Try another search or change the status filter.' : 'Upload your first company document to begin building a searchable knowledge base.'}</p>
              {!search && statusFilter === 'all' && <button type="button" onClick={open} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-semibold text-white"><UploadCloud className="h-4 w-4" /> Upload first document</button>}
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {documents.map((document) => {
                const Icon = getFileIcon(document);
                const name = documentName(document);
                return (
                  <motion.article
                    layout
                    key={document.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group flex min-w-0 items-start gap-3 rounded-xl border border-border bg-background p-3.5 transition hover:border-brand-500/30 hover:shadow-md hover:shadow-brand-500/[0.04] sm:p-4"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500"><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={name}>{name}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusStyles(document.status)}`}>{document.status ?? 'unknown'}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{formatBytes(Number(document.size_bytes ?? 0))}</span>
                        <span>{Number(document.chunk_count ?? 0)} chunks</span>
                        {document.created_at && <span>{formatRelative(document.created_at)}</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {document.status === 'indexed' && (
                          <button type="button" disabled={askMutation.isPending} onClick={() => {
                            setScope({ id: document.id, name });
                            setQuestion('');
                            askMutation.reset();
                            questionInput.current?.focus();
                          }} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500/10 px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-500/15 disabled:opacity-50 dark:text-brand-300">
                            <MessageSquareText className="h-3.5 w-3.5" /> Ask about this
                          </button>
                        )}
                        <button type="button" disabled={downloadMutation.isPending} onClick={() => downloadMutation.mutate(document.id)} aria-label={`Download ${name}`} title="Download"
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">
                          <Download className="h-4 w-4" />
                        </button>
                        {(canManage || userId === document.uploaded_by_id) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete "${name}" from Company Brain?`)) deleteMutation.mutate(document.id);
                          }}
                          disabled={deleteMutation.isPending}
                          aria-label={`Delete ${name}`}
                          className="ml-auto rounded-lg p-1.5 text-muted-foreground opacity-70 transition hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        )}
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
          {!documentsQuery.isLoading && !documentsQuery.isError && documents.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + documents.length} of {documentsQuery.data?.total}</span>
              <nav aria-label="Source library pages" className="flex items-center gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page" className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
                <span>Page {page} of {lastPage}</span>
                <button type="button" disabled={page >= lastPage} onClick={() => setPage(page + 1)} aria-label="Next page" className="rounded-lg border border-border p-1.5 hover:bg-muted disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
              </nav>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
