'use client';

import { useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  ListChecks,
  MessageSquareText,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';

type MeetingRecord = {
  id: string;
  title?: string | null;
  status?: string | null;
  team_id?: string | null;
  created_at?: string | null;
  scheduled_at?: string | null;
  duration_seconds?: number | string | null;
  created_by_name?: string | null;
};

type MeetingAnalysis = {
  summary?: string | null;
  summary_revision?: number | string | null;
  key_topics?: unknown;
  agenda_coverage?: unknown;
  open_questions?: unknown;
  risks?: unknown;
  strategic_insights?: string | null;
  sentiment?: string | null;
  review_status?: string | null;
};

type ActionCandidate = {
  id: string;
  action_text: string;
  candidate_assignee_name?: string | null;
  assignee_id?: string | null;
  due_at?: string | null;
  project_id?: string | null;
  priority?: string | null;
  confidence?: number | string | null;
  evidence_excerpt?: string | null;
  source_start_ms?: number | string | null;
  source_end_ms?: number | string | null;
  status: string;
  created_task_id?: string | null;
  rejection_reason?: string | null;
  reviewed_at?: string | null;
};

type DecisionCandidate = {
  id: string;
  description: string;
  decision_maker_candidate?: string | null;
  confidence?: number | string | null;
  evidence_excerpt?: string | null;
  source_start_ms?: number | string | null;
  source_end_ms?: number | string | null;
  status: string;
  knowledge_decision_id?: string | null;
  rejection_reason?: string | null;
  reviewed_at?: string | null;
};

type SummaryRevision = {
  revision: number | string;
  summary: string;
  source?: string | null;
  edited_by_id?: string | null;
  created_at?: string | null;
};

type MeetingReview = {
  meeting: MeetingRecord;
  analysis: MeetingAnalysis | null;
  actions: ActionCandidate[];
  decisions: DecisionCandidate[];
  summaryRevisions: SummaryRevision[];
};

type OrganisationMember = {
  id: string;
  name?: string | null;
  email?: string | null;
  is_active?: boolean;
  status?: string;
};

type Project = {
  id: string;
  name: string;
  team_id?: string | null;
};

type ActionForm = {
  assigneeId: string;
  dueAt: string;
  projectId: string;
  priority: string;
};

type DecisionForm = {
  ownerId: string;
  dueDate: string;
  decisionType: string;
  priority: string;
  expectedOutcome: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function unwrapPayload<T>(payload: unknown): T {
  const record = asRecord(payload);
  return (record.data !== undefined ? record.data : payload) as T;
}

function unwrapArray<T>(payload: unknown): T[] {
  const record = asRecord(payload);
  if (Array.isArray(record.data)) return record.data as T[];
  const nested = asRecord(record.data);
  if (Array.isArray(nested.data)) return nested.data as T[];
  if (Array.isArray(payload)) return payload as T[];
  return [];
}

function errorMessage(error: unknown, fallback: string): string {
  const root = asRecord(error);
  const response = asRecord(root.response);
  const responseData = asRecord(response.data);
  const nested = asRecord(responseData.data);
  const message = nested.message ?? responseData.message ?? root.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function dateTimeLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function isoFromLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function formatDate(value?: string | null): string {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Date unavailable';
}

function formatTimestamp(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return 'Timestamp unavailable';
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'Timestamp unavailable';
  const seconds = Math.floor(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function confidenceLabel(value?: number | string | null): string {
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return 'Confidence unavailable';
  return `${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}% confidence`;
}

function listItems(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return item;
      const record = asRecord(item);
      const label = record.label ?? record.title ?? record.topic ?? record.question ?? record.description ?? record.risk;
      return typeof label === 'string' ? label : '';
    }).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return listItems(parsed);
    } catch {
      return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    }
    return [value.trim()];
  }
  return [];
}

function statusClass(status: string): string {
  switch (status) {
    case 'completed':
    case 'task_created':
    case 'linked':
    case 'approved':
    case 'implemented':
    case 'reviewed':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    case 'rejected':
    case 'cancelled':
    case 'failed':
      return 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400';
    case 'processing':
    case 'proposed':
    case 'transcribing':
    case 'analyzing':
      return 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  count,
}: {
  icon: typeof FileText;
  title: string;
  description?: string;
  count?: number;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-border bg-muted p-2">
          <Icon className="h-4 w-4 text-brand-500" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {count !== undefined && (
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export default function MeetingReviewPage() {
  const params = useParams<{ id: string | string[] }>();
  const meetingId = Array.isArray(params.id) ? params.id[0] : params.id;
  const queryClient = useQueryClient();

  const [summaryDraft, setSummaryDraft] = useState('');
  const [actionForms, setActionForms] = useState<Record<string, ActionForm>>({});
  const [actionReasons, setActionReasons] = useState<Record<string, string>>({});
  const [decisionForms, setDecisionForms] = useState<Record<string, DecisionForm>>({});
  const [decisionReasons, setDecisionReasons] = useState<Record<string, string>>({});

  const reviewQuery = useQuery<MeetingReview>({
    queryKey: ['meetings', 'review', meetingId],
    queryFn: async () => {
      const response = await api.get(`/meetings/${encodeURIComponent(meetingId)}/review`);
      return unwrapPayload<MeetingReview>(response.data);
    },
    enabled: Boolean(meetingId),
    staleTime: 10_000,
  });

  const membersQuery = useQuery<OrganisationMember[]>({
    queryKey: ['meetings', 'review-members'],
    queryFn: async () => {
      const response = await api.get('/organizations/members');
      return unwrapArray<OrganisationMember>(response.data);
    },
    enabled: Boolean(meetingId),
    staleTime: 60_000,
  });

  const projectsQuery = useQuery<Project[]>({
    queryKey: ['meetings', 'review-projects'],
    queryFn: async () => {
      const response = await api.get('/projects');
      return unwrapArray<Project>(response.data);
    },
    enabled: Boolean(meetingId),
    staleTime: 60_000,
  });

  const review = reviewQuery.data;
  const meeting = review?.meeting;
  const analysis = review?.analysis;
  const actions = review?.actions ?? [];
  const decisions = review?.decisions ?? [];
  const activeMembers = (membersQuery.data ?? []).filter((member) =>
    member.is_active === true || member.status === 'active',
  );
  const visibleProjects = useMemo(() => {
    const meetingTeamId = meeting?.team_id ?? null;
    return (projectsQuery.data ?? []).filter((project) =>
      !meetingTeamId || !project.team_id || project.team_id === meetingTeamId,
    );
  }, [projectsQuery.data, meeting?.team_id]);

  useEffect(() => {
    setSummaryDraft(analysis?.summary ?? '');
  }, [meetingId, analysis?.summary, analysis?.summary_revision]);

  const refreshReview = () => queryClient.invalidateQueries({ queryKey: ['meetings', 'review', meetingId] });

  const summaryMutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch(`/meetings/${encodeURIComponent(meetingId)}/summary`, {
        summary: summaryDraft,
      });
      return unwrapPayload<{ revision: number; unchanged: boolean }>(response.data);
    },
    onSuccess: (result) => {
      toast.success(result?.unchanged ? 'Summary is unchanged' : `Summary saved Â· revision ${result?.revision ?? ''}`);
      void refreshReview();
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not save the meeting summary.')),
  });

  const approveActionMutation = useMutation({
    mutationFn: async (input: { actionId: string; form: ActionForm }) => {
      const response = await api.post(
        `/meetings/${encodeURIComponent(meetingId)}/actions/${encodeURIComponent(input.actionId)}/approve`,
        {
          assigneeId: input.form.assigneeId || null,
          dueAt: isoFromLocal(input.form.dueAt),
          projectId: input.form.projectId || null,
          priority: input.form.priority,
        },
      );
      return response.data;
    },
    onSuccess: () => {
      toast.success('Action approved. Task creation is now available.');
      void refreshReview();
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not approve this action.')),
  });

  const rejectActionMutation = useMutation({
    mutationFn: async (input: { actionId: string; reason: string }) => {
      return api.post(
        `/meetings/${encodeURIComponent(meetingId)}/actions/${encodeURIComponent(input.actionId)}/reject`,
        { reason: input.reason },
      );
    },
    onSuccess: () => {
      toast.success('Action proposal rejected');
      void refreshReview();
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not reject this action.')),
  });

  const createTaskMutation = useMutation({
    mutationFn: async (actionId: string) => {
      const response = await api.post(
        `/meetings/${encodeURIComponent(meetingId)}/actions/${encodeURIComponent(actionId)}/create-task`,
      );
      return unwrapPayload<Record<string, unknown>>(response.data);
    },
    onSuccess: (task) => {
      const title = typeof task?.title === 'string' ? task.title : 'Task';
      toast.success(`${title} created or retrieved successfully`);
      void refreshReview();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not create the task.')),
  });

  const acceptDecisionMutation = useMutation({
    mutationFn: async (input: { candidateId: string; form: DecisionForm }) => {
      const response = await api.post(
        `/meetings/${encodeURIComponent(meetingId)}/decisions/${encodeURIComponent(input.candidateId)}/accept`,
        {
          ownerId: input.form.ownerId || null,
          dueDate: isoFromLocal(input.form.dueDate),
          decisionType: input.form.decisionType,
          priority: input.form.priority,
          expectedOutcome: input.form.expectedOutcome.trim() || undefined,
        },
      );
      return unwrapPayload<Record<string, unknown>>(response.data);
    },
    onSuccess: (decision) => {
      const status = typeof decision?.status === 'string' ? decision.status : 'proposed';
      toast.success(`Governance decision created Â· ${status}`);
      void refreshReview();
      queryClient.invalidateQueries({ queryKey: ['decisions'] });
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not accept this decision candidate.')),
  });

  const rejectDecisionMutation = useMutation({
    mutationFn: async (input: { candidateId: string; reason: string }) => {
      return api.post(
        `/meetings/${encodeURIComponent(meetingId)}/decisions/${encodeURIComponent(input.candidateId)}/reject`,
        { reason: input.reason },
      );
    },
    onSuccess: () => {
      toast.success('Decision candidate rejected');
      void refreshReview();
    },
    onError: (error: unknown) => toast.error(errorMessage(error, 'Could not reject this decision candidate.')),
  });

  function actionFormFor(action: ActionCandidate): ActionForm {
    return actionForms[action.id] ?? {
      assigneeId: action.assignee_id ?? '',
      dueAt: dateTimeLocal(action.due_at),
      projectId: action.project_id ?? '',
      priority: action.priority ?? 'medium',
    };
  }

  function updateActionForm(actionId: string, patch: Partial<ActionForm>) {
    const action = actions.find((item) => item.id === actionId);
    if (!action) return;
    setActionForms((current) => ({
      ...current,
      [actionId]: { ...actionFormFor(action), ...patch },
    }));
  }

  function decisionFormFor(candidate: DecisionCandidate): DecisionForm {
    return decisionForms[candidate.id] ?? {
      ownerId: '',
      dueDate: '',
      decisionType: 'operational',
      priority: 'medium',
      expectedOutcome: '',
    };
  }

  function updateDecisionForm(candidateId: string, patch: Partial<DecisionForm>) {
    const candidate = decisions.find((item) => item.id === candidateId);
    if (!candidate) return;
    setDecisionForms((current) => ({
      ...current,
      [candidateId]: { ...decisionFormFor(candidate), ...patch },
    }));
  }

  if (reviewQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-36 animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />
      </div>
    );
  }

  if (reviewQuery.isError || !review || !meeting) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/meetings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to meetings
        </Link>
        <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-6">
          <h1 className="font-semibold text-foreground">Meeting review unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This meeting may still be processing, may not exist, or may not be accessible to your account.
          </p>
          <button
            type="button"
            onClick={() => void reviewQuery.refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const summaryRevision = Number(analysis?.summary_revision ?? 1);
  const openQuestions = listItems(analysis?.open_questions);
  const risks = listItems(analysis?.risks);
  const topics = listItems(analysis?.key_topics);
  const agenda = listItems(analysis?.agenda_coverage);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/meetings" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> All meetings
        </Link>
        <button
          type="button"
          onClick={() => void reviewQuery.refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh review
        </button>
      </div>

      <header className="rounded-2xl border border-border bg-card p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><MessageSquareText className="h-3.5 w-3.5" /> Meeting Intelligence</span>
              <ChevronRight className="h-3 w-3" />
              <span>Review workspace</span>
            </div>
            <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {meeting.title?.trim() || 'Untitled meeting'}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" /> {formatDate(meeting.created_at)}</span>
              {meeting.created_by_name && <span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" /> {meeting.created_by_name}</span>}
              {meeting.duration_seconds !== null && meeting.duration_seconds !== undefined && (
                <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> {Math.max(0, Math.round(Number(meeting.duration_seconds) / 60))} min</span>
              )}
            </div>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${statusClass(meeting.status ?? 'unknown')}`}>
            {meeting.status ?? 'unknown'}
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Action proposals</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{actions.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Decision candidates</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{decisions.length}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Summary revision</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">v{Number.isFinite(summaryRevision) ? summaryRevision : 1}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Review history</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{review.summaryRevisions?.length ?? 0}</p>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading
            icon={FileText}
            title="Meeting summary"
            description="Edit the generated summary. Each saved change is retained as a revision."
          />
          <span className="text-xs text-muted-foreground">Up to 50,000 characters</span>
        </div>
        {analysis ? (
          <>
            <textarea
              value={summaryDraft}
              onChange={(event) => setSummaryDraft(event.target.value)}
              maxLength={50_000}
              rows={8}
              aria-label="Editable meeting summary"
              className="mt-4 w-full resize-y rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              placeholder="The meeting summary will appear here after analysis."
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{summaryDraft.length.toLocaleString()} / 50,000 characters</span>
              <button
                type="button"
                onClick={() => summaryMutation.mutate()}
                disabled={!summaryDraft.trim() || summaryMutation.isPending || summaryDraft === (analysis.summary ?? '')}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {summaryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save summary
              </button>
            </div>
          </>
        ) : (
          <EmptyState>Summary is not available yet. The meeting may still be processing.</EmptyState>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <SectionHeading icon={Sparkles} title="Topics and agenda" description="Topics and coverage extracted from the source." />
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key topics</h3>
              {topics.length ? <div className="flex flex-wrap gap-2">{topics.map((item, index) => <span key={`${item}-${index}`} className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs">{item}</span>)}</div> : <p className="text-sm text-muted-foreground">No topics recorded.</p>}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agenda coverage</h3>
              {agenda.length ? <ul className="space-y-1.5 text-sm text-foreground">{agenda.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">No agenda coverage recorded.</p>}
            </div>
            {analysis?.strategic_insights && (
              <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-3">
                <h3 className="mb-1 text-xs font-semibold text-brand-600 dark:text-brand-400">Strategic insight</h3>
                <p className="whitespace-pre-wrap text-sm text-foreground">{analysis.strategic_insights}</p>
              </div>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <SectionHeading icon={AlertTriangle} title="Open questions and risks" description="Items requiring follow-up or human attention." />
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open questions</h3>
              {openQuestions.length ? <ul className="list-inside list-disc space-y-1.5 text-sm text-foreground">{openQuestions.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">No open questions recorded.</p>}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risks</h3>
              {risks.length ? <ul className="list-inside list-disc space-y-1.5 text-sm text-foreground">{risks.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">No risks recorded.</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={ListChecks}
          title="Action proposals"
          description="Review the source evidence and task fields. No task is created until you explicitly approve the proposal and create it."
          count={actions.length}
        />
        {actions.length === 0 ? (
          <EmptyState>No action proposals were identified for this meeting.</EmptyState>
        ) : actions.map((action) => {
          const form = actionFormFor(action);
          const canReview = action.status === 'proposed';
          const canCreateTask = action.status === 'approved';
          return (
            <article key={action.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap font-medium leading-6 text-foreground">{action.action_text}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{confidenceLabel(action.confidence)}</span>
                    <span>Source {formatTimestamp(action.source_start_ms)}{action.source_end_ms != null ? `â€“${formatTimestamp(action.source_end_ms)}` : ''}</span>
                    {action.candidate_assignee_name && <span>Suggested owner: {action.candidate_assignee_name} (unconfirmed)</span>}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(action.status)}`}>{action.status.replace('_', ' ')}</span>
              </div>
              {action.evidence_excerpt && (
                <blockquote className="mt-4 rounded-lg border-l-2 border-brand-500 bg-muted/50 px-4 py-3 text-sm leading-6 text-muted-foreground">
                  â€œ{action.evidence_excerpt}â€
                </blockquote>
              )}

              {canReview && (
                <div className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/20 p-4 md:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    Assign to
                    <select
                      value={form.assigneeId}
                      onChange={(event) => updateActionForm(action.id, { assigneeId: event.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="">Unassigned</option>
                      {activeMembers.map((member) => <option key={member.id} value={member.id}>{member.name?.trim() || member.email || member.id}</option>)}
                    </select>
                    {membersQuery.isError && <span className="block font-normal text-amber-600">Member list unavailable; you can leave this action unassigned.</span>}
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    Project
                    <select
                      value={form.projectId}
                      onChange={(event) => updateActionForm(action.id, { projectId: event.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="">No project</option>
                      {visibleProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                    {projectsQuery.isError && <span className="block font-normal text-amber-600">Project list unavailable; you can leave this unlinked.</span>}
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    Due date
                    <input
                      type="datetime-local"
                      value={form.dueAt}
                      onChange={(event) => updateActionForm(action.id, { dueAt: event.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    Priority
                    <select
                      value={form.priority}
                      onChange={(event) => updateActionForm(action.id, { priority: event.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    <button
                      type="button"
                      onClick={() => approveActionMutation.mutate({ actionId: action.id, form })}
                      disabled={approveActionMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {approveActionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Approve proposal
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const reason = actionReasons[action.id] ?? '';
                        if (reason.trim().length < 8) {
                          toast.error('Enter a rejection reason of at least 8 characters.');
                          return;
                        }
                        rejectActionMutation.mutate({ actionId: action.id, reason });
                      }}
                      disabled={rejectActionMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50"
                    >
                      <Ban className="h-4 w-4" /> Reject
                    </button>
                    <input
                      value={actionReasons[action.id] ?? ''}
                      onChange={(event) => setActionReasons((current) => ({ ...current, [action.id]: event.target.value }))}
                      maxLength={2000}
                      placeholder="Rejection reason (8â€“2,000 characters)"
                      aria-label="Action rejection reason"
                      className="min-w-52 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </div>
                </div>
              )}

              {canCreateTask && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">Approved and ready for execution. Create the linked task when appropriate.</p>
                  <button
                    type="button"
                    onClick={() => createTaskMutation.mutate(action.id)}
                    disabled={createTaskMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {createTaskMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Create task
                  </button>
                </div>
              )}
              {action.status === 'task_created' && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Task created {action.created_task_id ? `Â· ${action.created_task_id}` : ''}
                </div>
              )}
              {action.status === 'rejected' && action.rejection_reason && (
                <p className="mt-3 text-xs text-muted-foreground">Rejection reason: {action.rejection_reason}</p>
              )}
            </article>
          );
        })}
      </section>

      <section className="space-y-4">
        <SectionHeading
          icon={BriefcaseBusiness}
          title="Decision candidates"
          description="Accepting a candidate creates a linked governance decision and submits it through the approval workflow. It does not itself approve the underlying business decision."
          count={decisions.length}
        />
        {decisions.length === 0 ? (
          <EmptyState>No decision candidates were identified for this meeting.</EmptyState>
        ) : decisions.map((candidate) => {
          const form = decisionFormFor(candidate);
          const canAccept = candidate.status === 'proposed' || (candidate.status === 'approved' && !candidate.knowledge_decision_id);
          return (
            <article key={candidate.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap font-medium leading-6 text-foreground">{candidate.description}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{confidenceLabel(candidate.confidence)}</span>
                    <span>Source {formatTimestamp(candidate.source_start_ms)}{candidate.source_end_ms != null ? `â€“${formatTimestamp(candidate.source_end_ms)}` : ''}</span>
                    {candidate.decision_maker_candidate && <span>Decision maker mentioned: {candidate.decision_maker_candidate} (unconfirmed)</span>}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass(candidate.status)}`}>{candidate.status}</span>
              </div>
              {candidate.evidence_excerpt && (
                <blockquote className="mt-4 rounded-lg border-l-2 border-brand-500 bg-muted/50 px-4 py-3 text-sm leading-6 text-muted-foreground">
                  â€œ{candidate.evidence_excerpt}â€
                </blockquote>
              )}

              {canAccept && (
                <div className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/20 p-4 md:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    Decision owner (optional)
                    <select
                      value={form.ownerId}
                      onChange={(event) => updateDecisionForm(candidate.id, { ownerId: event.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="">Leave unassigned</option>
                      {activeMembers.map((member) => <option key={member.id} value={member.id}>{member.name?.trim() || member.email || member.id}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    Decision type
                    <select
                      value={form.decisionType}
                      onChange={(event) => updateDecisionForm(candidate.id, { decisionType: event.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="operational">Operational</option>
                      <option value="strategic">Strategic</option>
                      <option value="product">Product</option>
                      <option value="technical">Technical</option>
                      <option value="financial">Financial</option>
                      <option value="customer">Customer</option>
                      <option value="people">People</option>
                      <option value="compliance">Compliance</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    Priority
                    <select
                      value={form.priority}
                      onChange={(event) => updateDecisionForm(candidate.id, { priority: event.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                    Due date (optional)
                    <input
                      type="datetime-local"
                      value={form.dueDate}
                      onChange={(event) => updateDecisionForm(candidate.id, { dueDate: event.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-muted-foreground md:col-span-2">
                    Expected outcome (optional)
                    <textarea
                      rows={2}
                      value={form.expectedOutcome}
                      onChange={(event) => updateDecisionForm(candidate.id, { expectedOutcome: event.target.value })}
                      maxLength={8000}
                      placeholder="Describe what success should look like."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    <button
                      type="button"
                      onClick={() => acceptDecisionMutation.mutate({ candidateId: candidate.id, form })}
                      disabled={acceptDecisionMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {acceptDecisionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Accept and create governance record
                    </button>
                    {candidate.status === 'proposed' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const reason = decisionReasons[candidate.id] ?? '';
                            if (reason.trim().length < 8) {
                              toast.error('Enter a rejection reason of at least 8 characters.');
                              return;
                            }
                            rejectDecisionMutation.mutate({ candidateId: candidate.id, reason });
                          }}
                          disabled={rejectDecisionMutation.isPending}
                          className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50"
                        >
                          <Ban className="h-4 w-4" /> Reject
                        </button>
                        <input
                          value={decisionReasons[candidate.id] ?? ''}
                          onChange={(event) => setDecisionReasons((current) => ({ ...current, [candidate.id]: event.target.value }))}
                          maxLength={2000}
                          placeholder="Rejection reason (8â€“2,000 characters)"
                          aria-label="Decision rejection reason"
                          className="min-w-52 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              {candidate.status === 'linked' && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> Governance record created
                  </div>
                  <Link href="/decisions" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
                    Open decisions <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
              {candidate.status === 'rejected' && candidate.rejection_reason && (
                <p className="mt-3 text-xs text-muted-foreground">Rejection reason: {candidate.rejection_reason}</p>
              )}
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <SectionHeading
          icon={Clock3}
          title="Summary revision history"
          description="Previous summaries are retained for traceability."
          count={review.summaryRevisions?.length ?? 0}
        />
        {review.summaryRevisions?.length ? (
          <div className="mt-4 divide-y divide-border">
            {review.summaryRevisions.map((revision) => (
              <details key={`${revision.revision}-${revision.created_at ?? ''}`} className="py-3 first:pt-0 last:pb-0">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">Revision {revision.revision} Â· {revision.source === 'human' ? 'Edited by a reviewer' : 'Generated summary'}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(revision.created_at)}</span>
                </summary>
                <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">{revision.summary}</p>
              </details>
            ))}
          </div>
        ) : (
          <div className="mt-4"><EmptyState>No previous summary revisions have been recorded.</EmptyState></div>
        )}
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Review changes are organisation-scoped and recorded by the API. Transcript-derived names are suggestions only; task assignees and decision owners remain unassigned until a reviewer selects an active organisation member. Formal decision approval remains governed by the Knowledge Decisions approval policy.
        </p>
      </div>
    </div>
  );
}