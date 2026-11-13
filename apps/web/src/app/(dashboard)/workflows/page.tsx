'use client';

import { useState, type FormEvent } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Workflow,
  Play,
  Pause,
  Plus,
  CheckCircle2,
  RefreshCw,
  Loader2,
  AlertCircle,
  X,
  FileText,
  CalendarDays,
  Clock3,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Settings2,
  History,
  ListTodo,
  Bell,
  Trash2,
  Activity,
  CircleCheck,
  CircleX,
  Ban,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { toast } from 'sonner';

type DataRecord = Record<string, unknown>;
type WorkflowStatus = 'active' | 'paused' | 'draft' | 'archived';
type ActionType = 'task.create' | 'notification.create';

type WorkflowItem = {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  is_active: boolean;
  trigger_type: string;
  trigger_config: DataRecord;
  steps: DataRecord[];
  run_count: number;
  successful_runs: number;
  created_at: string;
  last_run_at: string | null;
};

type WorkflowPayload = {
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig: DataRecord;
  steps: DataRecord[];
};

type WorkflowRunStep = {
  id: string;
  step_index: number;
  step_type: string;
  status: string;
  attempt_count: number;
  input_data: DataRecord;
  output_data: DataRecord;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
};

type WorkflowRun = {
  id: string;
  status: string;
  trigger_event: string | null;
  input_data: DataRecord;
  output_data: DataRecord;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  steps: WorkflowRunStep[];
};

type WorkflowTemplate = {
  title: string;
  description: string;
  trigger: string;
  icon: LucideIcon;
};

type WorkflowDraft = {
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: string;
  steps: DataRecord[];
};

const TRIGGER_GROUPS: Array<{
  label: string;
  options: Array<{ value: string; label: string; description: string }>;
}> = [
  {
    label: 'Decision lifecycle',
    options: [
      { value: 'decision.created', label: 'Decision created', description: 'Run when a decision record is created.' },
      { value: 'decision.proposed', label: 'Decision proposed', description: 'Run when a decision enters the proposed state.' },
      { value: 'decision.approved', label: 'Decision approved', description: 'Run after a decision is approved through governance.' },
      { value: 'decision.rejected', label: 'Decision rejected', description: 'Run after a decision is rejected.' },
      { value: 'decision.implemented', label: 'Decision implemented', description: 'Run when an approved decision is marked implemented.' },
      { value: 'decision.reviewed', label: 'Decision reviewed', description: 'Run when a decision outcome review is recorded.' },
      { value: 'decision.withdrawn', label: 'Decision withdrawn', description: 'Run when a decision is withdrawn.' },
    ],
  },
  {
    label: 'Decision deadlines',
    options: [
      { value: 'decision.deadline_approaching', label: 'Decision deadline approaching', description: 'Hourly scan: due within the next 24 hours.' },
      { value: 'decision.deadline_overdue', label: 'Decision deadline overdue', description: 'Hourly scan: decision deadline has passed.' },
      { value: 'decision.approval_due_soon', label: 'Approval deadline approaching', description: 'Hourly scan: approval is due within the next 24 hours.' },
      { value: 'decision.approval_overdue', label: 'Approval deadline overdue', description: 'Hourly scan: approval deadline has passed.' },
    ],
  },
  {
    label: 'Business events and schedules',
    options: [
      { value: 'document.indexed', label: 'Document indexed', description: 'Run when a document finishes indexing.' },
      { value: 'document.deleted', label: 'Document deleted', description: 'Run after a document is deleted and its cleanup is queued.' },
      { value: 'document.indexing_failed', label: 'Document indexing failed', description: 'Run when all document indexing attempts have failed.' },
      { value: 'meeting.completed', label: 'Meeting completed', description: 'Run after a meeting has been completed.' },
      { value: 'task.overdue', label: 'Task overdue', description: 'Run when a task-overdue event is emitted.' },
      { value: 'schedule.weekly', label: 'Weekly schedule', description: 'Runs every Monday at 09:00 server time.' },
      { value: 'manual', label: 'Manual trigger', description: 'Run only when a user manually starts the workflow.' },
    ],
  },
];

const ALL_TRIGGERS = TRIGGER_GROUPS.flatMap((group) => group.options);
const DECISION_TRIGGERS = new Set(
  ALL_TRIGGERS.filter((option) => option.value.startsWith('decision.')).map((option) => option.value),
);

const TEMPLATES: WorkflowTemplate[] = [
  {
    title: 'Document intelligence',
    description: 'Start a workflow when a document has been indexed.',
    trigger: 'document.indexed',
    icon: FileText,
  },
  {
    title: 'Meeting follow-up',
    description: 'Start a workflow when meeting processing is complete.',
    trigger: 'meeting.completed',
    icon: CalendarDays,
  },
  {
    title: 'Weekly business review',
    description: 'Start a recurring workflow every Monday morning.',
    trigger: 'schedule.weekly',
    icon: Clock3,
  },
  {
    title: 'Overdue task escalation',
    description: 'Respond when the task-overdue event is emitted.',
    trigger: 'task.overdue',
    icon: AlertCircle,
  },
  {
    title: 'Decision approval coordination',
    description: 'Coordinate follow-up when a decision is proposed.',
    trigger: 'decision.proposed',
    icon: Activity,
  },
  {
    title: 'Decision outcome follow-up',
    description: 'Create follow-up actions after an outcome review.',
    trigger: 'decision.reviewed',
    icon: CheckCircle2,
  },
  {
    title: 'Overdue approval response',
    description: 'Escalate an approval that has passed its deadline.',
    trigger: 'decision.approval_overdue',
    icon: Bell,
  },
];

const EMPTY_DRAFT: WorkflowDraft = {
  name: '',
  description: '',
  triggerType: 'decision.proposed',
  triggerConfig: '{}',
  steps: [],
};

function isRecord(value: unknown): value is DataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): DataRecord {
  if (isRecord(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function unwrapArray(value: unknown, keys: string[]): unknown[] {
  let current = value;
  for (let depth = 0; depth < 6; depth += 1) {
    if (Array.isArray(current)) return current;
    if (!isRecord(current)) break;
    const matchingKey = keys.find((key) => Array.isArray((current as DataRecord)[key]));
    if (matchingKey) return current[matchingKey] as unknown[];
    if (Object.prototype.hasOwnProperty.call(current, 'data')) {
      current = current.data;
      continue;
    }
    break;
  }
  throw new Error('The API returned an unexpected response format.');
}

function normalizeWorkflows(value: unknown): WorkflowItem[] {
  return unwrapArray(value, ['workflows', 'items', 'results'])
    .filter(isRecord)
    .map((item, index) => {
      const rawStatus = String(item.status ?? (item.is_active === true ? 'active' : 'paused'));
      const status: WorkflowStatus = ['active', 'paused', 'draft', 'archived'].includes(rawStatus)
        ? rawStatus as WorkflowStatus
        : 'draft';
      return {
        id: typeof item.id === 'string' ? item.id : `workflow-${index}`,
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Unnamed workflow',
        description: typeof item.description === 'string' ? item.description : '',
        status,
        is_active: status === 'active' || item.is_active === true || item.is_active === 'true',
        trigger_type: typeof item.trigger_type === 'string' ? item.trigger_type : 'manual',
        trigger_config: toRecord(item.trigger_config),
        steps: toArray(item.steps).filter(isRecord),
        run_count: Number.isFinite(Number(item.run_count)) ? Number(item.run_count) : 0,
        successful_runs: Number.isFinite(Number(item.successful_runs)) ? Number(item.successful_runs) : 0,
        created_at: typeof item.created_at === 'string' ? item.created_at : '',
        last_run_at: typeof item.last_run_at === 'string' ? item.last_run_at : null,
      };
    });
}

function normalizeRunSteps(value: unknown): WorkflowRunStep[] {
  return toArray(value).filter(isRecord).map((step, index) => ({
    id: typeof step.id === 'string' ? step.id : `step-${index}`,
    step_index: Number.isFinite(Number(step.step_index)) ? Number(step.step_index) : index,
    step_type: typeof step.step_type === 'string' ? step.step_type : 'unknown',
    status: typeof step.status === 'string' ? step.status : 'unknown',
    attempt_count: Number.isFinite(Number(step.attempt_count)) ? Number(step.attempt_count) : 0,
    input_data: toRecord(step.input_data),
    output_data: toRecord(step.output_data),
    error_message: typeof step.error_message === 'string' ? step.error_message : null,
    started_at: typeof step.started_at === 'string' ? step.started_at : null,
    completed_at: typeof step.completed_at === 'string' ? step.completed_at : null,
  }));
}

function normalizeRuns(value: unknown): WorkflowRun[] {
  return unwrapArray(value, ['runs', 'items', 'results']).filter(isRecord).map((run, index) => ({
    id: typeof run.id === 'string' ? run.id : `run-${index}`,
    status: typeof run.status === 'string' ? run.status : 'unknown',
    trigger_event: typeof run.trigger_event === 'string' ? run.trigger_event : null,
    input_data: toRecord(run.input_data),
    output_data: toRecord(run.output_data),
    error_message: typeof run.error_message === 'string' ? run.error_message : null,
    started_at: typeof run.started_at === 'string' ? run.started_at : null,
    completed_at: typeof run.completed_at === 'string' ? run.completed_at : null,
    steps: normalizeRunSteps(run.steps),
  }));
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (isRecord(error) && isRecord(error.response)) {
    const responseData = error.response.data;
    if (isRecord(responseData)) {
      const message = responseData.message;
      if (typeof message === 'string' && message.trim()) return message;
      if (Array.isArray(message) && message.every((item) => typeof item === 'string')) return message.join(', ');
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function parseJsonObject(input: string, label: string): DataRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object.`);
  return parsed;
}

function createDraft(values?: Partial<WorkflowDraft>): WorkflowDraft {
  return { ...EMPTY_DRAFT, ...values, steps: values?.steps ?? [] };
}

function emptyAction(type: ActionType): DataRecord {
  if (type === 'task.create') {
    return {
      type,
      config: { title: 'Follow up: {{decision.title}}', description: '', priority: 'medium', assignee: 'owner', dueInHours: '' },
    };
  }
  return {
    type,
    config: { title: 'Workflow update: {{decision.title}}', message: '', recipient: 'approvers', actionUrl: '' },
  };
}

function triggerLabel(trigger: string): string {
  return ALL_TRIGGERS.find((option) => option.value === trigger)?.label ?? trigger.replace(/[._-]+/g, ' ');
}

function statusClass(status: string): string {
  if (status === 'completed' || status === 'active') return 'bg-green-500/10 text-green-600';
  if (status === 'failed') return 'bg-red-500/10 text-red-600';
  if (status === 'running') return 'bg-blue-500/10 text-blue-600';
  if (status === 'cancelled' || status === 'archived') return 'bg-muted text-muted-foreground';
  return 'bg-amber-500/10 text-amber-600';
}

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function summarizeStepOutput(output: DataRecord): string {
  const parts: string[] = [];
  if (typeof output.title === 'string') parts.push(output.title);
  if (typeof output.taskId === 'string') parts.push(`Task ${output.taskId.slice(0, 8)}`);
  if (typeof output.createdCount === 'number') parts.push(`${output.createdCount} notifications created`);
  if (typeof output.recipientCount === 'number') parts.push(`${output.recipientCount} recipients`);
  if (typeof output.assigneeId === 'string') parts.push('Assigned');
  return parts.join(' · ') || 'Action completed';
}

function WorkflowRunHistory({ workflowId }: { workflowId: string }) {
  const { data: runs = [], isLoading, isError, error, refetch, isFetching } = useQuery<WorkflowRun[], Error>({
    queryKey: ['workflow-runs', workflowId],
    queryFn: async () => {
      const response = await api.get<unknown>(`/workflows/${workflowId}/runs`);
      return normalizeRuns(response.data);
    },
    retry: 1,
  });

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Execution history</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">Most recent 50 runs, including action-step outcomes.</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          aria-label="Refresh execution history"
          className="rounded-lg border border-border p-2 transition hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading execution history…</div>
      ) : isError ? (
        <div role="alert" className="rounded-lg border border-red-500/30 p-3 text-sm text-red-500">
          {getErrorMessage(error, 'Could not load execution history.')}
        </div>
      ) : runs.length === 0 ? (
        <p className="rounded-lg bg-muted/40 px-4 py-5 text-center text-sm text-muted-foreground">No executions have been recorded.</p>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <article key={run.id} className="rounded-xl border border-border bg-background/70 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusClass(run.status)}`}>{run.status}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{run.id}</span>
                </div>
                <span className="text-xs text-muted-foreground">{formatTimestamp(run.started_at)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Trigger: {run.trigger_event ? triggerLabel(run.trigger_event) : 'Manual'}</span>
                <span>Finished: {formatTimestamp(run.completed_at)}</span>
                <span>{run.steps.length} action step{run.steps.length === 1 ? '' : 's'}</span>
              </div>

              {run.error_message && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-xs text-red-600">
                  <CircleX className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="break-words">{run.error_message}</span>
                </div>
              )}

              {run.steps.length > 0 && (
                <div className="mt-3 space-y-2">
                  {run.steps.map((step) => (
                    <div key={step.id} className="rounded-lg bg-muted/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-medium">
                          {step.status === 'completed' ? <CircleCheck className="h-4 w-4 text-green-600" /> : step.status === 'failed' ? <CircleX className="h-4 w-4 text-red-500" /> : <Activity className="h-4 w-4 text-muted-foreground" />}
                          <span>Step {step.step_index + 1}: {step.step_type}</span>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${statusClass(step.status)}`}>{step.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{summarizeStepOutput(step.output_data)} · {step.attempt_count} attempt{step.attempt_count === 1 ? '' : 's'}</p>
                      {step.error_message && <p className="mt-1 break-words text-xs text-red-600">{step.error_message}</p>}
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<WorkflowDraft>(createDraft());
  const [formError, setFormError] = useState('');
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);

  const {
    data: workflows = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<WorkflowItem[], Error>({
    queryKey: ['workflows'],
    queryFn: async () => {
      const response = await api.get<unknown>('/workflows');
      return normalizeWorkflows(response.data);
    },
    retry: 1,
  });

  const createMutation = useMutation<unknown, Error, WorkflowPayload>({
    mutationFn: async (payload) => {
      const response = await api.post<unknown>('/workflows', payload);
      return response.data;
    },
    onSuccess: async () => {
      toast.success('Workflow created successfully.');
      setCreateOpen(false);
      setDraft(createDraft());
      setFormError('');
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (mutationError) => {
      const message = getErrorMessage(mutationError, 'Failed to create the workflow.');
      setFormError(message);
      toast.error(message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/workflows/${id}/toggle`),
    onSuccess: async () => {
      toast.success('Workflow status updated.');
      await queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (mutationError: unknown) => toast.error(getErrorMessage(mutationError, 'Failed to update workflow status.')),
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) => api.post(`/workflows/${id}/trigger`, {}),
    onSuccess: async (_response, workflowId) => {
      toast.success('Workflow execution queued.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workflows'] }),
        queryClient.invalidateQueries({ queryKey: ['workflow-runs', workflowId] }),
      ]);
      setHistoryOpen(workflowId);
    },
    onError: (mutationError: unknown) => toast.error(getErrorMessage(mutationError, 'Failed to trigger the workflow.')),
  });

  const activeCount = workflows.filter((workflow) => workflow.status === 'active').length;
  const successfulCount = workflows.reduce((total, workflow) => total + workflow.successful_runs, 0);
  const totalRuns = workflows.reduce((total, workflow) => total + workflow.run_count, 0);
  const anyActionPending = toggleMutation.isPending || triggerMutation.isPending;

  function openCreate(template?: WorkflowTemplate) {
    setFormError('');
    setDraft(createDraft(template ? {
      name: template.title,
      description: template.description,
      triggerType: template.trigger,
    } : undefined));
    setCreateOpen(true);
  }

  function updateDraft(field: keyof WorkflowDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFormError('');
  }

  function updateStep(index: number, patch: DataRecord) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step),
    }));
    setFormError('');
  }

  function updateStepConfig(index: number, key: string, value: string) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => stepIndex === index
        ? { ...step, config: { ...toRecord(step.config), [key]: value } }
        : step),
    }));
    setFormError('');
  }

  function addStep(type: ActionType) {
    setDraft((current) => ({ ...current, steps: [...current.steps, emptyAction(type)] }));
    setFormError('');
  }

  function removeStep(index: number) {
    setDraft((current) => ({ ...current, steps: current.steps.filter((_step, stepIndex) => stepIndex !== index) }));
  }

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const name = draft.name.trim();
    if (!name) return setFormError('Enter a name for this workflow.');
    if (name.length > 255) return setFormError('Workflow names must be 255 characters or fewer.');

    try {
      const triggerConfig = parseJsonObject(draft.triggerConfig, 'Trigger configuration');
      if (!ALL_TRIGGERS.some((option) => option.value === draft.triggerType)) {
        throw new Error('Select a supported workflow trigger.');
      }
      const steps = draft.steps.map((step, index) => {
        if (!isRecord(step.config)) throw new Error(`Action step ${index + 1} requires a configuration.`);
        const type = step.type;
        if (type !== 'task.create' && type !== 'notification.create') {
          throw new Error(`Action step ${index + 1} has an unsupported action type.`);
        }
        const config: DataRecord = { ...step.config };
        if (typeof config.title !== 'string' || !config.title.trim()) {
          throw new Error(`Action step ${index + 1} requires a title.`);
        }
        if (type === 'task.create') {
          if (config.dueInHours === '') delete config.dueInHours;
          else if (config.dueInHours !== undefined) config.dueInHours = Number(config.dueInHours);
          if (config.priority === 'critical') config.priority = 'urgent';
        }
        if (type === 'notification.create' && !['owner', 'creator', 'actor', 'approvers'].includes(String(config.recipient ?? 'approvers'))) {
          throw new Error(`Action step ${index + 1} has an unsupported notification recipient.`);
        }
        Object.keys(config).forEach((key) => {
          if (config[key] === '') delete config[key];
        });
        return { type, config };
      });

      createMutation.mutate({
        name,
        description: draft.description.trim() || undefined,
        triggerType: draft.triggerType,
        triggerConfig,
        steps,
      });
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'Please check the workflow configuration.');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-teal-500/10 p-3"><Workflow className="h-6 w-6 text-teal-500" /></div>
          <div>
            <h1 className="text-2xl font-bold">Workflow Automation</h1>
            <p className="mt-1 text-sm text-muted-foreground">Automate decision follow-up and repeatable business processes.</p>
          </div>
        </div>
        <button type="button" onClick={() => openCreate()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600">
          <Plus className="h-4 w-4" /> New Workflow
        </button>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Configured workflows</p><p className="mt-1 text-2xl font-semibold tabular-nums">{workflows.length}</p></div>
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Active workflows</p><p className="mt-1 text-2xl font-semibold tabular-nums">{activeCount}</p></div>
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Successful executions</p><p className="mt-1 text-2xl font-semibold tabular-nums">{successfulCount}<span className="ml-2 text-xs font-normal text-muted-foreground">of {totalRuns} runs</span></p></div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2"><Sparkles className="h-5 w-5 text-violet-500" /></div>
          <div>
            <h2 className="font-semibold">Start with a template</h2>
            <p className="mt-1 text-sm text-muted-foreground">Templates prefill a supported trigger. Add one or more task or notification actions before activation.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((template) => {
            const Icon = template.icon;
            return (
              <button type="button" key={template.trigger} onClick={() => openCreate(template)} className="group flex items-start gap-3 rounded-xl border border-border p-4 text-left transition hover:border-brand-500/50 hover:bg-muted/40">
                <span className="rounded-lg bg-muted p-2"><Icon className="h-4 w-4 text-muted-foreground" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{template.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{template.description}</span>
                  <span className="mt-2 inline-block break-all font-mono text-xs text-brand-500">{template.trigger}</span>
                </span>
                <Plus className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-brand-500" />
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold">Your workflows</h2><p className="mt-1 text-sm text-muted-foreground">{isLoading ? 'Loading workflows…' : `${workflows.length} workflow${workflows.length === 1 ? '' : 's'} configured`}</p></div>
          <button type="button" onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh workflows" className="rounded-lg border border-border p-2 transition hover:bg-muted disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl border border-border bg-card" />)}</div>
        ) : isError ? (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-card p-6"><h3 className="font-semibold">Could not load workflows</h3><p className="mt-2 text-sm text-red-500">{getErrorMessage(error, 'The workflow request failed.')}</p><button type="button" onClick={() => void refetch()} className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Try again</button></div>
        ) : workflows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-12 text-center"><Workflow className="mx-auto h-10 w-10 text-muted-foreground/40" /><h3 className="mt-3 font-semibold">No workflows yet</h3><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Create a workflow, select a supported event and configure its action steps.</p><button type="button" onClick={() => openCreate()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"><Plus className="h-4 w-4" /> Create workflow</button></div>
        ) : (
          <div className="space-y-3">
            {workflows.map((workflow) => (
              <motion.article key={workflow.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${workflow.status === 'active' ? 'bg-green-500' : workflow.status === 'archived' ? 'bg-red-400' : 'bg-muted-foreground/40'}`} aria-label={workflow.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words font-semibold">{workflow.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusClass(workflow.status)}`}>{workflow.status}</span>
                    </div>
                    {workflow.description && <p className="mt-1 text-sm text-muted-foreground">{workflow.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Trigger: {triggerLabel(workflow.trigger_type)}</span>
                      <span>{workflow.steps.length} action step{workflow.steps.length === 1 ? '' : 's'}</span>
                      <span>{workflow.run_count} runs</span>
                      <span>{workflow.successful_runs} successful</span>
                      {workflow.last_run_at && <span>Last run {formatRelative(workflow.last_run_at)}</span>}
                      {workflow.created_at && <span>Created {formatRelative(workflow.created_at)}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-green-500/10 px-2.5 py-2 text-xs font-medium text-green-600" title="Successful runs"><CheckCircle2 className="h-4 w-4" />{workflow.successful_runs}</span>
                    <button type="button" onClick={() => triggerMutation.mutate(workflow.id)} disabled={anyActionPending || workflow.status !== 'active'} title="Run workflow manually" aria-label={`Run ${workflow.name} manually`} className="rounded-lg border border-border p-2 transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"><Play className="h-4 w-4" /></button>
                    <button type="button" onClick={() => toggleMutation.mutate(workflow.id)} disabled={anyActionPending || workflow.status === 'archived'} title={workflow.status === 'active' ? 'Pause workflow' : 'Activate workflow'} aria-label={`${workflow.status === 'active' ? 'Pause' : 'Activate'} ${workflow.name}`} className="rounded-lg border border-border p-2 transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">
                      {toggleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : workflow.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 text-green-600" />}
                    </button>
                    <button type="button" onClick={() => setHistoryOpen((current) => current === workflow.id ? null : workflow.id)} aria-expanded={historyOpen === workflow.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium transition hover:bg-muted"><History className="h-4 w-4" /> History {historyOpen === workflow.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}</button>
                  </div>
                </div>
                {historyOpen === workflow.id && <WorkflowRunHistory workflowId={workflow.id} />}
              </motion.article>
            ))}
          </div>
        )}
      </section>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !createMutation.isPending) { setCreateOpen(false); setFormError(''); } }}>
          <section role="dialog" aria-modal="true" aria-labelledby="workflow-dialog-title" className="my-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3"><div className="rounded-xl bg-brand-500/10 p-2.5"><Settings2 className="h-5 w-5 text-brand-500" /></div><div><h2 id="workflow-dialog-title" className="text-lg font-semibold">Create a workflow</h2><p className="mt-1 text-sm text-muted-foreground">Choose an event and configure supported automation actions.</p></div></div>
              <button type="button" onClick={() => { if (!createMutation.isPending) { setCreateOpen(false); setFormError(''); } }} disabled={createMutation.isPending} aria-label="Close workflow creation dialog" className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="max-h-[72vh] space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2"><label htmlFor="workflow-name" className="mb-1.5 block text-sm font-medium">Workflow name <span className="text-red-500">*</span></label><input id="workflow-name" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} placeholder="e.g. Decision approval follow-up" maxLength={255} required autoFocus className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" /></div>
                  <div className="sm:col-span-2"><label htmlFor="workflow-description" className="mb-1.5 block text-sm font-medium">Description</label><textarea id="workflow-description" value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} placeholder="What business outcome should this workflow support?" rows={2} className="w-full resize-y rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" /></div>
                </div>

                <div className="rounded-xl border border-border p-4">
                  <div className="mb-4"><h3 className="font-semibold">1. Choose a trigger</h3><p className="mt-1 text-sm text-muted-foreground">Select one of the events registered by the V4.11 backend.</p></div>
                  <label htmlFor="workflow-trigger" className="mb-1.5 block text-sm font-medium">Trigger event</label>
                  <div className="relative"><select id="workflow-trigger" value={draft.triggerType} onChange={(event) => updateDraft('triggerType', event.target.value)} required className="w-full appearance-none rounded-lg border border-border bg-background px-3.5 py-2.5 pr-10 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20">{TRIGGER_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /></div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">{ALL_TRIGGERS.find((option) => option.value === draft.triggerType)?.description}</p>
                  {DECISION_TRIGGERS.has(draft.triggerType) && (
                    <div className="mt-4 rounded-lg bg-muted/40 p-3"><p className="text-xs font-medium">Optional decision filters</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Filter matching events by decision type, priority, status or team. Leave as an empty object to match all events of this trigger.</p><textarea aria-label="Decision trigger filters JSON" value={draft.triggerConfig} onChange={(event) => updateDraft('triggerConfig', event.target.value)} spellCheck={false} rows={4} className="mt-2 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-xs leading-5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" /><p className="mt-2 text-xs text-muted-foreground">Example: {'{"decisionTypes":["strategic"],"priorities":["high","critical"],"statuses":["proposed"],"teamId":"TEAM_UUID"}'}</p></div>
                  )}
                </div>

                <div className="rounded-xl border border-border p-4">
                  <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="font-semibold">2. Configure action steps</h3><p className="mt-1 text-sm text-muted-foreground">The execution worker currently supports task creation and notifications.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => addStep('task.create')} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"><ListTodo className="h-4 w-4" /> Add task</button><button type="button" onClick={() => addStep('notification.create')} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"><Bell className="h-4 w-4" /> Add notification</button></div></div>

                  {draft.steps.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-7 text-center"><Settings2 className="mx-auto h-7 w-7 text-muted-foreground/50" /><p className="mt-2 text-sm font-medium">No action steps configured</p><p className="mt-1 text-xs text-muted-foreground">This saves a trigger-only workflow. Add an action before expecting it to change business data.</p></div>
                  ) : (
                    <div className="space-y-3">
                      {draft.steps.map((step, index) => {
                        const type = String(step.type);
                        const config = toRecord(step.config);
                        return (
                          <div key={`step-${index}`} className="rounded-xl border border-border bg-background p-3 sm:p-4">
                            <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/10 text-xs font-semibold text-brand-500">{index + 1}</span><span className="text-sm font-semibold">{type === 'task.create' ? 'Create task' : 'Create notification'}</span></div><button type="button" onClick={() => removeStep(index)} aria-label={`Remove step ${index + 1}`} className="rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div>
                            <label className="mb-1.5 block text-xs font-medium" htmlFor={`step-type-${index}`}>Action type</label><select id={`step-type-${index}`} value={type} onChange={(event) => updateStep(index, emptyAction(event.target.value as ActionType))} className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="task.create">task.create</option><option value="notification.create">notification.create</option></select>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <div className="sm:col-span-2"><label htmlFor={`step-title-${index}`} className="mb-1 block text-xs font-medium">{type === 'task.create' ? 'Task title' : 'Notification title'} *</label><input id={`step-title-${index}`} value={String(config.title ?? '')} onChange={(event) => updateStepConfig(index, 'title', event.target.value)} required maxLength={240} placeholder="Use {{decision.title}} to insert event data" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" /></div>
                              {type === 'task.create' ? (
                                <>
                                  <div className="sm:col-span-2"><label htmlFor={`step-description-${index}`} className="mb-1 block text-xs font-medium">Description</label><textarea id={`step-description-${index}`} value={String(config.description ?? '')} onChange={(event) => updateStepConfig(index, 'description', event.target.value)} rows={2} placeholder="Optional task details" className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
                                  <div><label htmlFor={`step-priority-${index}`} className="mb-1 block text-xs font-medium">Priority</label><select id={`step-priority-${index}`} value={String(config.priority ?? 'medium')} onChange={(event) => updateStepConfig(index, 'priority', event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></div>
                                  <div><label htmlFor={`step-assignee-${index}`} className="mb-1 block text-xs font-medium">Assignee</label><select id={`step-assignee-${index}`} value={String(config.assignee ?? 'owner')} onChange={(event) => updateStepConfig(index, 'assignee', event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="owner">Decision owner</option><option value="creator">Decision creator</option><option value="actor">Event actor</option><option value="unassigned">Unassigned</option></select></div>
                                  <div><label htmlFor={`step-due-${index}`} className="mb-1 block text-xs font-medium">Due in hours (optional)</label><input id={`step-due-${index}`} type="number" min="1" max="8760" value={String(config.dueInHours ?? '')} onChange={(event) => updateStepConfig(index, 'dueInHours', event.target.value)} placeholder="e.g. 48" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                                </>
                              ) : (
                                <>
                                  <div className="sm:col-span-2"><label htmlFor={`step-message-${index}`} className="mb-1 block text-xs font-medium">Message</label><textarea id={`step-message-${index}`} value={String(config.message ?? '')} onChange={(event) => updateStepConfig(index, 'message', event.target.value)} rows={2} placeholder="Optional notification message" className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
                                  <div><label htmlFor={`step-recipient-${index}`} className="mb-1 block text-xs font-medium">Recipient</label><select id={`step-recipient-${index}`} value={String(config.recipient ?? 'approvers')} onChange={(event) => updateStepConfig(index, 'recipient', event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="owner">Decision owner</option><option value="creator">Decision creator</option><option value="actor">Event actor</option><option value="approvers">All active owners, admins and managers</option></select></div>
                                  <div><label htmlFor={`step-url-${index}`} className="mb-1 block text-xs font-medium">Action URL (optional)</label><input id={`step-url-${index}`} value={String(config.actionUrl ?? '')} onChange={(event) => updateStepConfig(index, 'actionUrl', event.target.value)} placeholder="/decisions" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
                                </>
                              )}
                            </div>
                            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Supported placeholders: {'{{decision.title}}'}, {'{{decision.id}}'}, {'{{decision.status}}'}, {'{{decision.priority}}'}, {'{{actor.id}}'} and {'{{workflow.name}}'}.</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-muted-foreground"><div className="flex items-start gap-2"><Ban className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p>Automation can create tasks and notifications only. It cannot approve, reject, implement or otherwise bypass the decision-governance process. New workflows are not activated automatically; activate them after reviewing their configuration.</p></div></div>
                {formError && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500">{formError}</div>}
              </div>

              <div className="flex flex-col-reverse justify-between gap-3 border-t border-border bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:px-6"><p className="text-xs text-muted-foreground">Creation saves the workflow definition to your organisation.</p><div className="flex gap-2"><button type="button" onClick={() => { if (!createMutation.isPending) { setCreateOpen(false); setFormError(''); } }} disabled={createMutation.isPending} className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-muted disabled:opacity-50">Cancel</button><button type="submit" disabled={createMutation.isPending} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">{createMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <><Plus className="h-4 w-4" /> Create workflow</>}</button></div></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
