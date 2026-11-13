'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
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
  Clock3,
  FileSpreadsheet,
  FileText,
  FileType2,
  FolderOpen,
  Layers3,
  Loader2,
  MessageSquareText,
  Network,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { formatBytes, formatRelative } from '@/lib/utils';
import { toast } from 'sonner';

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
};

type DocumentResult = {
  items: DocumentRecord[];
  total: number;
};

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

const QUICK_QUESTIONS = [
  'What are our current strategic priorities?',
  'Summarise the key decisions recorded in our documents.',
  'What risks or unresolved issues should leadership review?',
];

function unwrapDocuments(value: any): DocumentResult {
  const payload = value?.data ?? value;
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.documents)
      ? payload.documents
      : Array.isArray(payload)
        ? payload
        : [];

  const totalValue = Number(payload?.total ?? payload?.pagination?.total ?? rows.length);
  return {
    items: rows as DocumentRecord[],
    total: Number.isFinite(totalValue) ? totalValue : rows.length,
  };
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
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [question, setQuestion] = useState('');

  const documentsQuery = useQuery<DocumentResult>({
    queryKey: ['documents', search],
    queryFn: async () => {
      const response = await api.get('/documents', {
        params: {
          search: search.trim() || undefined,
          page: 1,
          pageSize: 100,
        },
      });
      return unwrapDocuments(response.data);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const uploaded: DocumentRecord[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        // Let the browser/Axios set the multipart boundary automatically.
        const response = await api.post('/documents/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const payload = response.data?.data ?? response.data;
        uploaded.push(payload as DocumentRecord);
      }
      return uploaded;
    },
    onSuccess: (uploaded) => {
      toast.success(`${uploaded.length} document${uploaded.length === 1 ? '' : 's'} queued for processing`);
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message;
      toast.error(typeof message === 'string' ? message : 'Document upload failed. Check storage configuration and try again.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      toast.success('Document deleted');
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: () => toast.error('Could not delete this document.'),
  });

  const askMutation = useMutation<BrainAnswer, Error, string>({
    mutationFn: async (value) => {
      const response = await api.post('/documents/ask', { question: value });
      return (response.data?.data ?? response.data) as BrainAnswer;
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message;
      toast.error(typeof message === 'string' ? message : 'Company Brain could not answer that question.');
    },
  });

  const uploadFiles = uploadMutation.mutate;
  const onDrop = useCallback((files: File[]) => uploadFiles(files), [uploadFiles]);
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

  const documents = documentsQuery.data?.items ?? [];
  const totalDocuments = documentsQuery.data?.total ?? documents.length;
  const indexedCount = documents.filter((document) => document.status === 'indexed').length;
  const processingCount = documents.filter((document) => ['uploading', 'processing'].includes((document.status ?? '').toLowerCase())).length;
  const failedCount = documents.filter((document) => document.status === 'failed').length;
  const visibleDocuments = useMemo(
    () => statusFilter === 'all'
      ? documents
      : documents.filter((document) => {
          const status = (document.status ?? '').toLowerCase();
          return statusFilter === 'processing'
            ? ['processing', 'uploading'].includes(status)
            : status === statusFilter;
        }),
    [documents, statusFilter],
  );

  const ask = (value = question) => {
    const cleanQuestion = value.trim();
    if (!cleanQuestion || askMutation.isPending) return;
    setQuestion(cleanQuestion);
    askMutation.mutate(cleanQuestion);
  };

  const answer = askMutation.data;
  const sources = answer?.sources ?? [];
  const knowledgeSources = answer?.knowledgeSources ?? [];

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-7 pb-10">
      {/* Executive header */}
      <section className="relative isolate overflow-hidden rounded-[28px] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-[#171d3b] px-6 py-7 text-white shadow-xl shadow-slate-950/10 sm:px-9 sm:py-9">
        <div className="pointer-events-none absolute -right-20 -top-32 -z-10 h-80 w-80 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-150px] right-[28%] -z-10 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.8)]" />
              Company intelligence workspace
            </div>
            <div className="flex items-start gap-4">
              <div className="hidden rounded-2xl border border-white/10 bg-white/[0.08] p-3.5 shadow-inner sm:block">
                <BrainCircuit className="h-8 w-8 text-cyan-200" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Company Brain</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Your organisation's knowledge, connected. Search company information, ask evidence-based questions, and turn documents into decisions.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/knowledge"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.13]"
            >
              <Network className="h-4 w-4" />
              Knowledge graph
              <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>
            <button
              type="button"
              onClick={open}
              disabled={uploadMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/20 transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <UploadCloud className="h-4 w-4" />
              Add knowledge
            </button>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs text-slate-400">
          <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Organisation-scoped access</span>
          <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-cyan-300" /> Evidence-led AI answers</span>
          <span className="inline-flex items-center gap-2"><Layers3 className="h-4 w-4 text-indigo-300" /> Search across indexed knowledge</span>
        </div>
      </section>

      {/* Live metrics */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground sm:text-sm">Documents</span>
            <span className="rounded-xl bg-brand-500/10 p-2 text-brand-500"><FolderOpen className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{documentsQuery.isLoading ? 'â€”' : totalDocuments}</p>
          <p className="mt-1 text-xs text-muted-foreground">In this workspace</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground sm:text-sm">Indexed</span>
            <span className="rounded-xl bg-emerald-500/10 p-2 text-emerald-500"><CheckCircle2 className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{documentsQuery.isLoading ? 'â€”' : indexedCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Ready for knowledge search</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground sm:text-sm">Processing</span>
            <span className="rounded-xl bg-sky-500/10 p-2 text-sky-500"><Clock3 className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{documentsQuery.isLoading ? 'â€”' : processingCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Being prepared for search</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground sm:text-sm">Needs attention</span>
            <span className="rounded-xl bg-rose-500/10 p-2 text-rose-500"><AlertCircle className="h-4 w-4" /></span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{documentsQuery.isLoading ? 'â€”' : failedCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Documents with processing errors</p>
        </div>
      </section>

      {/* Upload and AI workspace */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">Knowledge intake</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight">Add company knowledge</h2>
            </div>
            <span className="rounded-xl bg-brand-500/10 p-2.5 text-brand-500"><UploadCloud className="h-5 w-5" /></span>
          </div>

          <div
            {...getRootProps()}
            className={`group rounded-2xl border border-dashed p-6 transition-all sm:p-7 ${
              isDragActive
                ? 'border-brand-500 bg-brand-500/10 ring-2 ring-brand-500/20'
                : 'border-border bg-card hover:border-brand-500/60 hover:bg-brand-500/[0.025]'
            } ${uploadMutation.isPending ? 'pointer-events-none opacity-70' : ''}`}
          >
            <input {...getInputProps()} />
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-500 transition group-hover:scale-105">
              {uploadMutation.isPending ? <Loader2 className="h-7 w-7 animate-spin" /> : <UploadCloud className="h-7 w-7" />}
            </div>
            <div className="mt-4 text-center">
              <p className="font-semibold">{isDragActive ? 'Release to add files' : uploadMutation.isPending ? 'Uploading documentsâ€¦' : 'Drag documents into your Company Brain'}</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-5 text-muted-foreground">Bring strategy documents, reports, policies and project knowledge into one searchable workspace.</p>
            </div>
            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={open}
                disabled={uploadMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
              >
                <UploadCloud className="h-4 w-4" /> Browse files
              </button>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-1.5">
              {['PDF', 'DOCX', 'XLSX', 'PPTX', 'CSV', 'TXT', 'MD'].map((type) => (
                <span key={type} className="rounded-md border border-border bg-muted/50 px-2 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground">{type}</span>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">Maximum file size: 100 MB per file</p>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <div>
              <p className="text-sm font-medium">Your organisation's knowledge stays scoped</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Document access follows your organisation and team permissions. Keep sensitive source files private.</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-gradient-to-r from-brand-500/[0.08] via-transparent to-cyan-500/[0.06] p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-brand-500/10 p-2 text-brand-500"><BrainCircuit className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">Ask your organisation</p>
                <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Ask Company Brain</h2>
              </div>
              <span className="ml-auto hidden items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-[10px] font-medium text-muted-foreground sm:inline-flex"><Sparkles className="h-3 w-3" /> Grounded in your sources</span>
            </div>
            <p className="mt-3 max-w-xl text-sm leading-5 text-muted-foreground">Ask a question in natural language. Lumorius searches the indexed documents you are authorised to access and returns supporting sources.</p>
          </div>

          <form
            className="p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              ask();
            }}
          >
            <label htmlFor="company-brain-question" className="mb-2 block text-xs font-semibold text-muted-foreground">Your question</label>
            <div className="rounded-2xl border border-border bg-background p-2 transition focus-within:border-brand-500/60 focus-within:ring-2 focus-within:ring-brand-500/10">
              <textarea
                id="company-brain-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    ask();
                  }
                }}
                rows={3}
                maxLength={2000}
                placeholder="e.g. What are our strategic priorities and which documents support them?"
                className="w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground/70"
              />
              <div className="flex items-center justify-between gap-3 border-t border-border px-2 pt-2">
                <span className="text-[11px] text-muted-foreground">Enter to ask Â· Shift + Enter for a new line</span>
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

            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Try asking</p>
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
            </div>
          </form>

          <AnimatePresence mode="wait">
            {askMutation.isPending && (
              <motion.div key="thinking" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border-t border-border px-5 py-5 sm:px-6">
                <div className="flex items-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-brand-500" /> Searching your accessible company knowledgeâ€¦</div>
              </motion.div>
            )}
            {answer && !askMutation.isPending && (
              <motion.div key="answer" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border-t border-border bg-muted/20 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-brand-500" /> Company Brain response</div>
                  <button type="button" onClick={() => askMutation.reset()} aria-label="Clear answer" className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">
                  {renderCitedAnswer(answer.answer)}
                </p>

                {(sources.length > 0 || knowledgeSources.length > 0) && (
                  <div className="mt-5 border-t border-border pt-4">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Evidence and sources
                      </p>

                      <span className="text-[11px] text-muted-foreground">
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
                          <span className="text-[10px] text-muted-foreground">
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
                                  <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-brand-500/10 px-2 text-[11px] font-bold text-brand-500">
                                    {citationId}
                                  </span>

                                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                                    {source.documentName ?? 'Company document'}
                                  </span>

                                  {source.cited && (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                  )}

                                  <span className="text-[10px] text-muted-foreground">
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
                          <span className="text-[10px] text-muted-foreground">
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
                                  <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-cyan-500/10 px-2 text-[11px] font-bold text-cyan-600 dark:text-cyan-400">
                                    {citationId}
                                  </span>

                                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                                    {title}
                                  </span>

                                  <span className={`rounded-md px-2 py-1 text-[10px] font-medium ${
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
                                        <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                                          Entity · {source.entity.type ?? 'Unknown type'}
                                        </p>
                                      </div>

                                      <Link
                                        href={`/knowledge?nodeId=${encodeURIComponent(source.entity.id)}`}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium transition hover:border-brand-500/40 hover:bg-brand-500/5"
                                      >
                                        <Network className="h-3.5 w-3.5" />
                                        Open entity
                                        <ArrowUpRight className="h-3 w-3" />
                                      </Link>
                                    </div>
                                  )}

                                  {source.relationship && (
                                    <div className="rounded-lg bg-muted/40 p-3">
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
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

                                      <p className="mt-2 text-[10px] text-muted-foreground">
                                        Select either entity to inspect its graph neighborhood.
                                      </p>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-2">
                                    {source.sourceVerified ? (
                                      <>
                                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                          Source links verified
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                        <span className="text-[11px] font-medium text-amber-600">
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
                                      <p className="text-[10px] text-muted-foreground">
                                        Evidence confidence
                                      </p>
                                      <p className="mt-1 text-xs font-semibold">
                                        {formatConfidence(source.confidence)}
                                      </p>
                                    </div>

                                    <div>
                                      <p className="text-[10px] text-muted-foreground">
                                        Retrieval relevance
                                      </p>
                                      <p className="mt-1 text-xs font-semibold">
                                        {formatConfidence(source.relevanceScore)}
                                      </p>
                                    </div>

                                    <div>
                                      <p className="text-[10px] text-muted-foreground">
                                        First observed
                                      </p>
                                      <p className="mt-1 text-[11px]">
                                        {formatEvidenceDate(source.firstSeenAt)}
                                      </p>
                                    </div>

                                    <div>
                                      <p className="text-[10px] text-muted-foreground">
                                        Last observed
                                      </p>
                                      <p className="mt-1 text-[11px]">
                                        {formatEvidenceDate(source.lastSeenAt)}
                                      </p>
                                    </div>
                                  </div>

                                  <p className="text-[10px] text-muted-foreground">
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
                      <p className="mt-3 text-[10px] text-muted-foreground">
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
      </section>

      {/* Document library */}
      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">Knowledge repository</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Your documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">Manage the information Lumorius can use to answer company questions.</p>
          </div>
          <button
            type="button"
            onClick={() => documentsQuery.refetch()}
            disabled={documentsQuery.isFetching}
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
                placeholder="Search documents by name or keywordâ€¦"
                aria-label="Search company documents"
                className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-10 text-sm outline-none transition focus:border-brand-500/60 focus:ring-2 focus:ring-brand-500/10"
              />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ['all', 'All'],
                ['indexed', 'Indexed'],
                ['processing', 'Processing'],
                ['failed', 'Failed'],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setStatusFilter(value)}
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
          ) : visibleDocuments.length === 0 ? (
            <div className="my-5 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><BookOpen className="h-6 w-6" /></div>
              <h3 className="mt-3 text-sm font-semibold">{search || statusFilter !== 'all' ? 'No matching documents' : 'Your knowledge library is ready'}</h3>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-muted-foreground">{search || statusFilter !== 'all' ? 'Try another search or change the status filter.' : 'Upload your first company document to begin building a searchable knowledge base.'}</p>
              {!search && statusFilter === 'all' && <button type="button" onClick={open} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-semibold text-white"><UploadCloud className="h-4 w-4" /> Upload first document</button>}
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {visibleDocuments.map((document) => {
                const Icon = getFileIcon(document);
                const name = document.original_name ?? document.name ?? 'Untitled document';
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
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${statusStyles(document.status)}`}>{document.status ?? 'unknown'}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{formatBytes(Number(document.size_bytes ?? 0))}</span>
                        <span>{Number(document.chunk_count ?? 0)} chunks</span>
                        {document.created_at && <span>{formatRelative(document.created_at)}</span>}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">{document.status === 'indexed' ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Clock3 className="h-3 w-3" />}{document.status === 'indexed' ? 'Available to Company Brain' : 'Not yet searchable'}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete "${name}" from Company Brain?`)) deleteMutation.mutate(document.id);
                          }}
                          disabled={deleteMutation.isPending}
                          aria-label={`Delete ${name}`}
                          className="rounded-lg p-1.5 text-muted-foreground opacity-70 transition hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
          {!documentsQuery.isLoading && !documentsQuery.isError && documents.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>Showing {visibleDocuments.length} of {documents.length} loaded documents</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Access-controlled results</span>
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-col justify-between gap-2 border-t border-border pt-4 text-[11px] text-muted-foreground sm:flex-row sm:items-center">
        <span className="inline-flex items-center gap-1.5"><BrainCircuit className="h-3.5 w-3.5 text-brand-500" /> Lumorius Company Brain</span>
        <span>AI responses should be checked against their cited source material.</span>
      </div>
    </div>
  );
}