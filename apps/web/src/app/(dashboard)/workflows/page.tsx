
'use client';

import { useState } from 'react';
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
  CheckCircle,
  RefreshCw,
  Loader2,
  AlertCircle,
  X,
  FileText,
  CalendarDays,
  Clock,
  ChevronDown,
  Sparkles,
  Settings2,
} from 'lucide-react';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { toast } from 'sonner';

type DataRecord = Record<string, unknown>;

type WorkflowItem = DataRecord & {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  trigger_type: string;
  run_count: number;
  successful_runs: number;
  created_at: string;
};

type WorkflowPayload = {
  name: string;
  description?: string;
  triggerType: string;
  triggerConfig: DataRecord;
  steps: DataRecord[];
};

type WorkflowTemplate = {
  title: string;
  description: string;
  trigger: string;
  icon: typeof FileText;
};

type WorkflowDraft = {
  name: string;
  description: string;
  triggerType: string;
  triggerConfig: string;
  steps: string;
};

const TRIGGER_OPTIONS = [
  {
    value: 'document.indexed',
    label: 'Document indexed',
    description: 'Run when a document finishes indexing.',
  },
  {
    value: 'meeting.completed',
    label: 'Meeting completed',
    description: 'Run after a meeting has been completed.',
  },
  {
    value: 'schedule.weekly',
    label: 'Weekly schedule',
    description: 'Use for a recurring weekly workflow.',
  },
  {
    value: 'task.overdue',
    label: 'Task overdue',
    description: 'Run when an overdue-task event is emitted.',
  },
  {
    value: 'manual',
    label: 'Manual trigger',
    description: 'Run when a user triggers the workflow.',
  },
];

const TEMPLATES: WorkflowTemplate[] = [
  {
    title: 'Document intelligence',
    description:
      'Start a workflow when a document has been indexed.',
    trigger: 'document.indexed',
    icon: FileText,
  },
  {
    title: 'Meeting follow-up',
    description:
      'Start a workflow when meeting processing is complete.',
    trigger: 'meeting.completed',
    icon: CalendarDays,
  },
  {
    title: 'Weekly business review',
    description:
      'Set up a workflow for a weekly business review.',
    trigger: 'schedule.weekly',
    icon: Clock,
  },
  {
    title: 'Overdue task escalation',
    description:
      'Start a workflow when an overdue-task event is emitted.',
    trigger: 'task.overdue',
    icon: AlertCircle,
  },
];

const EMPTY_DRAFT: WorkflowDraft = {
  name: '',
  description: '',
  triggerType: 'document.indexed',
  triggerConfig: '{}',
  steps: '[]',
};

function isRecord(value: unknown): value is DataRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function unwrapResponse(value: unknown): unknown {
  let current = value;

  for (let depth = 0; depth < 5; depth += 1) {
    if (Array.isArray(current)) {
      return current;
    }

    if (!isRecord(current)) {
      break;
    }

    if (Array.isArray(current.workflows)) {
      return current.workflows;
    }

    if (Array.isArray(current.items)) {
      return current.items;
    }

    if (Array.isArray(current.results)) {
      return current.results;
    }

    if (
      Object.prototype.hasOwnProperty.call(current, 'data')
    ) {
      current = current.data;
      continue;
    }

    break;
  }

  if (Array.isArray(current)) {
    return current;
  }

  throw new Error(
    'The workflows API returned an unexpected response format.',
  );
}

function normalizeWorkflows(value: unknown): WorkflowItem[] {
  const payload = unwrapResponse(value);

  if (!Array.isArray(payload)) {
    throw new Error(
      'The workflows API did not return a workflow list.',
    );
  }

  return payload
    .filter(isRecord)
    .map((item, index) => ({
      ...item,
      id:
        typeof item.id === 'string'
          ? item.id
          : `workflow-${index}`,
      name:
        typeof item.name === 'string' && item.name.trim()
          ? item.name.trim()
          : 'Unnamed workflow',
      description:
        typeof item.description === 'string'
          ? item.description
          : '',
      is_active:
        item.is_active === true ||
        item.is_active === 'true',
      trigger_type:
        typeof item.trigger_type === 'string'
          ? item.trigger_type
          : 'Not specified',
      run_count: Number.isFinite(Number(item.run_count))
        ? Number(item.run_count)
        : 0,
      successful_runs: Number.isFinite(
        Number(item.successful_runs),
      )
        ? Number(item.successful_runs)
        : 0,
      created_at:
        typeof item.created_at === 'string'
          ? item.created_at
          : '',
    }));
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (isRecord(error) && isRecord(error.response)) {
    const responseData = error.response.data;

    if (isRecord(responseData)) {
      const message = responseData.message;

      if (typeof message === 'string' && message.trim()) {
        return message;
      }

      if (
        Array.isArray(message) &&
        message.every((item) => typeof item === 'string')
      ) {
        return message.join(', ');
      }
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function parseJsonObject(
  input: string,
  label: string,
): DataRecord {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return parsed;
}

function parseSteps(input: string): DataRecord[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error('Workflow steps must contain valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      'Workflow steps must be a JSON array of action objects.',
    );
  }

  if (!parsed.every(isRecord)) {
    throw new Error(
      'Each workflow step must be a JSON object.',
    );
  }

  return parsed;
}

function createDraft(
  values?: Partial<WorkflowDraft>,
): WorkflowDraft {
  return {
    ...EMPTY_DRAFT,
    ...values,
  };
}

function triggerLabel(trigger: string): string {
  return (
    TRIGGER_OPTIONS.find(
      (option) => option.value === trigger,
    )?.label ?? trigger.replace(/[._-]+/g, ' ')
  );
}

export default function WorkflowsPage() {
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<WorkflowDraft>(
    createDraft(),
  );
  const [formError, setFormError] = useState('');

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

  const createMutation = useMutation<
    unknown,
    Error,
    WorkflowPayload
  >({
    mutationFn: async (payload) => {
      const response = await api.post<unknown>(
        '/workflows',
        payload,
      );

      return response.data;
    },

    onSuccess: async () => {
      toast.success('Workflow created successfully.');

      setCreateOpen(false);
      setDraft(createDraft());
      setFormError('');

      await queryClient.invalidateQueries({
        queryKey: ['workflows'],
      });
    },

    onError: (error) => {
      const message = getErrorMessage(
        error,
        'Failed to create the workflow.',
      );

      setFormError(message);
      toast.error(message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/workflows/${id}/toggle`),

    onSuccess: async () => {
      toast.success('Workflow status updated.');

      await queryClient.invalidateQueries({
        queryKey: ['workflows'],
      });
    },

    onError: (error: unknown) => {
      toast.error(
        getErrorMessage(
          error,
          'Failed to update workflow status.',
        ),
      );
    },
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/workflows/${id}/trigger`, {}),

    onSuccess: () => {
      toast.success('Workflow execution requested.');

      void queryClient.invalidateQueries({
        queryKey: ['workflows'],
      });
    },

    onError: (error: unknown) => {
      toast.error(
        getErrorMessage(
          error,
          'Failed to trigger the workflow.',
        ),
      );
    },
  });

  const anyActionPending =
    toggleMutation.isPending ||
    triggerMutation.isPending;

  function openCreate(
    template?: WorkflowTemplate,
  ) {
    setFormError('');

    setDraft(
      template
        ? createDraft({
            name: template.title,
            description: template.description,
            triggerType: template.trigger,
          })
        : createDraft(),
    );

    setCreateOpen(true);
  }

  function updateDraft(
    field: keyof WorkflowDraft,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));

    setFormError('');
  }

  function handleCreateSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setFormError('');

    const name = draft.name.trim();

    if (!name) {
      setFormError('Enter a name for this workflow.');
      return;
    }

    if (name.length > 255) {
      setFormError(
        'Workflow names must be 255 characters or fewer.',
      );
      return;
    }

    try {
      const triggerConfig = parseJsonObject(
        draft.triggerConfig,
        'Trigger configuration',
      );

      const steps = parseSteps(draft.steps);

      createMutation.mutate({
        name,
        description: draft.description.trim() || undefined,
        triggerType: draft.triggerType,
        triggerConfig,
        steps,
      });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Please check the workflow configuration.',
      );
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-teal-500/10 p-3">
            <Workflow className="h-6 w-6 text-teal-500" />
          </div>

          <div>
            <h1 className="text-2xl font-bold">
              Workflow Automation
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Design and manage automated business processes.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => openCreate()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600"
        >
          <Plus className="h-4 w-4" />
          New Workflow
        </button>
      </header>

      {/* Templates */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2">
            <Sparkles className="h-5 w-5 text-violet-500" />
          </div>

          <div>
            <h2 className="font-semibold">
              Start with a template
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Templates prefill a workflow name and trigger. Review
              its settings and add supported actions before relying
              on it in production.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TEMPLATES.map((template) => {
            const Icon = template.icon;

            return (
              <button
                type="button"
                key={template.trigger}
                onClick={() => openCreate(template)}
                className="group flex items-start gap-3 rounded-xl border border-border p-4 text-left transition hover:border-brand-500/50 hover:bg-muted/40"
              >
                <span className="rounded-lg bg-muted p-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {template.title}
                  </span>

                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {template.description}
                  </span>

                  <span className="mt-2 inline-block font-mono text-xs text-brand-500">
                    {template.trigger}
                  </span>
                </span>

                <Plus className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-brand-500" />
              </button>
            );
          })}
        </div>
      </section>

      {/* Workflow list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              Your workflows
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              {isLoading
                ? 'Loading workflows…'
                : `${workflows.length} workflow${workflows.length === 1 ? '' : 's'} configured`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Refresh workflows"
            className="rounded-lg border border-border p-2 transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                isFetching ? 'animate-spin' : ''
              }`}
            />
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-xl border border-border bg-card"
              />
            ))}
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-card p-6"
          >
            <h3 className="font-semibold">
              Could not load workflows
            </h3>

            <p className="mt-2 text-sm text-red-500">
              {getErrorMessage(
                error,
                'The workflow request failed.',
              )}
            </p>

            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              Try again
            </button>
          </div>
        ) : workflows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
            <Workflow className="mx-auto h-10 w-10 text-muted-foreground/40" />

            <h3 className="mt-3 font-semibold">
              No workflows yet
            </h3>

            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Create your first workflow to save a trigger and its
              action-step configuration.
            </p>

            <button
              type="button"
              onClick={() => openCreate()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" />
              Create workflow
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {workflows.map((workflow) => (
              <motion.article
                key={workflow.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <span
                    className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
                      workflow.is_active
                        ? 'bg-green-500'
                        : 'bg-muted-foreground/40'
                    }`}
                    aria-label={
                      workflow.is_active ? 'Active' : 'Inactive'
                    }
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words font-semibold">
                        {workflow.name}
                      </h3>

                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          workflow.is_active
                            ? 'bg-green-500/10 text-green-600'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {workflow.is_active ? 'Active' : 'Paused'}
                      </span>
                    </div>

                    {workflow.description && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {workflow.description}
                      </p>
                    )}

                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      Trigger: {triggerLabel(workflow.trigger_type)}
                      {' · '}
                      {workflow.run_count} runs
                      {' · '}
                      {workflow.successful_runs} successful
                      {workflow.created_at
                        ? ` · Created ${formatRelative(workflow.created_at)}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1 rounded-lg bg-green-500/10 px-2.5 py-2 text-xs font-medium text-green-600"
                      title="Successful runs"
                    >
                      <CheckCircle className="h-4 w-4" />
                      {workflow.successful_runs}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        triggerMutation.mutate(workflow.id)
                      }
                      disabled={
                        anyActionPending ||
                        !workflow.is_active
                      }
                      title="Trigger workflow manually"
                      aria-label={`Trigger ${workflow.name}`}
                      className="rounded-lg border border-border p-2 transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {triggerMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        toggleMutation.mutate(workflow.id)
                      }
                      disabled={anyActionPending}
                      title={
                        workflow.is_active
                          ? 'Pause workflow'
                          : 'Activate workflow'
                      }
                      aria-label={`${
                        workflow.is_active ? 'Pause' : 'Activate'
                      } ${workflow.name}`}
                      className="rounded-lg border border-border p-2 transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {toggleMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : workflow.is_active ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4 text-green-600" />
                      )}
                    </button>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </section>

      {/* Creation dialog */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              if (!createMutation.isPending) {
                setCreateOpen(false);
                setFormError('');
              }
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="workflow-dialog-title"
            className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-brand-500/10 p-2.5">
                  <Settings2 className="h-5 w-5 text-brand-500" />
                </div>

                <div>
                  <h2
                    id="workflow-dialog-title"
                    className="text-lg font-semibold"
                  >
                    Create a workflow
                  </h2>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Configure the trigger and save your action steps.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!createMutation.isPending) {
                    setCreateOpen(false);
                    setFormError('');
                  }
                }}
                disabled={createMutation.isPending}
                aria-label="Close workflow creation dialog"
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
                {/* Basic information */}
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="workflow-name"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Workflow name <span className="text-red-500">*</span>
                    </label>

                    <input
                      id="workflow-name"
                      value={draft.name}
                      onChange={(event) =>
                        updateDraft('name', event.target.value)
                      }
                      placeholder="e.g. Document analysis and notification"
                      maxLength={255}
                      required
                      autoFocus
                      className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />

                    <p className="mt-1 text-xs text-muted-foreground">
                      Use a clear name that describes the business outcome.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="workflow-description"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Description
                    </label>

                    <textarea
                      id="workflow-description"
                      value={draft.description}
                      onChange={(event) =>
                        updateDraft(
                          'description',
                          event.target.value,
                        )
                      }
                      placeholder="What should this workflow accomplish?"
                      rows={2}
                      className="w-full resize-y rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                </div>

                {/* Trigger configuration */}
                <div className="rounded-xl border border-border p-4">
                  <div className="mb-4">
                    <h3 className="font-semibold">
                      1. Choose a trigger
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                      The event that should start this workflow.
                    </p>
                  </div>

                  <label
                    htmlFor="workflow-trigger"
                    className="mb-1.5 block text-sm font-medium"
                  >
                    Trigger event
                  </label>

                  <div className="relative">
                    <select
                      id="workflow-trigger"
                      value={draft.triggerType}
                      onChange={(event) =>
                        updateDraft(
                          'triggerType',
                          event.target.value,
                        )
                      }
                      required
                      className="w-full appearance-none rounded-lg border border-border bg-background px-3.5 py-2.5 pr-10 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    >
                      {TRIGGER_OPTIONS.map((option) => (
                        <option
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>

                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {
                      TRIGGER_OPTIONS.find(
                        (option) =>
                          option.value === draft.triggerType,
                      )?.description
                    }
                  </p>

                  <div className="mt-4">
                    <label
                      htmlFor="workflow-trigger-config"
                      className="mb-1.5 block text-sm font-medium"
                    >
                      Trigger configuration (JSON)
                    </label>

                    <textarea
                      id="workflow-trigger-config"
                      value={draft.triggerConfig}
                      onChange={(event) =>
                        updateDraft(
                          'triggerConfig',
                          event.target.value,
                        )
                      }
                      spellCheck={false}
                      rows={4}
                      className="w-full resize-y rounded-lg border border-border bg-background px-3.5 py-3 font-mono text-xs leading-5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />

                    <p className="mt-1 text-xs text-muted-foreground">
                      Must be a valid JSON object. Use the fields
                      expected by your workflow trigger handler.
                    </p>
                  </div>
                </div>

                {/* Workflow steps */}
                <div className="rounded-xl border border-border p-4">
                  <div className="mb-4">
                    <h3 className="font-semibold">
                      2. Configure action steps
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Define the actions to run when the trigger fires.
                    </p>
                  </div>

                  <label
                    htmlFor="workflow-steps"
                    className="mb-1.5 block text-sm font-medium"
                  >
                    Action steps (JSON array)
                  </label>

                  <textarea
                    id="workflow-steps"
                    value={draft.steps}
                    onChange={(event) =>
                      updateDraft('steps', event.target.value)
                    }
                    spellCheck={false}
                    rows={7}
                    className="w-full resize-y rounded-lg border border-border bg-background px-3.5 py-3 font-mono text-xs leading-5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />

                  <div className="mt-3 rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-medium">
                      JSON format example
                    </p>

                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
{`[
  {
    "type": "your_supported_action",
    "config": {
      "key": "value"
    }
  }
]`}
                    </pre>

                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      Replace the example with action objects supported
                      by your workflow execution worker. An empty array
                      saves a workflow without action steps; it will not
                      perform any business actions until steps are added.
                    </p>
                  </div>
                </div>

                {formError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500"
                  >
                    {formError}
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse justify-between gap-3 border-t border-border bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                <p className="text-xs text-muted-foreground">
                  Creation saves the workflow definition to your organisation.
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!createMutation.isPending) {
                        setCreateOpen(false);
                        setFormError('');
                      }
                    }}
                    disabled={createMutation.isPending}
                    className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating…
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        Create workflow
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
