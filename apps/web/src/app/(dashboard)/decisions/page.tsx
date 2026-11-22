'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  History,
  AlertCircle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Scale,
  Search,
  CheckCircle2,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import DecisionPortfolioPanel from './decision-portfolio-panel';
import DecisionGovernancePanel, { type DecisionGovernanceOverview } from './decision-governance-panel';
import api from '@/lib/api';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/primitives';

type DecisionStatus = 'draft' | 'proposed' | 'approved' | 'rejected' | 'implemented' | 'reviewed' | 'withdrawn';
type DecisionType = 'strategic' | 'operational' | 'product' | 'technical' | 'financial' | 'customer' | 'people' | 'compliance' | 'other';
type DecisionPriority = 'low' | 'medium' | 'high' | 'critical';
type DecisionLinkType = 'claim' | 'conflict' | 'goal' | 'objective' | 'project' | 'task' | 'document';

type DecisionLink = {
  id: string;
  linkType: DecisionLinkType;
  linkedId: string;
  linkLabel?: string | null;
  createdAt?: string;
};

type DecisionHistory = {
  id: string;
  previousStatus?: DecisionStatus;
  newStatus?: DecisionStatus;
  reviewNote?: string | null;
  outcomeAssessment?: DecisionOutcomeAssessment | null;
  createdAt?: string;
  reviewerName?: string | null;
  reviewerEmail?: string | null;
};

type DecisionHistoryPage = {
  items: DecisionHistory[];
  total: number;
  limit: number;
  offset: number;
};

type DecisionTaskOption = {
  id: string;
  title: string;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  assignee_name?: string | null;
  project_name?: string | null;
};
type DecisionExecutionHealth = 'not_started' | 'on_track' | 'at_risk' | 'completed';
type DecisionExecutionAlert = {
  type: 'overdue' | 'stalled' | 'unassigned';
  severity: 'critical' | 'warning';
  count: number;
  title: string;
  message: string;
};

type DecisionExecutionTask = {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  is_overdue: boolean;
  is_stalled: boolean;
  is_unassigned: boolean;
  is_completed: boolean;
  is_on_track: boolean;
  health: 'completed' | 'overdue' | 'stalled' | 'unassigned' | 'on_track';
};

type DecisionExecutionSummary = {
  total: number;
  completed: number;
  inProgress: number;
  todo: number;
  overdue: number;
  stalled: number;
  unassigned: number;
  onTrack: number;
  health: DecisionExecutionHealth;
  alerts: DecisionExecutionAlert[];
  completionPercent: number;
  tasks: DecisionExecutionTask[];
};

type DecisionOutcomeAssessment = 'achieved' | 'partially_achieved' | 'not_achieved' | 'inconclusive';

type DecisionOutcomeQueueItem = {
  id: string;
  title: string;
  priority: DecisionPriority;
  reviewDueAt: string;
  expectedOutcome?: string | null;
  ownerName?: string | null;
  isOverdue: boolean;
  daysOverdue: number;
};

type DecisionOutcomeAnalytics = {
  implemented: number;
  reviewed: number;
  assessed: number;
  pendingReview: number;
  achieved: number;
  partiallyAchieved: number;
  notAchieved: number;
  inconclusive: number;
  overdueReviews: number;
  dueSoonReviews: number;
  missingReviewDate: number;
  missingExpectedOutcome: number;
  achievementRate: number;
  positiveOutcomeRate: number;
  reviewQueue: DecisionOutcomeQueueItem[];
};

type Decision = {
  id: string;
  organization_id: string;
  title: string;
  description?: string | null;
  rationale?: string | null;
  decision_type: DecisionType;
  status: DecisionStatus;
  priority: DecisionPriority;
  owner_id?: string | null;
  owner_name?: string | null;
  team_id?: string | null;
  created_by_id?: string | null;
  created_by_name?: string | null;
  approved_by_id?: string | null;
  approval_policy_id?: string | null;
  approval_required_role?: string | null;
  approval_due_at?: string | null;
  approval_delegation_allowed?: boolean;
  approval_escalated_at?: string | null;
  approval_escalation_count?: number;
  expected_outcome?: string | null;
  actual_outcome?: string | null;
  outcome_assessment?: DecisionOutcomeAssessment | null;
  rejection_reason?: string | null;
  decision_at?: string | null;
  due_date?: string | null;
  review_due_at?: string | null;
  implemented_at?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  links?: DecisionLink[];
  history?: DecisionHistory[];
  execution?: DecisionExecutionSummary;
};

type DecisionListResponse = { items: Decision[]; total: number; limit: number; offset: number };
type DecisionFormState = {
  title: string;
  description: string;
  rationale: string;
  expectedOutcome: string;
  decisionType: DecisionType;
  priority: DecisionPriority;
  ownerId: string;
  teamId: string;
  dueDate: string;
  reviewDueAt: string;
};

const STATUSES: DecisionStatus[] = ['draft', 'proposed', 'approved', 'rejected', 'implemented', 'reviewed', 'withdrawn'];
const TYPES: DecisionType[] = ['strategic', 'operational', 'product', 'technical', 'financial', 'customer', 'people', 'compliance', 'other'];
const PRIORITIES: DecisionPriority[] = ['low', 'medium', 'high', 'critical'];
const LINK_TYPES: DecisionLinkType[] = ['claim', 'conflict', 'goal', 'objective', 'project', 'task', 'document'];
const PAGE_SIZE = 25;
const HISTORY_PAGE_SIZE = 25;
const APPROVAL_RANK: Record<string, number> = { viewer: 0, member: 1, manager: 2, admin: 3, owner: 4, super_admin: 5 };

const TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  draft: ['proposed', 'withdrawn'],
  proposed: ['approved', 'rejected', 'withdrawn'],
  approved: ['implemented', 'withdrawn'],
  rejected: [],
  implemented: ['reviewed'],
  reviewed: [],
  withdrawn: [],
};
const EMPTY_FORM: DecisionFormState = {
  title: '', description: '', rationale: '', expectedOutcome: '',
  decisionType: 'operational', priority: 'medium', ownerId: '', teamId: '', dueDate: '', reviewDueAt: '',
};

function unwrap<T>(value: any): T {
  let result = value;
  for (let index = 0; index < 2; index += 1) {
    if (result && typeof result === 'object' && 'data' in result) result = result.data;
    else break;
  }
  return result as T;
}

function errorMessage(error: any, fallback: string): string {
  const message = error?.response?.data?.message ?? error?.message;
  if (Array.isArray(message)) return message.join(', ');
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function formatDate(value?: string | null): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function toDateInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function statusStyle(status: DecisionStatus): string {
  const styles: Record<DecisionStatus, string> = {
    draft: 'border-slate-400/25 bg-slate-500/10 text-slate-600 dark:text-slate-300',
    proposed: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    approved: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    rejected: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    implemented: 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    reviewed: 'border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300',
    withdrawn: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  };
  return styles[status] ?? styles.draft;
}

function priorityStyle(priority: DecisionPriority): string {
  if (priority === 'critical') return 'text-rose-600 dark:text-rose-400';
  if (priority === 'high') return 'text-amber-600 dark:text-amber-400';
  if (priority === 'medium') return 'text-sky-600 dark:text-sky-400';
  return 'text-muted-foreground';
}

function transitionLabel(status: DecisionStatus): string {
  const labels: Record<DecisionStatus, string> = {
    draft: 'Draft', proposed: 'Submit for approval', approved: 'Approve', rejected: 'Reject',
    implemented: 'Mark implemented', reviewed: 'Complete review', withdrawn: 'Withdraw',
  };
  return labels[status];
}

function fieldClass(): string {
  return 'w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15';
}

function labelClass(): string {
  return 'mb-1.5 block text-xs font-semibold text-muted-foreground';
}

function StatusBadge({ status }: { status: DecisionStatus }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold  ${statusStyle(status)}`}>{status}</span>;
}

export default function DecisionsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('decision');
    if (id && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) setSelectedId(id);
  }, []);
  const [historyPage, setHistoryPage] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DecisionFormState>(EMPTY_FORM);
  const [transitionTarget, setTransitionTarget] = useState<DecisionStatus | null>(null);
  const [transitionNote, setTransitionNote] = useState('');
  const [actualOutcome, setActualOutcome] = useState('');
  const [outcomeAssessment, setOutcomeAssessment] = useState<DecisionOutcomeAssessment | ''>('');
  const [delegationId, setDelegationId] = useState('');
  const [linkType, setLinkType] = useState<DecisionLinkType>('objective');
  const [linkId, setLinkId] = useState('');
  const [selectedObjectiveId, setSelectedObjectiveId] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [objectiveSearch, setObjectiveSearch] = useState('');
  const [executionTaskTitle, setExecutionTaskTitle] = useState('');
  const [executionTaskPriority, setExecutionTaskPriority] = useState('decision');
  const [executionTaskDueDate, setExecutionTaskDueDate] = useState('');

  const outcomeAnalyticsQuery = useQuery<DecisionOutcomeAnalytics>({
    queryKey: ['decisions', 'outcome-analytics'],
    queryFn: async () => {
      const response = await api.get('/knowledge/decisions/outcomes/analytics');
      return unwrap<DecisionOutcomeAnalytics>(response.data);
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const governanceQuery = useQuery<DecisionGovernanceOverview>({
    queryKey: ['decisions', 'governance', user?.organizationId, user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const response = await api.get('/knowledge/decisions/governance/overview');
      return unwrap<DecisionGovernanceOverview>(response.data);
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
  });

  const listQuery = useQuery<DecisionListResponse>({
    queryKey: ['decisions', 'list', search, statusFilter, typeFilter, priorityFilter, page],
    queryFn: async () => {
      const response = await api.get('/knowledge/decisions', {
        params: {
          search: search.trim() || undefined,
          status: statusFilter === 'all' ? undefined : statusFilter,
          decisionType: typeFilter === 'all' ? undefined : typeFilter,
          priority: priorityFilter === 'all' ? undefined : priorityFilter,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      });
      return unwrap<DecisionListResponse>(response.data);
    },
  });

  const countsQuery = useQuery<Record<DecisionStatus, number>>({
    queryKey: ['decisions', 'status-counts'],
    queryFn: async () => {
      const entries = await Promise.all(STATUSES.map(async (status) => {
        const response = await api.get('/knowledge/decisions', { params: { status, limit: 1, offset: 0 } });
        const payload = unwrap<DecisionListResponse>(response.data);
        return [status, Number(payload?.total ?? 0)] as const;
      }));
      return Object.fromEntries(entries) as Record<DecisionStatus, number>;
    },
    staleTime: 30_000,
  });

  const detailQuery = useQuery<Decision>({
    queryKey: ['decisions', 'detail', selectedId],
    queryFn: async () => {
      const response = await api.get(`/knowledge/decisions/${selectedId}`);
      return unwrap<Decision>(response.data);
    },
    enabled: Boolean(selectedId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    setHistoryPage(0);
  }, [selectedId]);

  const historyQuery = useQuery<DecisionHistoryPage>({
    queryKey: ['decisions', 'history', selectedId, historyPage],
    queryFn: async () => {
      const response = await api.get(
        `/knowledge/decisions/${selectedId}/history/page`,
        {
          params: {
            limit: HISTORY_PAGE_SIZE,
            offset: historyPage * HISTORY_PAGE_SIZE,
          },
        },
      );
      return unwrap<DecisionHistoryPage>(response.data);
    },
    enabled: Boolean(selectedId),
    staleTime: 30_000,
  });

  // Pull the objectives already maintained by Founder OS; do not create a parallel OKR store.
  const founderOsQuery = useQuery<Record<string, unknown>>({
    queryKey: ['founder-os', 'dashboard'],
    queryFn: async () => {
      const response = await api.get('/founder-os/dashboard');
      return unwrap<Record<string, unknown>>(response.data);
    },
    enabled: Boolean(selectedId),
    staleTime: 60_000,
  });

  const taskOptionsQuery = useQuery<DecisionTaskOption[]>({
    queryKey: ['decisions', 'task-options', taskSearch],
    queryFn: async () => {
      const response = await api.get('/tasks', {
        params: {
          search: taskSearch.trim() || undefined,
          page: 1,
          pageSize: 40,
        },
      });

      const payload = response.data?.data;
      return Array.isArray(payload?.data)
        ? payload.data as DecisionTaskOption[]
        : [];
    },
    enabled: Boolean(selectedId) && linkType === 'task',
    staleTime: 15_000,
  });
  const saveMutation = useMutation({
    mutationFn: async (variables: { id: string | null; payload: Record<string, unknown> }) => {
      return variables.id
        ? api.post(`/knowledge/decisions/${variables.id}/update`, variables.payload)
        : api.post('/knowledge/decisions', variables.payload);
    },
    onSuccess: (response, variables) => {
      const saved = unwrap<Decision>(response.data);
      const decisionId = variables.id ?? saved?.id;
      toast.success(variables.id ? 'Decision updated' : 'Decision created');
      setComposerOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      if (decisionId) setSelectedId(decisionId);
      queryClient.invalidateQueries({ queryKey: ['decisions'] });
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Could not save this decision.')),
  });

  const transitionMutation = useMutation({
    mutationFn: async (variables: { status: DecisionStatus; note: string; actualOutcome: string; outcomeAssessment: DecisionOutcomeAssessment | ''; delegationId: string }) => {
      if (!selectedId) throw new Error('Select a decision first.');
      return api.post(`/knowledge/decisions/${selectedId}/transition`, {
        status: variables.status,
        note: variables.note || undefined,
        actualOutcome: variables.actualOutcome || undefined,
        outcomeAssessment: variables.outcomeAssessment || undefined,
        delegationId: variables.delegationId || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Decision lifecycle updated');
      setTransitionTarget(null);
      setTransitionNote('');
      setActualOutcome('');
      setOutcomeAssessment('');
      setDelegationId('');
      queryClient.invalidateQueries({ queryKey: ['decisions'] });
      queryClient.invalidateQueries({ queryKey: ['decisions', 'outcome-analytics'] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ['decisions', 'detail', selectedId] });
    },
    onError: (error: any) => toast.error(errorMessage(error, 'The lifecycle transition was rejected.')),
  });

  const addLinkMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Select a decision first.');
      return api.post(`/knowledge/decisions/${selectedId}/links`, { linkType, linkedId: linkId.trim() });
    },
    onSuccess: () => {
      toast.success('Record linked to decision');
      setLinkId('');
      if (selectedId) queryClient.invalidateQueries({ queryKey: ['decisions', 'detail', selectedId] });
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Could not link that record. Check its ID and access.')),
  });

  const removeLinkMutation = useMutation({
    mutationFn: async (recordLinkId: string) => {
      if (!selectedId) throw new Error('Select a decision first.');
      return api.post(`/knowledge/decisions/${selectedId}/links/${recordLinkId}/remove`);
    },
    onSuccess: () => {
      toast.success('Decision link removed');
      if (selectedId) queryClient.invalidateQueries({ queryKey: ['decisions', 'detail', selectedId] });
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Could not remove that link.')),
  });

  const decisions = listQuery.data?.items ?? [];  // V4.5_EXECUTION_ALIGNMENT: task creation reuses the existing Tasks API and then links its returned ID.
  const createExecutionTaskMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !selected) throw new Error('Select a decision first.');
      if (selected.status !== 'approved') throw new Error('Only approved decisions can generate execution tasks.');
      const taskPriority: Record<DecisionPriority, string> = {
        critical: 'urgent', high: 'high', medium: 'medium', low: 'low',
      };
      const taskDescription = [
        selected.description?.trim(),
        selected.rationale?.trim() ? `Decision rationale: ${selected.rationale.trim()}` : '',
        selected.expected_outcome?.trim() ? `Expected outcome: ${selected.expected_outcome.trim()}` : '',
        `Originating decision ID: ${selectedId}`,
      ].filter(Boolean).join('\n\n').slice(0, 8000);
      const taskTitle = (executionTaskTitle.trim() || `Execute decision: ${selected.title}`).slice(0, 240);      const response = await api.post('/tasks', {
        title: taskTitle,
        description: taskDescription,
        priority: executionTaskPriority === 'decision' ? taskPriority[selected.priority] : executionTaskPriority,
        dueDate: executionTaskDueDate || selected.due_date || undefined,
        assigneeId: selected.owner_id || undefined,
        teamId: selected.team_id || undefined,
        tags: ['decision-execution'],
      });
      // TasksService.create returns findById(...), which returns the persisted task row.
      const taskRecord = unwrap<Record<string, unknown>>(response.data);
      const taskId = String(taskRecord?.id ?? '');
      if (!taskId) {
        throw new Error('The Tasks API did not return a task ID. Check Tasks & Projects before retrying to avoid creating a duplicate.');
      }
      try {
        await api.post(`/knowledge/decisions/${selectedId}/links`, { linkType: 'task', linkedId: taskId });
        return { taskId, taskTitle: String(taskRecord?.title ?? taskTitle), linked: true };
      } catch {
        return { taskId, taskTitle: String(taskRecord?.title ?? taskTitle), linked: false };
      }
    },
    onSuccess: ({ taskId, taskTitle, linked }) => {
      setExecutionTaskTitle('');
      setExecutionTaskPriority('decision');
      setExecutionTaskDueDate('');
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['decisions'] });
      if (selectedId) queryClient.invalidateQueries({ queryKey: ['decisions', 'detail', selectedId] });
      if (linked) {
        toast.success('Execution task created and linked to this decision');
      } else {
        setLinkType('task');
        setTaskSearch(taskTitle);
        setLinkId(taskId);
        toast.error('Task was created, but the decision link failed. Its ID is loaded into the link form so you can retry safely.');
      }
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Could not create the execution task.')),
  });

  const linkObjectiveMutation = useMutation({
    mutationFn: async (objectiveId: string) => {
      if (!selectedId) throw new Error('Select a decision first.');
      await api.post(`/knowledge/decisions/${selectedId}/links`, {
        linkType: 'objective',
        linkedId: objectiveId,
      });
      return objectiveId;
    },
    onSuccess: () => {
      setSelectedObjectiveId('');
      toast.success('Founder OS objective aligned with this decision');
      if (selectedId) queryClient.invalidateQueries({ queryKey: ['decisions', 'detail', selectedId] });
    },
    onError: (error: any) => toast.error(errorMessage(error, 'Could not link the Founder OS objective.')),
  });

  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selected = detailQuery.data;
  const nextStatuses: DecisionStatus[] = selected ? (TRANSITIONS[selected.status] ?? []) : [];
  const execution = selected?.execution;
  const executionTasks = execution?.tasks ?? [];
  const executionPercent = Math.min(
    100,
    Math.max(0, execution?.completionPercent ?? 0),
  );
  const okrBlock = founderOsQuery.data?.okrs as Record<string, unknown> | undefined;
  const rawObjectives = okrBlock?.objectives;
  const objectiveOptions = (Array.isArray(rawObjectives) ? rawObjectives : [])
    .map((item) => item as Record<string, unknown>)
    .map((item) => ({
      id: String(item.id ?? item.objective_id ?? ''),
      title: String(item.title ?? item.name ?? item.objective_title ?? 'Untitled objective'),
    }))
    .filter((item) => Boolean(item.id));
  const selectedLinks = selected?.links ?? [];
  const linkedObjectiveIds = new Set(selectedLinks.filter((link) => link.linkType === 'objective').map((link) => link.linkedId));
  const availableObjectives = objectiveOptions.filter((objective) => !linkedObjectiveIds.has(objective.id));
  const filteredAvailableObjectives = availableObjectives.filter((objective) =>
    objective.title.toLowerCase().includes(objectiveSearch.trim().toLowerCase()),
  );
  const linkedTaskIds = new Set(
    selectedLinks.filter((link) => link.linkType === 'task').map((link) => link.linkedId),
  );
  const availableTaskOptions = (taskOptionsQuery.data ?? []).filter(
    (task) => !linkedTaskIds.has(task.id),
  );
  const linkedGoalCount = selectedLinks.filter((link) => link.linkType === 'goal' || link.linkType === 'objective').length;
  const linkedEvidenceCount = selectedLinks.filter((link) => ['claim', 'conflict', 'document'].includes(link.linkType)).length;
  const linkedTaskCount = selectedLinks.filter((link) => link.linkType === 'task').length;

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setComposerOpen(true);
  }

  function startEdit(decision: Decision) {
    setEditingId(decision.id);
    setForm({
      title: decision.title ?? '',
      description: decision.description ?? '',
      rationale: decision.rationale ?? '',
      expectedOutcome: decision.expected_outcome ?? '',
      decisionType: decision.decision_type ?? 'operational',
      priority: decision.priority ?? 'medium',
      ownerId: decision.owner_id ?? '',
      teamId: decision.team_id ?? '',
      dueDate: toDateInput(decision.due_date),
      reviewDueAt: toDateInput(decision.review_due_at),
    });
    setComposerOpen(true);
  }

  function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      rationale: form.rationale.trim() || null,
      expectedOutcome: form.expectedOutcome.trim() || null,
      decisionType: form.decisionType,
      priority: form.priority,
      ownerId: form.ownerId.trim() || null,
      teamId: form.teamId.trim() || null,
      dueDate: form.dueDate || null,
      reviewDueAt: form.reviewDueAt || null,
    };
    saveMutation.mutate({ id: editingId, payload });
  }

  function submitTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transitionTarget) return;
    const noteRequired = transitionTarget === 'rejected' || transitionTarget === 'reviewed';
    if (noteRequired && transitionNote.trim().length < 8) {
      toast.error(transitionTarget === 'rejected' ? 'Add a rejection explanation of at least 8 characters.' : 'Add a review note of at least 8 characters.');
      return;
    }
    if (transitionTarget === 'reviewed' && !outcomeAssessment) {
      toast.error('Select an outcome assessment before completing the review.');
      return;
    }
    if (transitionTarget === 'reviewed' && actualOutcome.trim().length < 8) {
      toast.error('Record an actual outcome of at least 8 characters before completing the review.');
      return;
    }
    transitionMutation.mutate({
      status: transitionTarget,
      note: transitionNote.trim(),
      actualOutcome: actualOutcome.trim(),
      outcomeAssessment,
      delegationId: delegationId.trim(),
    });
  }

  function chooseStatus(status: string) {
    setStatusFilter(status);
    setPage(0);
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 pb-10">
      <PageHeader
        hero
        icon={Scale}
        title="Decision Intelligence"
        description="Create accountable decisions, move them through a controlled lifecycle, and connect each outcome to the evidence and operating records behind it."
        actions={
          <button type="button" onClick={startCreate} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-glow-primary transition hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New decision
          </button>
        }
      >
        <nav aria-label="Decision Intelligence shortcuts" className="flex flex-wrap gap-2">
          <a href="#decision-governance" className="rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground">Approval controls</a>
          <a href="#decision-registry" className="rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground">Decision registry</a>
          <a href="#decision-outcomes" className="rounded-lg border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground">Outcome review</a>
        </nav>
      </PageHeader>

      <DecisionGovernancePanel key={user?.id} onOpenDecision={(id) => {
        setSelectedId(id);
        document.getElementById('decision-detail')?.scrollIntoView({ block: 'start' });
      }} onViewPending={() => {
        setSearch('');
        setTypeFilter('all');
        setPriorityFilter('all');
        chooseStatus('proposed');
        document.getElementById('decision-registry')?.scrollIntoView({ block: 'start' });
      }} />

      <DecisionPortfolioPanel />

      <section id="decision-outcomes" className="scroll-mt-5 space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Outcome intelligence</h2>
            <p className="mt-1 text-xs text-muted-foreground">Measure implemented decisions against their intended outcomes and review commitments.</p>
          </div>
          <button type="button" onClick={() => void outcomeAnalyticsQuery.refetch()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">
            <RefreshCw className={`h-3.5 w-3.5 ${outcomeAnalyticsQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: 'Implemented', value: outcomeAnalyticsQuery.data?.implemented ?? 0 },
            { label: 'Assessed', value: outcomeAnalyticsQuery.data?.assessed ?? 0 },
            { label: 'Achievement rate', value: `${outcomeAnalyticsQuery.data?.achievementRate ?? 0}%` },
            { label: 'Positive outcomes', value: `${outcomeAnalyticsQuery.data?.positiveOutcomeRate ?? 0}%` },
            { label: 'Overdue reviews', value: outcomeAnalyticsQuery.data?.overdueReviews ?? 0 },
            { label: 'Due in 7 days', value: outcomeAnalyticsQuery.data?.dueSoonReviews ?? 0 },
          ].map((item) => (
            <div key={item.label} className="min-w-0 rounded-xl border border-border p-3">
              <p className="break-words text-xs leading-4 text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-border p-4">
            <h3 className="text-xs font-semibold">Outcome distribution</h3>
            <div className="mt-3 space-y-3">
              {([
                { key: 'achieved', label: 'Achieved', value: outcomeAnalyticsQuery.data?.achieved ?? 0 },
                { key: 'partially', label: 'Partially achieved', value: outcomeAnalyticsQuery.data?.partiallyAchieved ?? 0 },
                { key: 'not-achieved', label: 'Not achieved', value: outcomeAnalyticsQuery.data?.notAchieved ?? 0 },
                { key: 'inconclusive', label: 'Inconclusive', value: outcomeAnalyticsQuery.data?.inconclusive ?? 0 },
              ]).map((item) => {
                const assessed = outcomeAnalyticsQuery.data?.assessed ?? 0;
                const width = assessed > 0 ? Math.min(100, (item.value / assessed) * 100) : 0;
                return (
                  <div key={item.key} className="min-w-0">
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="min-w-0 break-words text-muted-foreground">{item.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{item.value}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold">Review queue</h3>
              <span className="text-xs text-muted-foreground">Overdue and next 14 days</span>
            </div>
            {(outcomeAnalyticsQuery.data?.reviewQueue ?? []).length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No scheduled outcome reviews in this window.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {(outcomeAnalyticsQuery.data?.reviewQueue ?? []).map((item) => (
                  <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className="flex w-full min-w-0 items-start justify-between gap-3 rounded-lg border border-border p-3 text-left transition hover:border-brand-500/50 hover:bg-muted/40">
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-xs font-semibold">{item.title}</span>
                      <span className="mt-1 block break-words text-xs text-muted-foreground">{item.ownerName || 'Unassigned'}  |  Review {formatDate(item.reviewDueAt)}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${item.isOverdue ? 'bg-red-500/10 text-red-600' : 'bg-blue-500/10 text-blue-600'}`}>
                      {item.isOverdue ? `${item.daysOverdue}d overdue` : 'Upcoming'}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {(outcomeAnalyticsQuery.data?.missingReviewDate ?? 0) > 0 && (
              <p className="mt-3 text-xs text-amber-600">{outcomeAnalyticsQuery.data?.missingReviewDate} implemented decision(s) have no review date.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {STATUSES.map((status) => (
          <button key={status} type="button" onClick={() => chooseStatus(statusFilter === status ? 'all' : status)} className={`rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-brand-500/50 ${statusFilter === status ? 'border-brand-500 ring-2 ring-brand-500/10' : 'border-border'}`}>
            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold  text-muted-foreground">{status}</span><span className={`h-2 w-2 rounded-full ${status === 'approved' || status === 'reviewed' ? 'bg-emerald-500' : status === 'rejected' ? 'bg-rose-500' : status === 'proposed' ? 'bg-sky-500' : 'bg-slate-400'}`} /></div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{countsQuery.isLoading ? '...' : (countsQuery.data?.[status] ?? 0)}</p>
          </button>
        ))}
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.95fr)]">
        <div className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search decisions, rationale or expected outcomes..." className={`${fieldClass()} pl-10`} />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="relative"><span className="sr-only">Filter by status</span><select value={statusFilter} onChange={(event) => chooseStatus(event.target.value)} className={fieldClass()}><option value="all">All statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                <label className="relative"><span className="sr-only">Filter by decision type</span><select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(0); }} className={fieldClass()}><option value="all">All decision types</option>{TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                <label className="relative"><span className="sr-only">Filter by priority</span><select value={priorityFilter} onChange={(event) => { setPriorityFilter(event.target.value); setPage(0); }} className={fieldClass()}><option value="all">All priorities</option>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
              <div><h2 id="decision-registry" className="scroll-mt-24 text-sm font-semibold">Decision registry</h2><p className="mt-0.5 text-xs text-muted-foreground">{total.toLocaleString()} matching records</p></div>
              <button type="button" onClick={() => { listQuery.refetch(); countsQuery.refetch(); }} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
            </div>
            {listQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading decision registry...</div>
            ) : listQuery.isError ? (
              <div className="px-5 py-12 text-center"><AlertCircle className="mx-auto h-8 w-8 text-rose-500" /><p className="mt-3 text-sm font-medium">The registry could not be loaded.</p><button type="button" onClick={() => listQuery.refetch()} className="mt-3 text-sm font-semibold text-brand-500">Try again</button></div>
            ) : decisions.length === 0 ? (
              <div className="px-6 py-14 text-center"><Scale className="mx-auto h-9 w-9 text-muted-foreground/50" /><h3 className="mt-3 text-sm font-semibold">No decisions found</h3><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Adjust the filters or create the first decision for this workspace.</p><button type="button" onClick={startCreate} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" /> Create decision</button></div>
            ) : (
              <div className="divide-y divide-border">
                {decisions.map((decision) => (
                  <button key={decision.id} type="button" onClick={() => setSelectedId(decision.id)} className={`block w-full px-4 py-4 text-left transition hover:bg-muted/40 sm:px-5 ${selectedId === decision.id ? 'bg-brand-500/[0.06]' : ''}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold text-foreground">{decision.title}</span><StatusBadge status={decision.status} /></div>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{decision.description || decision.rationale || 'No description or rationale supplied.'}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="capitalize">{decision.decision_type}</span><span className="capitalize">{decision.priority} priority</span><span>{decision.owner_name || (decision.owner_id ? `Owner ${decision.owner_id.slice(0, 8)}...` : 'Unassigned')}</span><span>Updated {formatDate(decision.updated_at)}</span></div>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold  ${priorityStyle(decision.priority)}`}>{decision.priority}<ArrowUpRight className="h-3 w-3" /></span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <div className="flex items-center gap-2"><button type="button" disabled={page <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-muted disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><button type="button" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-border p-2 text-muted-foreground transition hover:bg-muted disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div>
            </div>
          </div>
        </div>

        <aside id="decision-detail" className="scroll-mt-5 min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {!selectedId ? (
            <div className="px-6 py-16 text-center"><FileText className="mx-auto h-9 w-9 text-muted-foreground/50" /><h2 className="mt-3 text-sm font-semibold">Decision detail</h2><p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted-foreground">Select a registry record to inspect its rationale, linked evidence, lifecycle and review history.</p></div>
          ) : detailQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading decision...</div>
          ) : detailQuery.isError || !selected ? (
            <div className="px-6 py-14 text-center"><AlertCircle className="mx-auto h-8 w-8 text-rose-500" /><p className="mt-3 text-sm font-medium">Decision detail is unavailable.</p><button type="button" onClick={() => detailQuery.refetch()} className="mt-3 text-sm font-semibold text-brand-500">Retry</button></div>
          ) : (
            <div>
              <div className="border-b border-border p-5">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><StatusBadge status={selected.status} /><span className={`text-xs font-semibold  ${priorityStyle(selected.priority)}`}>{selected.priority} priority</span></div><h2 className="mt-3 break-words text-lg font-semibold tracking-tight">{selected.title}</h2><p className="mt-1 text-xs capitalize text-muted-foreground">{selected.decision_type} decision | Updated {formatDate(selected.updated_at)}</p></div><button type="button" onClick={() => { setSelectedId(null); }} aria-label="Close decision details" className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></div>
                <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => startEdit(selected)} disabled={!['draft', 'proposed'].includes(selected.status) || /^Review version \d+ in AI Advisor: \/ai\?agentRun=/.test(selected.description ?? '')} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40"><Pencil className="h-3.5 w-3.5" /> Edit</button>{nextStatuses.map((status) => <button key={status} type="button" onClick={() => { setTransitionTarget(status); setTransitionNote(''); setActualOutcome(''); setOutcomeAssessment(''); setDelegationId(''); }} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${status === 'rejected' ? 'border border-rose-500/30 text-rose-600 hover:bg-rose-500/10' : status === 'approved' || status === 'reviewed' ? 'bg-brand-500 text-white hover:bg-brand-600' : 'border border-border text-foreground hover:bg-muted'}`}>{transitionLabel(status)}</button>)}</div>
              </div>

              <div className="space-y-5 p-5">
                {selected.description?.match(/^Review version \d+ in AI Advisor: (\/ai\?agentRun=[0-9a-f-]{36})\./i)?.[1] && <Link href={selected.description.match(/(\/ai\?agentRun=[0-9a-f-]{36})\./i)![1]} className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 px-3 py-2 text-sm font-semibold hover:bg-cyan-500/10">Review immutable agent proposal <ArrowUpRight className="h-4 w-4" /></Link>}
                <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/50 p-3"><span className="text-xs font-semibold  text-muted-foreground">Owner</span><p className="mt-1 break-all text-xs font-medium">{selected.owner_id ? (selected.owner_id === selected.created_by_id ? 'Decision creator' : selected.owner_id) : 'Unassigned'}</p></div><div className="rounded-xl bg-muted/50 p-3"><span className="text-xs font-semibold  text-muted-foreground">Team</span><p className="mt-1 break-all text-xs font-medium">{selected.team_id || 'Organisation-wide'}</p></div><div className="rounded-xl bg-muted/50 p-3"><span className="text-xs font-semibold  text-muted-foreground">Due date</span><p className="mt-1 text-xs font-medium">{formatDate(selected.due_date)}</p></div><div className="rounded-xl bg-muted/50 p-3"><span className="text-xs font-semibold  text-muted-foreground">Review date</span><p className="mt-1 text-xs font-medium">{formatDate(selected.review_due_at)}</p></div></div>

                <div className="space-y-3"><div><h3 className="text-xs font-semibold  text-muted-foreground">Decision rationale</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selected.rationale || 'No rationale recorded.'}</p></div><div><h3 className="text-xs font-semibold  text-muted-foreground">Description</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selected.description || 'No description recorded.'}</p></div><div><h3 className="text-xs font-semibold  text-muted-foreground">Expected outcome</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selected.expected_outcome || 'No expected outcome recorded.'}</p></div>{selected.actual_outcome && <div><h3 className="text-xs font-semibold  text-muted-foreground">Actual outcome</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selected.actual_outcome}</p></div>}{selected.rejection_reason && <div><h3 className="text-xs font-semibold  text-rose-600">Rejection explanation</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{selected.rejection_reason}</p></div>}</div>

                                {(selected.status === 'implemented' || selected.status === 'reviewed') && (
                  <section data-v48="decision-outcome-review" className="space-y-3 rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">Outcome review</h3>
                      {selected.outcome_assessment ? (
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold capitalize text-emerald-600">{selected.outcome_assessment.replace(/_/g, ' ')}</span>
                      ) : (
                        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600">Pending assessment</span>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="min-w-0 rounded-lg bg-muted/40 p-3">
                        <p className="text-xs font-semibold  text-muted-foreground">Expected outcome</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5">{selected.expected_outcome || 'No expected outcome recorded.'}</p>
                      </div>
                      <div className="min-w-0 rounded-lg bg-muted/40 p-3">
                        <p className="text-xs font-semibold  text-muted-foreground">Actual outcome</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5">{selected.actual_outcome || 'Not yet recorded.'}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>Review due: {formatDate(selected.review_due_at)}</span>
                      {selected.reviewed_at && <span>Reviewed: {formatDate(selected.reviewed_at)}</span>}
                      <span>Evidence records: {selected.links?.length ?? 0}</span>
                    </div>
                  </section>
                )}
<div className="border-t border-border pt-5">
                  <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Connected records</h3><p className="mt-0.5 text-xs text-muted-foreground">Company Brain evidence and operating records</p></div><Network className="h-4 w-4 text-brand-500" /></div>
                  <form
                    data-v47="smart-linking"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (linkId.trim()) addLinkMutation.mutate();
                    }}
                    className="mt-3 space-y-3 rounded-xl bg-muted/40 p-3"
                  >
                    <div>
                      <label className={labelClass()}>Record type</label>
                      <select
                        aria-label="Record type"
                        value={linkType}
                        onChange={(event) => {
                          setLinkType(event.target.value as DecisionLinkType);
                          setLinkId('');
                          setTaskSearch('');
                        }}
                        className={fieldClass()}
                      >
                        {LINK_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    {linkType === 'task' ? (
                      <div className="space-y-2">
                        <input
                          value={taskSearch}
                          onChange={(event) => {
                            setTaskSearch(event.target.value);
                            setLinkId('');
                          }}
                          placeholder="Search existing tasks by name..."
                          className={fieldClass()}
                        />
                        <select
                          aria-label="Choose existing task"
                          value={linkId}
                          onChange={(event) => setLinkId(event.target.value)}
                          className={fieldClass()}
                        >
                          <option value="">Choose a task...</option>
                          {availableTaskOptions.map((task) => (
                            <option key={task.id} value={task.id}>
                              {task.title} | {task.status || 'todo'}  |  {task.priority || 'medium'}
                            </option>
                          ))}
                        </select>
                        {taskOptionsQuery.isLoading && (
                          <p className="text-xs text-muted-foreground">Searching tasks...</p>
                        )}
                        {taskOptionsQuery.isError && (
                          <p className="text-xs text-red-600">
                            Tasks could not be loaded. Change the search or retry by revisiting this decision.
                          </p>
                        )}
                        {!taskOptionsQuery.isLoading && !taskOptionsQuery.isError && availableTaskOptions.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            No unlinked tasks match this search.
                          </p>
                        )}
                      </div>
                    ) : linkType === 'objective' ? (
                      <div className="space-y-2">
                        <input
                          value={objectiveSearch}
                          onChange={(event) => setObjectiveSearch(event.target.value)}
                          placeholder="Search Founder OS objectives..."
                          className={fieldClass()}
                        />
                        <select
                          aria-label="Choose Founder OS objective"
                          value={linkId}
                          onChange={(event) => setLinkId(event.target.value)}
                          className={fieldClass()}
                        >
                          <option value="">Choose an objective...</option>
                          {availableObjectives
                            .filter((objective) => objective.title.toLowerCase().includes(objectiveSearch.trim().toLowerCase()))
                            .map((objective) => (
                              <option key={objective.id} value={objective.id}>
                                {objective.title}
                              </option>
                            ))}
                        </select>
                        {founderOsQuery.isLoading && (
                          <p className="text-xs text-muted-foreground">Loading Founder OS objectives...</p>
                        )}
                      </div>
                    ) : (
                      <input
                        value={linkId}
                        onChange={(event) => setLinkId(event.target.value)}
                        placeholder="Existing record UUID"
                        className={fieldClass()}
                      />
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs leading-4 text-muted-foreground">
                        Tasks and objectives are selected by name. Other record types retain UUID validation.
                      </p>
                      <button
                        type="submit"
                        disabled={!linkId.trim() || addLinkMutation.isPending}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {addLinkMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Link
                      </button>
                    </div>
                  </form>
                  <div className="mt-3 space-y-2">{(selected.links ?? []).length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">No records linked yet.</p> : (selected.links ?? []).map((link) => <div key={link.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded-md bg-brand-500/10 px-2 py-0.5 text-xs font-semibold  text-brand-600 dark:text-brand-300">{link.linkType}</span><span className="truncate text-xs font-medium">{link.linkLabel || link.linkedId}</span></div><p className="mt-1 break-all text-xs text-muted-foreground">{link.linkedId}</p></div><button type="button" onClick={() => removeLinkMutation.mutate(link.id)} disabled={removeLinkMutation.isPending} aria-label="Remove linked record" className="rounded-lg p-2 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
                </div>

                <section className="border-t border-border pt-5" data-v45="execution-alignment">
                  <div className="flex items-center justify-between gap-3">
                    <div><h3 className="text-sm font-semibold">Execution & strategic alignment</h3><p className="mt-0.5 text-xs text-muted-foreground">Live links across Founder OS, Company Brain and Tasks.</p></div>
                    <Target className="h-4 w-4 text-brand-500" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-xs font-semibold  text-muted-foreground">Objectives</p><p className="mt-1 text-lg font-semibold tabular-nums">{linkedGoalCount}</p><p className="text-xs text-muted-foreground">Goals / objectives linked</p></div>
                    <div className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-xs font-semibold  text-muted-foreground">Evidence</p><p className="mt-1 text-lg font-semibold tabular-nums">{linkedEvidenceCount}</p><p className="text-xs text-muted-foreground">Claims / conflicts / docs</p></div>
                    <div className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-xs font-semibold  text-muted-foreground">Tasks</p><p className="mt-1 text-lg font-semibold tabular-nums">{linkedTaskCount}</p><p className="text-xs text-muted-foreground">Execution tasks linked</p></div>
                  </div>
                  <p className="mt-2 text-xs leading-4 text-muted-foreground">These counts reflect records currently linked to this decision. They are not an AI-generated score.</p>

                  <div className="mt-4 rounded-xl border border-border p-3">
                    <div className="mb-2 flex items-center gap-2"><Target className="h-3.5 w-3.5 text-brand-500" /><p className="text-xs font-semibold">Align with a Founder OS objective</p></div>
                    {founderOsQuery.isLoading ? (
                      <p className="text-xs text-muted-foreground">Loading existing objectives...</p>
                    ) : founderOsQuery.isError ? (
                      <div className="text-xs text-muted-foreground">Founder OS objectives could not be loaded. <button type="button" onClick={() => founderOsQuery.refetch()} className="font-semibold text-brand-500">Retry</button></div>
                    ) : availableObjectives.length > 0 ? (
                      <div className="space-y-2">
                        <input
                          value={objectiveSearch}
                          onChange={(event) => setObjectiveSearch(event.target.value)}
                          placeholder="Search objectives by name..."
                          className={fieldClass()}
                        />
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select
                            value={selectedObjectiveId}
                            onChange={(event) => setSelectedObjectiveId(event.target.value)}
                            className={`${fieldClass()} min-w-0 flex-1`}
                          >
                            <option value="">
                              {filteredAvailableObjectives.length > 0
                                ? 'Choose an existing objective...'
                                : 'No matching objectives'}
                            </option>
                            {filteredAvailableObjectives.map((objective) => (
                              <option key={objective.id} value={objective.id}>
                                {objective.title}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => linkObjectiveMutation.mutate(selectedObjectiveId)}
                            disabled={!selectedObjectiveId || linkObjectiveMutation.isPending}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {linkObjectiveMutation.isPending
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <CheckCircle2 className="h-3.5 w-3.5" />}
                            Align objective
                          </button>
                        </div>
                      </div>
                    ) : objectiveOptions.length > 0 ? (
                      <p className="text-xs text-muted-foreground">All visible Founder OS objectives are already linked to this decision.</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No Founder OS objectives are available. <a href="/founder-os" className="font-semibold text-brand-500 hover:underline">Open Founder OS</a> to create one first.</p>
                    )}
                  </div>

                  <div className="mt-3 space-y-3 rounded-xl border border-border bg-muted/20 p-3">
                    <div>
                      <p className="text-xs font-semibold">Decision-to-task composer</p>
                      <p className="mt-1 text-xs leading-4 text-muted-foreground">
                        Configure the execution task. It will be created in the existing Tasks workspace and linked automatically.
                      </p>
                    </div>

                    {selected.status === 'approved' ? (
                      <>
                        <div>
                          <label className={labelClass()}>Execution task title</label>
                          <input
                            value={executionTaskTitle || `Execute decision: ${selected.title}`}
                            onChange={(event) => setExecutionTaskTitle(event.target.value)}
                            maxLength={240}
                            className={fieldClass()}
                          />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className={labelClass()}>Task priority</label>
                            <select
                              value={executionTaskPriority}
                              onChange={(event) => setExecutionTaskPriority(event.target.value)}
                              className={fieldClass()}
                            >
                              <option value="decision">Match decision priority</option>
                              <option value="urgent">Urgent</option>
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
                            </select>
                          </div>

                          <div>
                            <label className={labelClass()}>Task due date</label>
                            <input
                              type="date"
                              value={executionTaskDueDate || toDateInput(selected.due_date)}
                              onChange={(event) => setExecutionTaskDueDate(event.target.value)}
                              className={fieldClass()}
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">
                            {selected.owner_id ? 'Decision owner will be assigned.' : 'Task will initially be unassigned.'}
                            {selected.team_id ? ' Decision team will be reused.' : ''}
                          </p>

                          <button
                            type="button"
                            onClick={() => createExecutionTaskMutation.mutate()}
                            disabled={
                              createExecutionTaskMutation.isPending ||
                              !(executionTaskTitle.trim() || selected.title.trim())
                            }
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {createExecutionTaskMutation.isPending
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <CheckCircle2 className="h-3.5 w-3.5" />}
                            {linkedTaskCount > 0 ? 'Create another task' : 'Create execution task'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <span className="inline-flex rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                        Execution task creation becomes available after approval.
                      </span>
                    )}
                  </div>
                </section>
                                <section data-v46="execution-monitoring" className="space-y-4 border-t border-border pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Live execution monitoring</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Linked task progress. Automatically refreshed every 30 seconds.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void detailQuery.refetch()}
                      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Total tasks', value: execution?.total ?? 0 },
                      { label: 'Completed', value: execution?.completed ?? 0 },
                      { label: 'In progress', value: execution?.inProgress ?? 0 },
                      { label: 'To do', value: execution?.todo ?? 0 },
                      { label: 'Overdue', value: execution?.overdue ?? 0 },
                      { label: 'Stalled', value: execution?.stalled ?? 0 },
                      { label: 'Unassigned', value: execution?.unassigned ?? 0 },
                      { label: 'On track', value: execution?.onTrack ?? 0 },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0 rounded-xl border border-border p-3">
                        <p className="break-words text-xs leading-4 text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-border p-4" aria-label="Decision execution health">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">Execution health</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        execution?.health === 'at_risk'
                          ? 'bg-red-500/10 text-red-600'
                          : execution?.health === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : 'bg-blue-500/10 text-blue-600'
                      }`}>
                        {(execution?.health ?? 'not_started').replace(/_/g, ' ')}
                      </span>
                    </div>
                    {(execution?.alerts?.length ?? 0) > 0 ? (
                      <div className="mt-3 space-y-2">
                        {execution?.alerts.map((alert) => (
                          <div
                            key={alert.type}
                            className={`rounded-lg border p-3 ${
                              alert.severity === 'critical'
                                ? 'border-red-500/20 bg-red-500/5'
                                : 'border-amber-500/20 bg-amber-500/5'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs font-semibold">{alert.title}</span>
                              <span className="text-sm font-bold tabular-nums">{alert.count}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{alert.message}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {execution?.health === 'completed'
                          ? 'All linked execution tasks are complete.'
                          : execution?.health === 'on_track'
                            ? 'No execution risks detected across linked tasks.'
                            : 'No linked execution tasks are available for health assessment.'}
                      </p>
                    )}
                  </div>

                  <div className="rounded-xl border border-border p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium">Overall completion</span>
                      <span className="text-sm font-semibold tabular-nums">{executionPercent}%</span>
                    </div>
                    <div
                      className="h-2.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={executionPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Decision task completion"
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${executionPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Linked execution tasks</h4>

                    {executionTasks.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-6 text-center">
                        <p className="text-sm font-medium">No linked execution tasks</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Link tasks to this decision to monitor execution.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {executionTasks.map((task) => (
                          <div key={task.id} className="rounded-xl border border-border p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-medium">{task.title}</p>
                                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <span>Assignee: {task.assignee_name || 'Unassigned'}</span>
                                  <span>Priority: {task.priority || 'Normal'}</span>
                                  <span>
                                    Due: {task.due_date
                                      ? new Date(task.due_date).toLocaleDateString()
                                      : 'Not set'}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                  task.status === 'done'
                                    ? 'bg-emerald-500/10 text-emerald-600'
                                    : task.status === 'in_progress'
                                      ? 'bg-blue-500/10 text-blue-600'
                                      : 'bg-muted text-muted-foreground'
                                }`}>
                                  {task.status.replace(/_/g, ' ')}
                                </span>

                                {task.is_overdue && (
                                  <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600">
                                    Overdue
                                  </span>
                                )}
                                {task.is_stalled && (
                                  <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700">
                                    Stalled
                                  </span>
                                )}
                                {task.is_unassigned && (
                                  <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-700">
                                    Unassigned
                                  </span>
                                )}
                                {task.is_completed && (
                                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">
                                    Completed
                                  </span>
                                )}
                                {task.is_on_track && (
                                  <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-700">
                                    On track
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
                <section className="border-t border-border pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Lifecycle history</h3>
                    <History className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-3 h-72 overflow-y-auto overscroll-contain rounded-lg border border-border/70 p-3">
                    {historyQuery.isLoading ? (
                      <p className="text-xs text-muted-foreground">Loading lifecycle history...</p>
                    ) : historyQuery.isError ? (
                      <p role="alert" className="text-xs text-rose-600">
                        Could not load lifecycle history.
                      </p>
                    ) : historyQuery.data?.items.length ? (
                      <div className="space-y-3">
                        {historyQuery.data.items.map((entry) => (
                          <div
                            key={entry.id}
                            className="relative border-l-2 border-brand-500/20 pb-1 pl-4"
                          >
                            <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-brand-500" />
                            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                              <span className="capitalize">{entry.previousStatus || 'Created'}</span>
                              <span className="text-muted-foreground">to</span>
                              <span className="capitalize">{entry.newStatus}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {entry.reviewerName || entry.reviewerEmail || 'Workspace member'} | {formatDate(entry.createdAt)}
                            </p>
                            {entry.reviewNote && (
                              <p className="mt-2 break-words whitespace-pre-wrap rounded-lg bg-muted/50 p-2.5 text-xs leading-5">
                                {entry.reviewNote}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No lifecycle events recorded.</p>
                    )}
                  </div>
                  {historyQuery.data && historyQuery.data.total > 0 && (
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {historyQuery.data.offset + 1}–{Math.min(
                          historyQuery.data.offset + historyQuery.data.items.length,
                          historyQuery.data.total,
                        )} of {historyQuery.data.total}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label="Previous history page"
                          disabled={historyPage === 0 || historyQuery.isFetching}
                          onClick={() => setHistoryPage((current) => Math.max(0, current - 1))}
                          className="rounded-md border border-border p-1.5 hover:bg-muted disabled:opacity-40"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span>
                          Page {historyPage + 1} of {Math.max(
                            1,
                            Math.ceil(historyQuery.data.total / HISTORY_PAGE_SIZE),
                          )}
                        </span>
                        <button
                          type="button"
                          aria-label="Next history page"
                          disabled={
                            (historyPage + 1) * HISTORY_PAGE_SIZE >= historyQuery.data.total ||
                            historyQuery.isFetching
                          }
                          onClick={() => setHistoryPage((current) => current + 1)}
                          className="rounded-md border border-border p-1.5 hover:bg-muted disabled:opacity-40"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                <div className="border-t border-border pt-4 text-xs text-muted-foreground"><p>Created {formatDate(selected.created_at)} | Decision ID {selected.id}</p><p className="mt-1">Lifecycle actions are permission-checked and audit-logged by the server.</p></div>
              </div>
            </div>
          )}
        </aside>
      </section>

      {composerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="decision-form-title">
          <div className="my-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 id="decision-form-title" className="text-base font-semibold">{editingId ? 'Edit decision' : 'Create decision'}</h2><p className="mt-0.5 text-xs text-muted-foreground">Capture the context and accountability for this decision.</p></div><button type="button" onClick={() => setComposerOpen(false)} aria-label="Close form" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></div>
            <form onSubmit={submitDecision} className="space-y-4 p-5">
              <div><label className={labelClass()}>Decision title *</label><input required maxLength={240} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={fieldClass()} placeholder="e.g. Enter the regional enterprise market" /></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass()}>Decision type</label><select value={form.decisionType} onChange={(event) => setForm((current) => ({ ...current, decisionType: event.target.value as DecisionType }))} className={fieldClass()}>{TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></div><div><label className={labelClass()}>Priority</label><select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as DecisionPriority }))} className={fieldClass()}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></div></div>
              <div><label className={labelClass()}>Description</label><textarea rows={2} maxLength={12000} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={fieldClass()} placeholder="What is being decided?" /></div>
              <div><label className={labelClass()}>Rationale</label><textarea rows={3} maxLength={12000} value={form.rationale} onChange={(event) => setForm((current) => ({ ...current, rationale: event.target.value }))} className={fieldClass()} placeholder="Why is this the right course of action? Include evidence and trade-offs." /></div>
              <div><label className={labelClass()}>Expected outcome</label><textarea rows={2} maxLength={8000} value={form.expectedOutcome} onChange={(event) => setForm((current) => ({ ...current, expectedOutcome: event.target.value }))} className={fieldClass()} placeholder="What measurable result should follow?" /></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass()}>Owner user ID (optional)</label><input value={form.ownerId} onChange={(event) => setForm((current) => ({ ...current, ownerId: event.target.value }))} className={fieldClass()} placeholder="Existing user UUID" /></div><div><label className={labelClass()}>Team ID (optional)</label><input value={form.teamId} onChange={(event) => setForm((current) => ({ ...current, teamId: event.target.value }))} className={fieldClass()} placeholder="Existing team UUID" /></div></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass()}>Due date</label><input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} className={fieldClass()} /></div><div><label className={labelClass()}>Review due date</label><input type="date" value={form.reviewDueAt} onChange={(event) => setForm((current) => ({ ...current, reviewDueAt: event.target.value }))} className={fieldClass()} /></div></div>
              <p className="text-xs leading-5 text-muted-foreground">Owner and team IDs are optional. The API verifies that supplied records belong to this organisation and that your role can use them.</p>
              <div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row"><button type="button" onClick={() => setComposerOpen(false)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button><button type="submit" disabled={saveMutation.isPending || !form.title.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{editingId ? 'Save changes' : 'Create decision'}</button></div>
            </form>
          </div>
        </div>
      )}

      {transitionTarget && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-labelledby="transition-title">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3"><div><h2 id="transition-title" className="text-base font-semibold">{transitionLabel(transitionTarget)}</h2><p className="mt-1 text-xs text-muted-foreground">Move "{selected.title}" from {selected.status} to {transitionTarget}.</p></div><button type="button" onClick={() => setTransitionTarget(null)} aria-label="Close transition" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button></div>
            <form onSubmit={submitTransition} className="mt-5 space-y-4"><div><label className={labelClass()}>{transitionTarget === 'rejected' ? 'Rejection explanation *' : transitionTarget === 'reviewed' ? 'Review note *' : 'Lifecycle note (optional)'}</label><textarea rows={3} value={transitionNote} onChange={(event) => setTransitionNote(event.target.value)} className={fieldClass()} placeholder="Record the reasoning behind this lifecycle change." /></div>{(transitionTarget === 'implemented' || transitionTarget === 'reviewed') && <div><label className={labelClass()}>{transitionTarget === 'reviewed' ? 'Actual outcome *' : 'Actual outcome (optional)'}</label><textarea rows={2} value={actualOutcome} onChange={(event) => setActualOutcome(event.target.value)} className={fieldClass()} placeholder="What happened after implementation?" /></div>}
            {transitionTarget === 'reviewed' && <div><label className={labelClass()}>Outcome assessment *</label><select required value={outcomeAssessment} onChange={(event) => setOutcomeAssessment(event.target.value as DecisionOutcomeAssessment | '')} className={fieldClass()}><option value="">Select the result</option><option value="achieved">Achieved</option><option value="partially_achieved">Partially achieved</option><option value="not_achieved">Not achieved</option><option value="inconclusive">Inconclusive</option></select><p className="mt-1 text-xs leading-4 text-muted-foreground">Assess the actual result against the expected outcome. This assessment is saved to the decision audit history.</p></div>}
              {selected.status === 'proposed' && (transitionTarget === 'approved' || transitionTarget === 'rejected') && selected.approval_required_role && selected.approval_delegation_allowed && (
                <div>
                  <label className={labelClass()}>Delegated authority (optional)</label>
                  <select value={delegationId} onChange={(event) => setDelegationId(event.target.value)} className={fieldClass()}>
                    <option value="">Use my own approval authority</option>
                    {(governanceQuery.data?.delegations ?? []).filter((item) => {
                      const valid = !item.revokedAt && new Date(item.validFrom).getTime() <= Date.now() && new Date(item.validUntil).getTime() > Date.now();
                      const typeMatches = item.decisionType === 'all' || item.decisionType === selected.decision_type;
                      const priorityMatches = item.priority === 'all' || item.priority === selected.priority;
                      return item.delegateUserId === user?.id && valid && typeMatches && priorityMatches &&
                        (APPROVAL_RANK[item.principalRole ?? ''] ?? 0) >= (APPROVAL_RANK[selected.approval_required_role ?? ''] ?? 0);
                    }).map((item) => (
                      <option key={item.id} value={item.id}>{item.principalName || 'Principal'}{' -> '}{item.delegateName || 'Delegate'}{' | expires '}{formatDate(item.validUntil)}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs leading-4 text-muted-foreground">Only current delegations that cover this decision are listed.</p>
                </div>
              )}
<div className="flex flex-col-reverse justify-end gap-2 border-t border-border pt-4 sm:flex-row"><button type="button" onClick={() => setTransitionTarget(null)} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted">Cancel</button><button type="submit" disabled={transitionMutation.isPending || ((transitionTarget === 'rejected' || transitionTarget === 'reviewed') && transitionNote.trim().length < 8)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{transitionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Confirm transition</button></div></form>
          </div>
        </div>
      )}
    </main>
  );
}
