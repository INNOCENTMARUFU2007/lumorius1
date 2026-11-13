'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';

type ConflictStatus = 'proposed' | 'confirmed' | 'dismissed' | 'resolved';
type ReviewStatus = 'confirmed' | 'dismissed' | 'resolved';

type ConflictEvidence = {
  id: string;
  documentId: string;
  documentName: string;
  quote: string;
  stance: string;
  confidence: number;
  sourceChunkIds: string[];
  lastSeenAt: string | null;
};

type ConflictClaim = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  valueType: string;
  isNegated: boolean;
  confidence: number;
  evidence: ConflictEvidence[];
};

type KnowledgeConflict = {
  id: string;
  status: ConflictStatus;
  conflictType: string;
  detectionReason: string;
  firstDetectedAt: string | null;
  lastDetectedAt: string | null;
  reviewedAt: string | null;
  resolutionNote: string | null;
  claimA: ConflictClaim;
  claimB: ConflictClaim;
};

type ConflictList = {
  items: KnowledgeConflict[];
  total: number;
  limit: number;
  offset: number;
};

type ReviewHistoryItem = {
  id: string;
  previousStatus: string;
  newStatus: string;
  reviewNote: string | null;
  createdAt: string | null;
  reviewerId: string;
  reviewerName: string;
  reviewerEmail: string;
};

type UnknownRecord = Record<string, unknown>;
const PAGE_SIZE = 25;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapApi(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 5; depth += 1) {
    if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, 'data')) {
      current = current.data;
    } else {
      break;
    }
  }
  return current;
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEvidence(value: unknown): ConflictEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((entry, index) => ({
    id: asText(entry.id, `evidence-${index}`),
    documentId: asText(entry.documentId),
    documentName: asText(entry.documentName, 'Untitled document'),
    quote: asText(entry.quote, 'No quotation was retained.'),
    stance: asText(entry.stance, 'supports'),
    confidence: asNumber(entry.confidence),
    sourceChunkIds: Array.isArray(entry.sourceChunkIds)
      ? entry.sourceChunkIds.filter((item): item is string => typeof item === 'string')
      : [],
    lastSeenAt: typeof entry.lastSeenAt === 'string' ? entry.lastSeenAt : null,
  }));
}

function normalizeClaim(value: unknown): ConflictClaim {
  const entry = isRecord(value) ? value : {};
  return {
    id: asText(entry.id),
    subject: asText(entry.subject, 'Unknown subject'),
    predicate: asText(entry.predicate, 'UNKNOWN_PREDICATE'),
    object: asText(entry.object, 'Unknown value'),
    valueType: asText(entry.valueType, 'text'),
    isNegated: entry.isNegated === true,
    confidence: asNumber(entry.confidence),
    evidence: normalizeEvidence(entry.evidence),
  };
}

function normalizeConflict(value: unknown): KnowledgeConflict {
  const entry = isRecord(value) ? value : {};
  const allowed: ConflictStatus[] = ['proposed', 'confirmed', 'dismissed', 'resolved'];
  const rawStatus = asText(entry.status, 'proposed') as ConflictStatus;
  return {
    id: asText(entry.id),
    status: allowed.includes(rawStatus) ? rawStatus : 'proposed',
    conflictType: asText(entry.conflictType, 'value_mismatch'),
    detectionReason: asText(entry.detectionReason, 'Potential difference detected; review the evidence.'),
    firstDetectedAt: typeof entry.firstDetectedAt === 'string' ? entry.firstDetectedAt : null,
    lastDetectedAt: typeof entry.lastDetectedAt === 'string' ? entry.lastDetectedAt : null,
    reviewedAt: typeof entry.reviewedAt === 'string' ? entry.reviewedAt : null,
    resolutionNote: typeof entry.resolutionNote === 'string' ? entry.resolutionNote : null,
    claimA: normalizeClaim(entry.claimA),
    claimB: normalizeClaim(entry.claimB),
  };
}

function normalizeConflictList(value: unknown): ConflictList {
  const payload = unwrapApi(value);
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new Error('The conflicts API returned an invalid response.');
  }
  return {
    items: payload.items.filter(isRecord).map(normalizeConflict),
    total: asNumber(payload.total),
    limit: asNumber(payload.limit, PAGE_SIZE),
    offset: asNumber(payload.offset),
  };
}

function normalizeHistory(value: unknown): ReviewHistoryItem[] {
  const payload = unwrapApi(value);
  if (!Array.isArray(payload)) return [];
  return payload.filter(isRecord).map((entry, index) => ({
    id: asText(entry.id, `review-${index}`),
    previousStatus: asText(entry.previousStatus, 'unknown'),
    newStatus: asText(entry.newStatus, 'unknown'),
    reviewNote: typeof entry.reviewNote === 'string' ? entry.reviewNote : null,
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : null,
    reviewerId: asText(entry.reviewerId),
    reviewerName: asText(entry.reviewerName, 'Unknown reviewer'),
    reviewerEmail: asText(entry.reviewerEmail),
  }));
}

function formatDate(value: string | null): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

function formatConfidence(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function statusClass(status: ConflictStatus): string {
  switch (status) {
    case 'confirmed': return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    case 'resolved': return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    case 'dismissed': return 'border-border bg-muted text-muted-foreground';
    default: return 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300';
  }
}

function ClaimEvidence({ evidence }: { evidence: ConflictEvidence[] }) {
  if (!evidence.length) {
    return <p className="mt-3 text-xs italic text-muted-foreground">No accessible source quotation is available.</p>;
  }

  return (
    <div className="mt-4 space-y-2">
      {evidence.slice(0, 5).map(item => (
        <div key={item.id} className="rounded-lg border border-border/70 bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="break-words">{item.documentName}</span>
            </span>
            <span className="text-[11px] text-muted-foreground">
              {formatConfidence(item.confidence)} evidence confidence
            </span>
          </div>
          <blockquote className="mt-2 border-l-2 border-brand-500/50 pl-3 text-sm leading-6 text-foreground/80">
            â€œ{item.quote}â€
          </blockquote>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-muted-foreground">
            <span>{humanize(item.stance)}</span>
            <span>Last observed: {formatDate(item.lastSeenAt)}</span>
          </div>
        </div>
      ))}
      {evidence.length > 5 && (
        <p className="text-[11px] text-muted-foreground">Showing 5 of {evidence.length} accessible quotations.</p>
      )}
    </div>
  );
}

function ClaimComparison({ title, claim }: { title: string; claim: ConflictClaim }) {
  return (
    <article className="min-w-0 rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        <span className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">{humanize(claim.valueType)}</span>
      </div>
      <p className="mt-3 break-words text-xs text-muted-foreground">{claim.subject} Â· {humanize(claim.predicate)}</p>
      <p className="mt-2 break-words text-xl font-semibold leading-tight">
        {claim.isNegated ? <span className="mr-1 text-rose-600">NOT</span> : null}
        {claim.object}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">Claim confidence: {formatConfidence(claim.confidence)}</p>
      <ClaimEvidence evidence={claim.evidence} />
    </article>
  );
}

function ConflictHistory({ conflictId }: { conflictId: string }) {
  const historyQuery = useQuery<ReviewHistoryItem[], Error>({
    queryKey: ['knowledge', 'conflicts', 'history', conflictId],
    queryFn: async () => {
      const response = await api.get<unknown>(`/knowledge/conflicts/${conflictId}/history`);
      return normalizeHistory(response.data);
    },
    staleTime: 15_000,
  });

  if (historyQuery.isLoading) {
    return <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading review historyâ€¦</div>;
  }
  if (historyQuery.isError) {
    return <p className="py-3 text-xs text-rose-600">Could not load review history: {historyQuery.error.message}</p>;
  }
  if (!historyQuery.data?.length) {
    return <p className="py-3 text-xs text-muted-foreground">No review events have been recorded.</p>;
  }

  return (
    <ol className="space-y-3 py-3">
      {historyQuery.data.map(item => (
        <li key={item.id} className="border-l-2 border-border pl-3">
          <p className="text-xs font-medium">{humanize(item.previousStatus)} â†’ {humanize(item.newStatus)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {item.reviewerName}{item.reviewerEmail ? ` Â· ${item.reviewerEmail}` : ''} Â· {formatDate(item.createdAt)}
          </p>
          {item.reviewNote ? <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/80">{item.reviewNote}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function KnowledgeConflictPanel() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'all' | ConflictStatus>('proposed');
  const [offset, setOffset] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);

  const conflictsQuery = useQuery<ConflictList, Error>({
    queryKey: ['knowledge', 'conflicts', statusFilter, offset],
    queryFn: async () => {
      const response = await api.get<unknown>('/knowledge/conflicts', {
        params: {
          status: statusFilter === 'all' ? undefined : statusFilter,
          limit: PAGE_SIZE,
          offset,
        },
      });
      return normalizeConflictList(response.data);
    },
    retry: 1,
    refetchOnWindowFocus: true,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<unknown>('/knowledge/conflicts/scan');
      return unwrapApi(response.data);
    },
    onSuccess: payload => {
      const detected = isRecord(payload) ? asNumber(payload.detected) : 0;
      toast.success(`Conflict scan completed. ${detected} potential conflict record${detected === 1 ? '' : 's'} detected or refreshed.`);
      setStatusFilter('proposed');
      setOffset(0);
      void queryClient.invalidateQueries({ queryKey: ['knowledge', 'conflicts'] });
    },
    onError: error => toast.error(error instanceof Error ? error.message : 'Conflict scan failed.'),
  });

  const reviewMutation = useMutation({
    mutationFn: async (input: { id: string; status: ReviewStatus; note: string }) => {
      const response = await api.post<unknown>(`/knowledge/conflicts/${input.id}/review`, {
        status: input.status,
        note: input.note.trim() || undefined,
      });
      return unwrapApi(response.data);
    },
    onSuccess: (payload, variables) => {
      const status = isRecord(payload) ? asText(payload.status, variables.status) : variables.status;
      toast.success(`Conflict review saved: ${humanize(status)}.`);
      setNotes(previous => ({ ...previous, [variables.id]: '' }));
      void queryClient.invalidateQueries({ queryKey: ['knowledge', 'conflicts'] });
      void queryClient.invalidateQueries({ queryKey: ['knowledge', 'conflicts', 'history', variables.id] });
    },
    onError: error => toast.error(error instanceof Error ? error.message : 'Could not save conflict review.'),
  });

  const conflicts = conflictsQuery.data?.items ?? [];
  const total = conflictsQuery.data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const changeFilter = (next: typeof statusFilter) => {
    setStatusFilter(next);
    setOffset(0);
    setHistoryOpen(null);
  };

  const submitReview = (conflict: KnowledgeConflict, status: ReviewStatus) => {
    const note = notes[conflict.id] ?? '';
    if (status === 'resolved' && note.trim().length < 8) {
      toast.error('Add a resolution explanation of at least 8 characters.');
      return;
    }
    reviewMutation.mutate({ id: conflict.id, status, note });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-amber-500/10 p-2.5 text-amber-600"><AlertTriangle className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-600">Organizational intelligence</p>
            <h2 className="mt-0.5 text-lg font-semibold">Claim conflict review</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Compare competing claims and their source quotations. Differences remain proposed until a reviewer makes a decision.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void conflictsQuery.refetch()}
            disabled={conflictsQuery.isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${conflictsQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {scanMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Scan for conflicts
          </button>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-3 border-y border-border py-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter conflicts by review status">
          {(['proposed', 'confirmed', 'dismissed', 'resolved', 'all'] as const).map(status => (
            <button
              type="button"
              key={status}
              onClick={() => changeFilter(status)}
              aria-pressed={statusFilter === status}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${statusFilter === status ? 'bg-brand-500 text-white' : 'border border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              {status === 'all' ? 'All statuses' : humanize(status)}
            </button>
          ))}
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {conflictsQuery.isLoading ? 'Loading conflictsâ€¦' : `${total.toLocaleString()} conflict${total === 1 ? '' : 's'}`}
        </p>
      </div>

      {conflictsQuery.isLoading ? (
        <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading claim conflictsâ€¦</div>
      ) : conflictsQuery.isError ? (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/[0.04] p-4">
          <p className="text-sm font-medium text-rose-600">Could not load claim conflicts</p>
          <p className="mt-1 text-xs text-muted-foreground">{conflictsQuery.error.message}</p>
          <button type="button" onClick={() => void conflictsQuery.refetch()} className="mt-3 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white">Retry</button>
        </div>
      ) : conflicts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-3 text-sm font-semibold">No conflicts in this view</p>
          <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-muted-foreground">
            {statusFilter === 'proposed'
              ? 'There are no proposed conflicts currently visible to this account. Run a scan to compare accessible active claims.'
              : 'No records match this review-status filter.'}
          </p>
          {statusFilter === 'proposed' ? (
            <button type="button" onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50">
              <Search className="h-3.5 w-3.5" /> Run conflict scan
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {conflicts.map(conflict => {
            const note = notes[conflict.id] ?? '';
            const canReview = conflict.status === 'proposed' || conflict.status === 'confirmed';
            return (
              <article key={conflict.id} className="overflow-hidden rounded-xl border border-border">
                <div className="flex flex-col justify-between gap-3 bg-muted/20 p-4 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusClass(conflict.status)}`}>{humanize(conflict.status)}</span>
                      <span className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">{humanize(conflict.conflictType)}</span>
                    </div>
                    <h3 className="mt-2 break-words text-sm font-semibold">{conflict.claimA.subject} Â· {humanize(conflict.claimA.predicate)}</h3>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{conflict.detectionReason}</p>
                  </div>
                  <div className="shrink-0 text-left text-[10px] text-muted-foreground sm:text-right">
                    <p>First detected: {formatDate(conflict.firstDetectedAt)}</p>
                    <p className="mt-1">Last detected: {formatDate(conflict.lastDetectedAt)}</p>
                    {conflict.reviewedAt ? <p className="mt-1">Reviewed: {formatDate(conflict.reviewedAt)}</p> : null}
                  </div>
                </div>

                <div className="grid gap-3 p-3 md:grid-cols-2 md:p-4">
                  <ClaimComparison title="Claim A" claim={conflict.claimA} />
                  <ClaimComparison title="Claim B" claim={conflict.claimB} />
                </div>

                {conflict.resolutionNote ? (
                  <div className="mx-4 mb-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Resolution note</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-foreground/80">{conflict.resolutionNote}</p>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 border-t border-border bg-muted/10 p-4">
                  {canReview ? (
                    <div>
                      <label htmlFor={`conflict-note-${conflict.id}`} className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        Reviewer note {conflict.status === 'confirmed' ? '(required to resolve)' : '(optional)'}
                      </label>
                      <textarea
                        id={`conflict-note-${conflict.id}`}
                        value={note}
                        onChange={event => setNotes(previous => ({ ...previous, [conflict.id]: event.target.value }))}
                        rows={2}
                        maxLength={2000}
                        placeholder={conflict.status === 'confirmed' ? 'Explain how the conflict was resolved (at least 8 characters).' : 'Add context for this review decisionâ€¦'}
                        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none transition focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(previous => previous === conflict.id ? null : conflict.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <History className="h-3.5 w-3.5" />
                      {historyOpen === conflict.id ? 'Hide review history' : 'Review history'}
                    </button>

                    {conflict.status === 'proposed' ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => submitReview(conflict, 'dismissed')}
                          disabled={reviewMutation.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Dismiss
                        </button>
                        <button
                          type="button"
                          onClick={() => submitReview(conflict, 'confirmed')}
                          disabled={reviewMutation.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                        >
                          {reviewMutation.isPending && reviewMutation.variables?.id === conflict.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Confirm conflict
                        </button>
                      </div>
                    ) : conflict.status === 'confirmed' ? (
                      <button
                        type="button"
                        onClick={() => submitReview(conflict, 'resolved')}
                        disabled={reviewMutation.isPending || note.trim().length < 8}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {reviewMutation.isPending && reviewMutation.variables?.id === conflict.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Mark resolved
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5" /> No further review action available
                      </span>
                    )}
                  </div>

                  {historyOpen === conflict.id ? (
                    <div className="rounded-lg border border-border bg-background px-3">
                      <div className="flex items-center gap-2 border-b border-border py-2 text-xs font-semibold"><Clock className="h-3.5 w-3.5 text-muted-foreground" /> Review audit trail</div>
                      <ConflictHistory conflictId={conflict.id} />
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">Page {page} of {pageCount} Â· {total.toLocaleString()} total</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0 || conflictsQuery.isFetching} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>
              <button type="button" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total || conflictsQuery.isFetching} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>
      )}

      <p className="flex items-start gap-2 border-t border-border pt-3 text-[10px] leading-5 text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        A detected difference is not proof of a factual contradiction. Review the source context, dates and conditions before confirming. Confirmed conflicts can be marked resolved with an explanatory note; dismissed and resolved records remain in the audit history.
      </p>
    </section>
  );
}