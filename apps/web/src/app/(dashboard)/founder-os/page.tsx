
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Target,
  Activity,
  Plus,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Zap,
  BarChart2,
  Users,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  RadarChart,
  Radar,
  Dot,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import api from '@/lib/api';
import { toast } from 'sonner';
import { HealthRadarChart } from './health-radar-chart';

type DataRecord = Record<string, unknown>;
type NullableScore = number | null;

interface HealthScore {
  overall: NullableScore;
  financial: NullableScore;
  growth: NullableScore;
  team: NullableScore;
  product: NullableScore;
}

interface FounderDashboard {
  quarter?: string;
  year?: number;
  generatedAt?: string;
  healthScore?: unknown;
  okrs?: unknown;
  kpis?: unknown;
  teamVelocity?: unknown;
  taskBreakdown?: unknown;
}

interface VelocityPoint {
  week: string;
  completed: number;
}

const SCORE_COLOR = (score: number) =>
  score >= 75
    ? '#10b981'
    : score >= 50
      ? '#f59e0b'
      : '#ef4444';

function isRecord(value: unknown): value is DataRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function asRecord(value: unknown): DataRecord | null {
  return isRecord(value) ? value : null;
}

function asArray(value: unknown): DataRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (
    typeof value === 'string' &&
    value.trim() !== ''
  ) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toNullableScore(value: unknown): NullableScore {
  const score = toFiniteNumber(value);

  if (score === null) {
    return null;
  }

  return Math.min(100, Math.max(0, score));
}

function formatMetricValue(value: unknown): string {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return new Intl.NumberFormat().format(value);
  }

  if (
    typeof value === 'string' &&
    value.trim() !== ''
  ) {
    const numericValue = Number(value);

    return Number.isFinite(numericValue)
      ? new Intl.NumberFormat().format(numericValue)
      : value;
  }

  return '—';
}

function unwrapApiData(value: unknown): unknown {
  let current = value;

  for (let depth = 0; depth < 3; depth += 1) {
    if (
      isRecord(current) &&
      Object.prototype.hasOwnProperty.call(
        current,
        'data',
      )
    ) {
      current = current.data;
    } else {
      break;
    }
  }

  return current;
}

function getProgress(
  record: DataRecord,
): NullableScore {
  const explicit = toFiniteNumber(record.progress);

  if (explicit !== null) {
    return Math.min(100, Math.max(0, explicit));
  }

  const current = toFiniteNumber(record.current_value);
  const target = toFiniteNumber(record.target_value);

  if (
    current === null ||
    target === null ||
    target <= 0
  ) {
    return null;
  }

  return Math.min(
    100,
    Math.max(0, (current / target) * 100),
  );
}

function buildVelocitySeries(rows: DataRecord[]): VelocityPoint[] {
  // The API supplies the calendar weeks, including verified zero counts.
  return rows.flatMap((row) => {
    const week = typeof row.week === 'string' ? row.week : '';
    const completed = toFiniteNumber(row.completed);
    if (!week || !Number.isFinite(Date.parse(week)) || completed === null || completed < 0) {
      return [];
    }
    return [{ week, completed }];
  });
}


function formatWeekLabel(value: unknown): string {
  const date = new Date(String(value));

  if (!Number.isFinite(date.getTime())) {
    return String(value ?? '');
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

type HealthDimension = Exclude<keyof HealthScore, 'overall'>;

const HEALTH_DIMENSIONS = [
  { key: 'financial', label: 'Financial', color: '#f8bc7a', source: 'Financial health needs a verified benchmark.' },
  { key: 'growth', label: 'Growth', color: '#58ddcf', source: 'Current quarter objective progress and document indexing.' },
  { key: 'team', label: 'Team', color: '#ba9bff', source: 'Members active this week (40%), open tasks with an owner (30%) and open tasks on time (30%).' },
  { key: 'product', label: 'Product', color: '#78baff', source: 'Task completion and the share of tasks that are overdue.' },
] as const;

type RadarPoint = { x: number; y: number; value?: number | null };

function PartialRadar({ points }: { points?: RadarPoint[] }) {
  return (
    <g>
      {(points ?? []).map((start, index, items) => {
        const end = items[(index + 1) % items.length];
        if (start.value == null || end.value == null) return null;
        return (
          <line
            key={index}
            x1={start.x} y1={start.y} x2={end.x} y2={end.y}
            stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

function HealthRadar({ health }: { health: HealthScore }) {
  const gradientId = `founder-health-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [selected, setSelected] = useState<HealthDimension | null>(null);
  const dimensions = HEALTH_DIMENSIONS.map((item) => ({ ...item, score: health[item.key] }));
  const measuredCount = dimensions.filter(({ score }) => score !== null).length;
  const current = dimensions.find(({ key }) => key === selected)
    ?? dimensions.find(({ score }) => score !== null)
    ?? dimensions[0];

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-panel sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-2.5">
            <Activity className="h-5 w-5 text-violet-700 dark:text-violet-300" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Business Health Score</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {measuredCount} of {dimensions.length} dimensions measured
            </p>
          </div>
        </div>
        <div className="flex items-baseline gap-2 rounded-xl border border-border bg-muted px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Overall</span>
          <span className="text-2xl font-semibold leading-none tabular-nums" style={{
            color: health.overall === null ? '#94a3b8' : SCORE_COLOR(health.overall),
          }}>
            {health.overall ?? 'N/A'}
          </span>
          {health.overall !== null && <span className="text-xs text-muted-foreground">/ 100</span>}
        </div>
      </div>

      <div className="grid gap-4 min-[920px]:grid-cols-[minmax(0,1.5fr)_minmax(200px,1fr)]">
        <figure
          aria-label="Business health radar"
          className="flex min-w-0 flex-col justify-center rounded-xl border border-border bg-background/40"
          
        >
          <div className="mx-auto h-[300px] w-full max-w-[400px] min-w-0 sm:h-[340px]">
            <HealthRadarChart dimensions={dimensions} selected={current.key} onSelect={(key) => setSelected(key as HealthDimension)} />
          </div>
          <figcaption className="border-t border-border px-3 py-3 text-center text-xs text-muted-foreground">
            {measuredCount === 0
              ? 'Scores will appear as workspace data becomes available.'
              : 'Overall uses measured dimensions.'}
            {measuredCount > 0 && measuredCount < dimensions.length && ' Missing scores are unplotted.'}
          </figcaption>
        </figure>

        <div className="min-w-0 space-y-2" role="group" aria-label="Inspect a health dimension">
          {dimensions.map(({ key, label, color, score }) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === current.key}
              aria-label={score === null ? `${label}, no score` : `${label}, ${score} out of 100`}
              onClick={() => setSelected(key)}
              className={`block w-full rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 ${key === current.key
                ? 'border-violet-400/50 bg-violet-400/10'
                : 'border-border bg-muted/70 hover:border-border-strong hover:bg-muted'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: score === null ? '#64748b' : color }} />
                <span className="truncate text-sm font-medium text-foreground">{label}</span>
                <span className="ml-auto whitespace-nowrap text-xs font-medium tabular-nums text-foreground/80">
                  {score === null ? 'No score' : `${score} / 100`}
                </span>
              </span>
              <span className="mt-2 block h-1 rounded-full bg-muted">
                {score !== null && (
                  <span className="block h-full rounded-full" style={{ width: `${score}%`, backgroundColor: color }} />
                )}
              </span>
            </button>
          ))}
          <p aria-live="polite" className="px-1 pt-2 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground/80">{current.label}</span>
            {' · '}{current.source}
          </p>
        </div>
      </div>
    </section>
  );
}


// ── OKRs ─────────────────────────────────────────────────────

const STATUS_MAP: Record<
  string,
  { label: string; color: string }
> = {
  on_track: {
    label: 'On Track',
    color: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  },
  at_risk: {
    label: 'At Risk',
    color: 'bg-amber-500/20 text-amber-600 dark:text-amber-400',
  },
  behind: {
    label: 'Behind',
    color: 'bg-red-500/20 text-red-600 dark:text-red-400',
  },
  completed: {
    label: 'Completed',
    color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400',
  },
};


function OkrCard({ obj }: { obj: DataRecord }) {
  const [expanded, setExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [metricType, setMetricType] = useState('number');
  const [targetValue, setTargetValue] = useState('');
  const [startValue, setStartValue] = useState('0');
  const [unit, setUnit] = useState('');

  const queryClient = useQueryClient();

  const objectiveId =
    typeof obj.id === 'string' ? obj.id : '';

  const statusKey = String(obj.status ?? '');
  const status = STATUS_MAP[statusKey] ?? {
    label: 'Unknown status',
    color: 'bg-muted text-foreground/80',
  };

  const keyResults = asArray(obj.key_results);
  const progress = getProgress(obj);

  const addKeyResult = useMutation({
    mutationFn: async () => {
      if (!objectiveId) {
        throw new Error(
          'This objective has no valid ID. Refresh the page and try again.',
        );
      }

      const cleanTitle = title.trim();
      const target = Number(targetValue);
      const start = Number(startValue || '0');

      if (!cleanTitle) {
        throw new Error('Enter a title for the Key Result.');
      }

      if (
        targetValue.trim() === '' ||
        !Number.isFinite(target) ||
        target < 0
      ) {
        throw new Error(
          'Enter a valid, non-negative target value.',
        );
      }

      if (
        !Number.isFinite(start) ||
        start < 0
      ) {
        throw new Error(
          'Enter a valid, non-negative starting value.',
        );
      }

      return api.post(
        `/founder-os/okrs/${encodeURIComponent(objectiveId)}/key-results`,
        {
          title: cleanTitle,
          metricType,
          targetValue: target,
          startValue: start,
          ...(unit.trim()
            ? { unit: unit.trim() }
            : {}),
        },
      );
    },

    onSuccess: async () => {
      toast.success('Key Result added successfully.');

      setTitle('');
      setMetricType('number');
      setTargetValue('');
      setStartValue('0');
      setUnit('');
      setShowAddForm(false);

      await queryClient.invalidateQueries({
        queryKey: ['founder-os'],
      });
    },

    onError: (error: unknown) => {
      const responseData = (
        error as {
          response?: {
            data?: {
              message?: string | string[];
            };
          };
        }
      )?.response?.data;

      const apiMessage = responseData?.message;

      const message = Array.isArray(apiMessage)
        ? apiMessage.join(', ')
        : typeof apiMessage === 'string'
          ? apiMessage
          : error instanceof Error
            ? error.message
            : 'Failed to add the Key Result.';

      toast.error(message);
    },
  });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Objective header */}
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-muted/50"
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Target className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />

          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {String(obj.title ?? 'Untitled objective')}
            </p>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {String(obj.quarter ?? '—')}{' '}
              {String(obj.year ?? '')}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.color}`}
          >
            {status.label}
          </span>

          <div className="hidden h-1.5 w-16 rounded-full bg-muted sm:block">
            <div
              className="h-1.5 rounded-full bg-violet-500 transition-all"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>

          <span className="w-10 text-right text-xs text-muted-foreground">
            {progress === null
              ? 'N/A'
              : `${Math.round(progress)}%`}
          </span>

          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        </div>
      </button>

      {/* Expanded objective: Key Results */}
      {expanded && (
        <div className="space-y-4 border-t border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium text-foreground">
                Key Results
              </h3>

              <p className="mt-1 text-xs text-muted-foreground">
                {keyResults.length} key result
                {keyResults.length === 1 ? '' : 's'} attached
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddForm((previous) => !previous)}
              disabled={!objectiveId}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm font-medium text-violet-700 dark:text-violet-300 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {showAddForm ? 'Cancel' : 'Add Key Result'}
            </button>
          </div>

          {/* Add Key Result form */}
          {showAddForm && (
            <form
              className="space-y-4 rounded-xl border border-violet-500/20 bg-background/60 p-4"
              onSubmit={(event) => {
                event.preventDefault();

                if (!addKeyResult.isPending) {
                  addKeyResult.mutate();
                }
              }}
            >
              <div>
                <label
                  htmlFor={`kr-title-${objectiveId}`}
                  className="mb-1.5 block text-sm font-medium text-foreground/80"
                >
                  Key Result title
                </label>

                <input
                  id={`kr-title-${objectiveId}`}
                  type="text"
                  required
                  maxLength={250}
                  placeholder="e.g. Acquire 100 paying customers"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-card px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-violet-500"
                  disabled={addKeyResult.isPending}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`kr-type-${objectiveId}`}
                    className="mb-1.5 block text-sm font-medium text-foreground/80"
                  >
                    Measurement type
                  </label>

                  <select
                    id={`kr-type-${objectiveId}`}
                    value={metricType}
                    onChange={(event) =>
                      setMetricType(event.target.value)
                    }
                    className="w-full rounded-lg border border-border-strong bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-violet-500"
                    disabled={addKeyResult.isPending}
                  >
                    <option value="number">Number</option>
                    <option value="percentage">Percentage</option>
                    <option value="currency">Currency</option>
                    <option value="boolean">Yes / No</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor={`kr-unit-${objectiveId}`}
                    className="mb-1.5 block text-sm font-medium text-foreground/80"
                  >
                    Unit (optional)
                  </label>

                  <input
                    id={`kr-unit-${objectiveId}`}
                    type="text"
                    maxLength={40}
                    placeholder="e.g. customers, USD"
                    value={unit}
                    onChange={(event) => setUnit(event.target.value)}
                    className="w-full rounded-lg border border-border-strong bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-violet-500"
                    disabled={addKeyResult.isPending}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`kr-start-${objectiveId}`}
                    className="mb-1.5 block text-sm font-medium text-foreground/80"
                  >
                    Starting value
                  </label>

                  <input
                    id={`kr-start-${objectiveId}`}
                    type="number"
                    min="0"
                    step="any"
                    value={startValue}
                    onChange={(event) =>
                      setStartValue(event.target.value)
                    }
                    className="w-full rounded-lg border border-border-strong bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-violet-500"
                    disabled={addKeyResult.isPending}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`kr-target-${objectiveId}`}
                    className="mb-1.5 block text-sm font-medium text-foreground/80"
                  >
                    Target value
                  </label>

                  <input
                    id={`kr-target-${objectiveId}`}
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={targetValue}
                    onChange={(event) =>
                      setTargetValue(event.target.value)
                    }
                    placeholder="e.g. 100"
                    className="w-full rounded-lg border border-border-strong bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-violet-500"
                    disabled={addKeyResult.isPending}
                  />
                </div>
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                Progress starts from your starting value and is
                measured against the target. You can update the
                current value later.
              </p>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="rounded-lg px-4 py-2 text-sm text-foreground/80 transition hover:bg-muted"
                  disabled={addKeyResult.isPending}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    addKeyResult.isPending ||
                    !title.trim() ||
                    targetValue.trim() === ''
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addKeyResult.isPending
                    ? 'Adding…'
                    : (
                      <>
                        <Plus className="h-4 w-4" />
                        Add Key Result
                      </>
                    )}
                </button>
              </div>
            </form>
          )}

          {/* Existing Key Results */}
          {keyResults.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center">
              <Target className="mx-auto mb-2 h-7 w-7 text-muted-foreground/80" />

              <p className="text-sm font-medium text-foreground/80">
                No Key Results yet
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                This Objective is valid without Key Results.
                Add measurable outcomes whenever you are ready.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {keyResults.map((keyResult, index) => {
                const needsBaseline = keyResult.start_value === null;
                const krProgress = needsBaseline ? null : getProgress(keyResult);
                const current = keyResult.current_value;
                const target = keyResult.target_value;
                const unit = String(keyResult.unit ?? '');

                return (
                  <div
                    key={String(keyResult.id ?? index)}
                    className="rounded-lg border border-border bg-card/70 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-400" />

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground/90">
                          {String(
                            keyResult.title ??
                              'Untitled Key Result',
                          )}
                        </p>

                        <div className="mt-2 flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-violet-500 transition-all"
                              style={{
                                width: `${krProgress ?? 0}%`,
                              }}
                            />
                          </div>

                          <span className="w-12 text-right text-xs font-medium text-muted-foreground">
                            {krProgress === null
                              ? 'N/A'
                              : `${Math.round(krProgress)}%`}
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-muted-foreground">
                          {needsBaseline ? 'Baseline unverified · target ' : formatMetricValue(current) + ' / '}
                          {formatMetricValue(target)}
                          {unit ? ` ${unit}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Founder OS Page ──────────────────────────────────────────

function goalError(error: unknown) {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join(' ') : message || 'Could not create the goal. Try again.';
}

export default function FounderOsPage() {
  const queryClient = useQueryClient();

  const { user } = useAuth();
  const canCreateGoal = Boolean(user?.organizationId) && ['owner','admin','manager','member'].includes(user?.role ?? '');
  const goalDialog = useRef<HTMLDialogElement>(null);
  const [newOkrTitle, setNewOkrTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  useEffect(() => {
    if (canCreateGoal && new URLSearchParams(window.location.search).get('createGoal') === '1' && !goalDialog.current?.open) {
      goalDialog.current?.showModal();
    }
  }, [canCreateGoal]);

  const {
    data: dashboard,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<FounderDashboard, Error>({
    queryKey: ['founder-os', 'dashboard'],

    queryFn: async () => {
      const response = await api.get<unknown>(
        '/founder-os/dashboard',
        { params: { includeInsights: false } },
      );

      const payload = unwrapApiData(response.data);

      if (!isRecord(payload)) {
        throw new Error(
          'The Founder OS API returned an invalid dashboard response.',
        );
      }

      return payload as FounderDashboard;
    },

    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const insightsQuery = useQuery({
    queryKey: ['founder-os', 'insights'],
    // AI commentary costs tokens, so it is generated only when someone asks for it.
    enabled: false,
    queryFn: async () => {
      const response = await api.get<unknown>('/founder-os/insights');
      return asRecord(unwrapApiData(response.data));
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const createOkr = useMutation({
    mutationFn: async (title: string) => {
      const cleanedTitle = title.trim();

      if (!cleanedTitle) {
        throw new Error('Enter an objective title.');
      }

      const quarter =
        `Q${Math.ceil(
          (new Date().getMonth() + 1) / 3,
        )}`;

      const response = await api.post<unknown>(
        '/founder-os/okrs',
        {
          title: cleanedTitle,
          quarter: dashboard?.quarter ?? quarter,
          year: dashboard?.year ?? new Date().getFullYear(),
          ...(goalDescription.trim() ? { description: goalDescription.trim() } : {}),
          ...(goalDeadline ? { dueDate: goalDeadline } : {}),
        },
      );

      return unwrapApiData(response.data);
    },

    onSuccess: async () => {
      toast.success(
        'Objective created successfully.',
      );

      goalDialog.current?.close();
      setNewOkrTitle('');
      setGoalDescription('');
      setGoalDeadline('');
      void queryClient.invalidateQueries({ queryKey: ['chief-of-staff'] });

      await queryClient.invalidateQueries({
        queryKey: ['founder-os'],
      });
    },

    onError: (mutationError: unknown) => {
      toast.error(
        goalError(mutationError),
      );
    },
  });

  const healthRecord = asRecord(
    dashboard?.healthScore,
  );

  const health: HealthScore = {
    overall: toNullableScore(healthRecord?.overall),
    financial: toNullableScore(healthRecord?.financial),
    growth: toNullableScore(healthRecord?.growth),
    team: toNullableScore(healthRecord?.team),
    product: toNullableScore(healthRecord?.product),
  };

  const okrs = asArray(
    asRecord(dashboard?.okrs)?.objectives,
  );

  const kpis = asArray(dashboard?.kpis);

  const teamVelocity = asArray(
    dashboard?.teamVelocity,
  );

  const velocitySeries = buildVelocitySeries(
    teamVelocity,
  );

  const taskBreakdown = asArray(
    dashboard?.taskBreakdown,
  );

  const breakdown = asRecord(healthRecord?.breakdown);
  const liveMetrics = [
    { key: 'taskCompletionRate', label: 'Tasks completed', unit: '%' },
    { key: 'overdueTaskRate', label: 'Tasks overdue', unit: '%' },
    { key: 'documentIndexRate', label: 'Documents indexed', unit: '%' },
    { key: 'weeklyActiveUsers', label: 'Members signed in over 7 days', unit: '%' },
    { key: 'meetings30d', label: 'Meetings added over 30 days', unit: '' },
    { key: 'okrProgress', label: 'Current quarter objective progress', unit: '%' },
  ];
  const insights = asArray(
    insightsQuery.data?.insights,
  ).filter(
    (insight) =>
      typeof insight.title === 'string' &&
      typeof insight.description === 'string',
  );


  const taskStatusCounts = taskBreakdown.reduce(
    (
      accumulator: Record<string, number>,
      row,
    ) => {
      const status = row.status;
      const count = toFiniteNumber(row.count);
      if (typeof status !== 'string' || count === null || count < 0) return accumulator;

      accumulator[status] =
        (accumulator[status] ?? 0) + count;

      return accumulator;
    },
    {},
  );

  const updatedAt = dashboard?.generatedAt
    ? new Date(dashboard.generatedAt)
    : null;

  const updatedLabel =
    updatedAt &&
    Number.isFinite(updatedAt.getTime())
      ? `Updated ${updatedAt.toLocaleString()}`
      : 'Awaiting data refresh';

  const submitObjective = () => {
    const title = newOkrTitle.trim();

    if (title && !createOkr.isPending) {
      createOkr.mutate(title);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      {canCreateGoal && <dialog ref={goalDialog} id="create-goal-dialog" aria-labelledby="create-goal-title"
        className="m-auto w-[min(92vw,32rem)] rounded-2xl border border-violet-500/40 bg-card p-6 text-foreground shadow-2xl backdrop:bg-slate-950/80"
        onCancel={(event) => { if (createOkr.isPending) event.preventDefault(); }}>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submitObjective(); }}>
          <div><h2 id="create-goal-title" className="text-xl font-semibold">Create a goal</h2>
            <p className="mt-1 text-sm text-foreground/80">Add an objective for {dashboard?.quarter ?? 'the current quarter'} {dashboard?.year ?? ''}. You can add measurable key results after saving.</p></div>
          <label className="block text-sm font-medium">Goal title<input required maxLength={120} autoFocus value={newOkrTitle} onChange={event=>setNewOkrTitle(event.target.value)} placeholder="Improve customer retention" className="mt-1 block w-full rounded-lg border border-border bg-muted p-2.5" /></label>
          <label className="block text-sm font-medium">Description <span className="text-muted-foreground">(optional)</span><textarea rows={3} maxLength={2000} value={goalDescription} onChange={event=>setGoalDescription(event.target.value)} placeholder="What should change and why?" className="mt-1 block w-full rounded-lg border border-border bg-muted p-2.5" /></label>
          <label className="block text-sm font-medium">Target date <span className="text-muted-foreground">(optional)</span><input type="date" value={goalDeadline} onChange={event=>setGoalDeadline(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-muted p-2.5 [color-scheme:dark]" /></label>
          {createOkr.isError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{goalError(createOkr.error)}</p>}
          <div className="flex justify-end gap-2"><button type="button" disabled={createOkr.isPending} onClick={()=>{createOkr.reset();goalDialog.current?.close();}} className="rounded-lg border border-border px-3 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={!newOkrTitle.trim() || createOkr.isPending} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold hover:bg-violet-500 disabled:opacity-50">{createOkr.isPending ? 'Creating…' : 'Create goal'}</button></div>
        </form>
      </dialog>}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-500/10 p-2">
            <TrendingUp className="h-6 w-6 text-violet-600 dark:text-violet-400" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Founder OS
            </h1>

            <p className="text-sm text-muted-foreground">
              Business intelligence &amp; OKR command centre
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {canCreateGoal && <button id="create-goal" type="button" onClick={()=>goalDialog.current?.showModal()} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500"><Plus className="h-4 w-4" /> Create goal</button>}
          {canCreateGoal && <Link href="/agent-command?intent=goals" className="rounded-lg border border-border px-3 py-2 text-sm text-foreground/80 hover:border-violet-400">Draft with AI</Link>}
          <span>
            {dashboard?.quarter ?? '—'}{' '}
            {dashboard?.year ?? ''}
          </span>

          <span>{updatedLabel}</span>

          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Refresh dashboard"
            aria-label="Refresh dashboard"
            className="rounded-lg p-2 transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                isFetching ? 'animate-spin' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex h-64 items-center justify-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent"
            role="status"
            aria-label="Loading Founder OS dashboard"
          />
        </div>
      )}

      {/* API error */}
      {!isLoading && isError && (
        <section
          className="rounded-2xl border border-red-500/20 bg-card p-8 text-center"
          role="alert"
        >
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-600 dark:text-red-400" />

          <h2 className="font-semibold text-foreground">
            {dashboard ? 'Dashboard could not be refreshed' : 'Dashboard could not be loaded'}
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            {error?.message ??
              'Check that the API is running and your session is valid.'}
          </p>

          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm text-white transition hover:bg-violet-700"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </section>
      )}

      {!isLoading && <HealthRadar health={health} />}
      {dashboard && (
        <>
          {/* AI commentary: on request only */}
          {insights.length === 0 && toFiniteNumber(asRecord(dashboard?.healthScore)?.overall) !== null && (
            <section aria-label="AI commentary" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border-strong p-4">
              <div>
                <h2 className="text-sm font-medium">AI commentary</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Get AI suggestions based on your health score. Uses AI tokens, so it only runs when you ask.</p>
                {insightsQuery.isError && <p role="alert" className="mt-1 text-sm text-destructive">Could not generate commentary. Check the AI provider in Settings.</p>}
              </div>
              <button type="button" onClick={() => void insightsQuery.refetch()} disabled={insightsQuery.isFetching} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong px-3.5 text-sm font-medium hover:bg-muted disabled:opacity-60">
                {insightsQuery.isFetching ? 'Generating…' : 'Generate commentary'}
              </button>
            </section>
          )}
          {insights.length > 0 && (
            <section aria-label="AI commentary" className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <h2 className="text-sm font-medium text-muted-foreground md:col-span-3">AI commentary</h2>
              {insights.map((insight, index) => {
                const type = String(
                  insight.type ?? 'opportunity',
                );

                return (
                  <motion.div
                    key={`${String(insight.title)}-${index}`}
                    initial={{
                      opacity: 0,
                      y: 10,
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                    }}
                    transition={{
                      delay: index * 0.1,
                    }}
                    className={`rounded-xl border p-4 ${
                      type === 'strength'
                        ? 'border-emerald-500/20 bg-emerald-500/5'
                        : type === 'warning'
                          ? 'border-amber-500/20 bg-amber-500/5'
                          : 'border-violet-500/20 bg-violet-500/5'
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      {type === 'strength' ? (
                        <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : type === 'warning' ? (
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      ) : (
                        <Zap className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      )}

                      <span className="text-sm font-semibold text-foreground">
                        {String(insight.title)}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {String(insight.description)}
                    </p>
                  </motion.div>
                );
              })}
            </section>
          )}

          {/* OKRs */}
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-violet-600 dark:text-violet-400" />

                <h2 className="font-semibold text-foreground">
                  OKRs — {dashboard.quarter ?? '—'}{' '}
                  {dashboard.year ?? ''}
                </h2>

                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {dashboard.okrs === null ? 'Unavailable' : `${okrs.length} objectives`}
                </span>
              </div>

              {canCreateGoal && <button
                type="button"
                onClick={() => goalDialog.current?.showModal()}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white transition hover:bg-violet-700"
              >
                <Plus className="h-4 w-4" />
                Create goal
              </button>}
            </div>

            <div className="space-y-3">
              {dashboard.okrs === null ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Objectives could not be loaded.
                </p>
              ) : okrs.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Target className="mx-auto mb-3 h-10 w-10 opacity-30" />

                  <p>
                    No objectives for this quarter yet.
                  </p>

                  {canCreateGoal && <button
                    type="button"
                    onClick={() => goalDialog.current?.showModal()}
                    className="mt-3 text-sm text-violet-600 dark:text-violet-400 hover:text-violet-300"
                  >
                    Create your first goal →
                  </button>}
                </div>
              ) : (
                okrs.map((objective, index) => (
                  <div key={String(objective.id ?? index)} id={'objective-' + objective.id} className="scroll-mt-6">
                    <OkrCard obj={objective} />
                  </div>
                ))
              )}
            </div>
          </section>

          {/* KPI Snapshot and Team Velocity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* KPI Snapshot */}
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-violet-600 dark:text-violet-400" />

                <h2 className="font-semibold text-foreground">
                  Workspace KPIs
                </h2>
              </div>

              <dl className="grid grid-cols-2 gap-3">
                {liveMetrics.map(({ key, label, unit }) => {
                  const value = toFiniteNumber(breakdown?.[key]);
                  return (
                    <div key={key} className="rounded-lg border border-border p-3">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1 text-sm font-semibold text-foreground">
                        {value === null ? 'N/A' : `${formatMetricValue(value)}${unit}`}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <h3 id="recorded-kpis" className="mb-2 mt-5 scroll-mt-6 text-sm font-medium text-foreground/80">Recorded KPI snapshots</h3>
              {kpis.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {dashboard.kpis === null ? 'KPI snapshots could not be loaded.' : 'No KPI snapshots recorded in the last 30 days.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {kpis.slice(0, 6).map((kpi, index) => {
                    const current = toFiniteNumber(
                      kpi.today,
                    );

                    const previous = toFiniteNumber(
                      kpi.last_week,
                    );

                    const canCompare =
                      current !== null &&
                      previous !== null &&
                      previous !== 0;

                    const change = canCompare
                      ? ((current - previous) /
                          Math.abs(previous)) *
                        100
                      : null;

                    const metricKey = String(
                      kpi.metric_key ??
                        `metric-${index}`,
                    );

                    return (
                      <div
                        key={metricKey}
                        className="flex items-center gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium capitalize text-foreground">
                            {metricKey.replace(/_/g, ' ')}
                          </p>

                          <p className="text-xs text-muted-foreground">
                            Today:{' '}
                            {formatMetricValue(kpi.today)}
                          </p>

                          {kpi.today == null && (
                            <p className="text-xs text-muted-foreground/80">
                              No snapshot recorded today
                            </p>
                          )}
                        </div>

                        {change !== null && (
                          <span
                            className={`text-xs font-medium ${
                              change >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {change >= 0 ? '↑' : '↓'}{' '}
                            {Math.abs(change).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Team Velocity */}
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-2 flex items-center gap-2">
                <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />

                <h2 className="font-semibold text-foreground">
                  Team Velocity
                </h2>

                <span className="ml-auto text-xs text-muted-foreground">
                  Completed tasks / week
                </span>
              </div>

              <p className="mb-4 text-xs text-muted-foreground">
                Weekly task-completion trend over the last 12 weeks.
              </p>

              {velocitySeries.length === 0 ? (
                <div className="flex h-[220px] flex-col items-center justify-center text-center">
                  <BarChart2 className="mb-3 h-8 w-8 text-muted-foreground/80" />

                  <p className="text-sm text-muted-foreground">
                    {dashboard.teamVelocity === null ? 'Team velocity could not be loaded.' : 'No recent velocity data available.'}
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground/80">
                    Complete and update tasks to build your trend.
                  </p>
                </div>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={220}
                >
                  <AreaChart
                    data={velocitySeries}
                    margin={{
                      top: 12,
                      right: 12,
                      bottom: 4,
                      left: -12,
                    }}
                  >
                    <defs>
                      <linearGradient
                        id="founderVelocityGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#8b5cf6"
                          stopOpacity={0.38}
                        />

                        <stop
                          offset="95%"
                          stopColor="#8b5cf6"
                          stopOpacity={0.02}
                        />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      stroke="#374151"
                      strokeDasharray="3 3"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="week"
                      tickFormatter={formatWeekLabel}
                      interval={1}
                      tick={{
                        fill: '#9ca3af',
                        fontSize: 10,
                      }}
                      tickLine={false}
                      axisLine={{
                        stroke: '#374151',
                      }}
                      minTickGap={12}
                    />

                    <YAxis
                      allowDecimals={false}
                      domain={[0, 'auto']}
                      tick={{
                        fill: '#9ca3af',
                        fontSize: 11,
                      }}
                      tickLine={false}
                      axisLine={false}
                      width={38}
                    />

                    <Tooltip
                      labelFormatter={(value) => {
                        const date = new Date(
                          String(value),
                        );

                        if (
                          !Number.isFinite(date.getTime())
                        ) {
                          return String(value);
                        }

                        return `Week commencing ${date.toLocaleDateString(
                          'en-GB',
                          {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'UTC',
                          },
                        )}`;
                      }}
                      formatter={(value) => [
                        `${value} tasks`,
                        'Completed',
                      ]}
                      contentStyle={{
                        background: '#111827',
                        border: '1px solid #374151',
                        borderRadius: 10,
                        padding: '10px 12px',
                      }}
                      labelStyle={{
                        color: '#d1d5db',
                        marginBottom: 4,
                      }}
                      itemStyle={{
                        color: '#a78bfa',
                      }}
                      cursor={{
                        stroke: '#8b5cf6',
                        strokeDasharray: '4 4',
                      }}
                    />

                    <Area
                      type="monotone"
                      dataKey="completed"
                      name="Completed"
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      fill="url(#founderVelocityGradient)"
                      dot={false}
                      activeDot={{
                        r: 5,
                        fill: '#a78bfa',
                        stroke: '#111827',
                        strokeWidth: 2,
                      }}
                      connectNulls
                      isAnimationActive
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </section>
          </div>

          {/* Task Breakdown */}
          {dashboard.taskBreakdown === null && (
            <p className="text-sm text-muted-foreground">Task status breakdown could not be loaded.</p>
          )}
          {Object.keys(taskStatusCounts).length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-4 font-semibold text-foreground">
                Task Status Breakdown
              </h2>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Object.entries(taskStatusCounts).map(
                  ([status, count]) => (
                    <div
                      key={status}
                      className="text-center"
                    >
                      <p className="text-3xl font-bold text-foreground">
                        {count}
                      </p>

                      <p className="mt-1 text-xs capitalize text-muted-foreground">
                        {status.replace(/_/g, ' ')}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
