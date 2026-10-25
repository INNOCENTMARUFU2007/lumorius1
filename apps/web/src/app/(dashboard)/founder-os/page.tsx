
'use client';

import { useState } from 'react';
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
  PolarGrid,
  PolarAngleAxis,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import api from '@/lib/api';
import { toast } from 'sonner';

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
  aiInsights?: unknown;
}

interface VelocityPoint {
  week: string;
  completed: number;
  total?: number;
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

/**
 * Normalizes API data into 12 consecutive Monday-start weeks.
 *
 * Missing weeks inside a returned time series are filled with zero,
 * rather than being omitted and causing the chart to collapse to
 * a single point. It does not manufacture positive activity.
 */
function buildVelocitySeries(
  rows: DataRecord[],
): VelocityPoint[] {
  if (rows.length === 0) {
    return [];
  }

  const now = new Date();

  const currentWeekStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    ),
  );

  const daysSinceMonday =
    (currentWeekStart.getUTCDay() + 6) % 7;

  currentWeekStart.setUTCDate(
    currentWeekStart.getUTCDate() - daysSinceMonday,
  );

  currentWeekStart.setUTCHours(0, 0, 0, 0);

  const firstWeekStart = new Date(currentWeekStart);

  firstWeekStart.setUTCDate(
    firstWeekStart.getUTCDate() - 11 * 7,
  );

  const firstWeekKey = firstWeekStart
    .toISOString()
    .slice(0, 10);

  const currentWeekKey = currentWeekStart
    .toISOString()
    .slice(0, 10);

  const completedByWeek = new Map<string, number>();
  const totalByWeek = new Map<string, number>();

  for (const row of rows) {
    if (row.week == null) {
      continue;
    }

    const parsedDate = new Date(String(row.week));

    if (!Number.isFinite(parsedDate.getTime())) {
      continue;
    }

    const weekStart = new Date(
      Date.UTC(
        parsedDate.getUTCFullYear(),
        parsedDate.getUTCMonth(),
        parsedDate.getUTCDate(),
      ),
    );

    const daysFromMonday =
      (weekStart.getUTCDay() + 6) % 7;

    weekStart.setUTCDate(
      weekStart.getUTCDate() - daysFromMonday,
    );

    weekStart.setUTCHours(0, 0, 0, 0);

    const weekKey = weekStart.toISOString().slice(0, 10);

    if (
      weekKey < firstWeekKey ||
      weekKey > currentWeekKey
    ) {
      continue;
    }

    const completed =
      toFiniteNumber(row.completed) ?? 0;

    const total = toFiniteNumber(row.total);

    completedByWeek.set(
      weekKey,
      (completedByWeek.get(weekKey) ?? 0) + completed,
    );

    if (total !== null) {
      totalByWeek.set(
        weekKey,
        (totalByWeek.get(weekKey) ?? 0) + total,
      );
    }
  }

  // No usable dates means there is no trustworthy series to display.
  if (completedByWeek.size === 0) {
    return [];
  }

  return Array.from({ length: 12 }, (_, index) => {
    const weekStart = new Date(currentWeekStart);

    weekStart.setUTCDate(
      weekStart.getUTCDate() - (11 - index) * 7,
    );

    const weekKey = weekStart.toISOString().slice(0, 10);

    return {
      week: `${weekKey}T00:00:00.000Z`,
      completed: completedByWeek.get(weekKey) ?? 0,
      ...(totalByWeek.has(weekKey)
        ? { total: totalByWeek.get(weekKey) }
        : {}),
    };
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

// ── Health Score Ring ────────────────────────────────────────

function ScoreRing({
  score,
  label,
}: {
  score: NullableScore;
  label: string;
}) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;

  const hasScore =
    typeof score === 'number' &&
    Number.isFinite(score);

  const value = hasScore
    ? Math.min(100, Math.max(0, score))
    : 0;

  const dash = (value / 100) * circumference;

  const color = hasScore
    ? SCORE_COLOR(value)
    : '#6b7280';

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative h-24 w-24"
        aria-label={
          hasScore
            ? `${label} score: ${Math.round(value)} out of 100`
            : `${label} score unavailable`
        }
      >
        <svg
          className="h-24 w-24 -rotate-90"
          viewBox="0 0 96 96"
          aria-hidden="true"
        >
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke="#1f2937"
            strokeWidth="8"
          />

          {hasScore && (
            <circle
              cx="48"
              cy="48"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeLinecap="round"
              style={{
                transition:
                  'stroke-dasharray 0.6s ease',
              }}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-white">
            {hasScore ? Math.round(value) : 'N/A'}
          </span>
        </div>
      </div>

      <span className="text-center text-xs text-gray-400">
        {label}
      </span>
    </div>
  );
}

// ── OKRs ─────────────────────────────────────────────────────

const STATUS_MAP: Record<
  string,
  { label: string; color: string }
> = {
  on_track: {
    label: 'On Track',
    color: 'bg-emerald-500/20 text-emerald-400',
  },
  at_risk: {
    label: 'At Risk',
    color: 'bg-amber-500/20 text-amber-400',
  },
  behind: {
    label: 'Behind',
    color: 'bg-red-500/20 text-red-400',
  },
  completed: {
    label: 'Completed',
    color: 'bg-blue-500/20 text-blue-400',
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
    color: 'bg-gray-700 text-gray-300',
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
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
      {/* Objective header */}
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-gray-800/50"
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Target className="h-5 w-5 shrink-0 text-violet-400" />

          <div className="min-w-0">
            <p className="truncate font-semibold text-white">
              {String(obj.title ?? 'Untitled objective')}
            </p>

            <p className="mt-0.5 text-xs text-gray-400">
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

          <div className="hidden h-1.5 w-16 rounded-full bg-gray-800 sm:block">
            <div
              className="h-1.5 rounded-full bg-violet-500 transition-all"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>

          <span className="w-10 text-right text-xs text-gray-400">
            {progress === null
              ? 'N/A'
              : `${Math.round(progress)}%`}
          </span>

          <ChevronRight
            className={`h-4 w-4 text-gray-500 transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        </div>
      </button>

      {/* Expanded objective: Key Results */}
      {expanded && (
        <div className="space-y-4 border-t border-gray-800 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium text-white">
                Key Results
              </h3>

              <p className="mt-1 text-xs text-gray-500">
                {keyResults.length} key result
                {keyResults.length === 1 ? '' : 's'} attached
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddForm((previous) => !previous)}
              disabled={!objectiveId}
              className="inline-flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm font-medium text-violet-300 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {showAddForm ? 'Cancel' : 'Add Key Result'}
            </button>
          </div>

          {/* Add Key Result form */}
          {showAddForm && (
            <form
              className="space-y-4 rounded-xl border border-violet-500/20 bg-gray-950/60 p-4"
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
                  className="mb-1.5 block text-sm font-medium text-gray-300"
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
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-violet-500"
                  disabled={addKeyResult.isPending}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`kr-type-${objectiveId}`}
                    className="mb-1.5 block text-sm font-medium text-gray-300"
                  >
                    Measurement type
                  </label>

                  <select
                    id={`kr-type-${objectiveId}`}
                    value={metricType}
                    onChange={(event) =>
                      setMetricType(event.target.value)
                    }
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
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
                    className="mb-1.5 block text-sm font-medium text-gray-300"
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
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                    disabled={addKeyResult.isPending}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`kr-start-${objectiveId}`}
                    className="mb-1.5 block text-sm font-medium text-gray-300"
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
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                    disabled={addKeyResult.isPending}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`kr-target-${objectiveId}`}
                    className="mb-1.5 block text-sm font-medium text-gray-300"
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
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500"
                    disabled={addKeyResult.isPending}
                  />
                </div>
              </div>

              <p className="text-xs leading-relaxed text-gray-500">
                Progress starts from your starting value and is
                measured against the target. You can update the
                current value later.
              </p>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="rounded-lg px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-800"
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
            <div className="rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center">
              <Target className="mx-auto mb-2 h-7 w-7 text-gray-600" />

              <p className="text-sm font-medium text-gray-300">
                No Key Results yet
              </p>

              <p className="mt-1 text-xs text-gray-500">
                This Objective is valid without Key Results.
                Add measurable outcomes whenever you are ready.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {keyResults.map((keyResult, index) => {
                const krProgress = getProgress(keyResult);
                const current = keyResult.current_value;
                const target = keyResult.target_value;
                const unit = String(keyResult.unit ?? '');

                return (
                  <div
                    key={String(keyResult.id ?? index)}
                    className="rounded-lg border border-gray-800 bg-gray-900/70 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-400" />

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-200">
                          {String(
                            keyResult.title ??
                              'Untitled Key Result',
                          )}
                        </p>

                        <div className="mt-2 flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
                            <div
                              className="h-full rounded-full bg-violet-500 transition-all"
                              style={{
                                width: `${krProgress ?? 0}%`,
                              }}
                            />
                          </div>

                          <span className="w-12 text-right text-xs font-medium text-gray-400">
                            {krProgress === null
                              ? 'N/A'
                              : `${Math.round(krProgress)}%`}
                          </span>
                        </div>

                        <p className="mt-2 text-xs text-gray-500">
                          {formatMetricValue(current)} /{' '}
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

export default function FounderOsPage() {
  const queryClient = useQueryClient();

  const [showNewOkr, setShowNewOkr] = useState(false);
  const [newOkrTitle, setNewOkrTitle] = useState('');

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
          quarter,
          year: new Date().getFullYear(),
        },
      );

      return unwrapApiData(response.data);
    },

    onSuccess: async () => {
      toast.success(
        'Objective created successfully.',
      );

      setShowNewOkr(false);
      setNewOkrTitle('');

      await queryClient.invalidateQueries({
        queryKey: ['founder-os'],
      });
    },

    onError: (mutationError: unknown) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : 'Failed to create the objective.',
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

  const insightRecord = asRecord(
    dashboard?.aiInsights,
  );

  const insights = asArray(
    insightRecord?.insights,
  ).filter(
    (insight) =>
      typeof insight.title === 'string' &&
      typeof insight.description === 'string',
  );

  // Keep the complete radar polygon whenever all four scores exist.
  const allRadarCategories: Array<{
    subject: string;
    A: NullableScore;
  }> = [
    { subject: 'Financial', A: health.financial },
    { subject: 'Growth', A: health.growth },
    { subject: 'Team', A: health.team },
    { subject: 'Product', A: health.product },
  ];

  const radarData = allRadarCategories.filter(
    (
      item,
    ): item is {
      subject: string;
      A: number;
    } =>
      item.A !== null &&
      Number.isFinite(item.A),
  );

  const hasCompleteRadarData =
    radarData.length === allRadarCategories.length;

  const taskStatusCounts = taskBreakdown.reduce(
    (
      accumulator: Record<string, number>,
      row,
    ) => {
      const status = String(
        row.status ?? 'unknown',
      );

      const count =
        toFiniteNumber(row.count) ?? 0;

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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-violet-500/10 p-2">
            <TrendingUp className="h-6 w-6 text-violet-400" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white">
              Founder OS
            </h1>

            <p className="text-sm text-gray-400">
              Business intelligence &amp; OKR command centre
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
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
            className="rounded-lg p-2 transition hover:bg-gray-800 disabled:opacity-50"
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
          className="rounded-2xl border border-red-500/20 bg-gray-900 p-8 text-center"
          role="alert"
        >
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />

          <h2 className="font-semibold text-white">
            Dashboard could not be loaded
          </h2>

          <p className="mt-2 text-sm text-gray-400">
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

      {/* Dashboard */}
      {!isLoading && !isError && dashboard && (
        <>
          {/* Business Health Score */}
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <div className="mb-6 flex items-center gap-2">
              <Activity className="h-5 w-5 text-violet-400" />

              <h2 className="font-semibold text-white">
                Business Health Score
              </h2>

              <span
                className="ml-auto text-2xl font-black"
                style={{
                  color:
                    health.overall !== null
                      ? SCORE_COLOR(health.overall)
                      : '#6b7280',
                }}
              >
                {health.overall !== null
                  ? `${health.overall}/100`
                  : 'N/A'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              {/* Four-category radar */}
              <div className="lg:col-span-2">
                {hasCompleteRadarData ? (
                  <ResponsiveContainer
                    width="100%"
                    height={240}
                  >
                    <RadarChart
                      data={radarData}
                      outerRadius="72%"
                    >
                      <PolarGrid
                        gridType="polygon"
                        stroke="#374151"
                      />

                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{
                          fill: '#9ca3af',
                          fontSize: 12,
                        }}
                      />

                      <Radar
                        name="Health Score"
                        dataKey="A"
                        fill="#7c3aed"
                        fillOpacity={0.3}
                        stroke="#8b5cf6"
                        strokeWidth={2.5}
                        dot={{
                          r: 4,
                          fill: '#a78bfa',
                          stroke: '#7c3aed',
                          strokeWidth: 1,
                        }}
                        isAnimationActive
                      />

                      <Tooltip
                        formatter={(value) => [
                          `${value}/100`,
                          'Health Score',
                        ]}
                        contentStyle={{
                          background: '#111827',
                          border: '1px solid #374151',
                          borderRadius: 8,
                        }}
                        labelStyle={{
                          color: '#d1d5db',
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-700 px-4 text-center">
                    <Activity className="mb-3 h-8 w-8 text-violet-400" />

                    <p className="font-medium text-gray-300">
                      Health radar is incomplete
                    </p>

                    <p className="mt-2 text-sm text-gray-500">
                      {radarData.length} of{' '}
                      {allRadarCategories.length}{' '}
                      health categories have measured scores.
                    </p>

                    <p className="mt-1 text-xs text-gray-600">
                      The complete polygon will appear when
                      all four categories have available data.
                    </p>
                  </div>
                )}
              </div>

              {/* Individual scores */}
              <div className="grid grid-cols-2 items-center gap-4 sm:grid-cols-4 lg:col-span-3 lg:grid-cols-2 xl:grid-cols-4">
                <ScoreRing
                  score={health.financial}
                  label="Financial"
                />

                <ScoreRing
                  score={health.growth}
                  label="Growth"
                />

                <ScoreRing
                  score={health.team}
                  label="Team"
                />

                <ScoreRing
                  score={health.product}
                  label="Product"
                />
              </div>
            </div>

            {health.financial === null && (
              <p className="mt-4 border-t border-gray-800 pt-4 text-xs text-gray-500">
                Financial health is unavailable because revenue
                data has not been integrated.
              </p>
            )}
          </section>

          {/* AI Insights */}
          {insights.length > 0 && (
            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                        <CheckCircle className="h-4 w-4 text-emerald-400" />
                      ) : type === 'warning' ? (
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                      ) : (
                        <Zap className="h-4 w-4 text-violet-400" />
                      )}

                      <span className="text-sm font-semibold text-white">
                        {String(insight.title)}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed text-gray-400">
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
                <Target className="h-5 w-5 text-violet-400" />

                <h2 className="font-semibold text-white">
                  OKRs — {dashboard.quarter ?? '—'}{' '}
                  {dashboard.year ?? ''}
                </h2>

                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
                  {okrs.length} objectives
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowNewOkr((previous) => !previous)
                }
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white transition hover:bg-violet-700"
              >
                <Plus className="h-4 w-4" />
                New Objective
              </button>
            </div>

            {showNewOkr && (
              <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
                  placeholder="Objective title..."
                  value={newOkrTitle}
                  onChange={(event) =>
                    setNewOkrTitle(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submitObjective();
                    }
                  }}
                  disabled={createOkr.isPending}
                  autoFocus
                />

                <button
                  type="button"
                  onClick={submitObjective}
                  disabled={
                    !newOkrTitle.trim() ||
                    createOkr.isPending
                  }
                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-gray-700"
                >
                  {createOkr.isPending
                    ? 'Creating…'
                    : 'Create'}
                </button>
              </div>
            )}

            <div className="space-y-3">
              {okrs.length === 0 ? (
                <div className="py-12 text-center text-gray-500">
                  <Target className="mx-auto mb-3 h-10 w-10 opacity-30" />

                  <p>
                    No objectives for this quarter yet.
                  </p>

                  <button
                    type="button"
                    onClick={() => setShowNewOkr(true)}
                    className="mt-3 text-sm text-violet-400 hover:text-violet-300"
                  >
                    Create your first objective →
                  </button>
                </div>
              ) : (
                okrs.map((objective, index) => (
                  <OkrCard
                    key={String(
                      objective.id ?? index,
                    )}
                    obj={objective}
                  />
                ))
              )}
            </div>
          </section>

          {/* KPI Snapshot and Team Velocity */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* KPI Snapshot */}
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-violet-400" />

                <h2 className="font-semibold text-white">
                  KPI Snapshot
                </h2>
              </div>

              {kpis.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No KPI data recorded yet.
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
                          <p className="truncate text-sm font-medium capitalize text-white">
                            {metricKey.replace(/_/g, ' ')}
                          </p>

                          <p className="text-xs text-gray-500">
                            Today:{' '}
                            {formatMetricValue(kpi.today)}
                          </p>

                          {kpi.today == null && (
                            <p className="text-xs text-gray-600">
                              No snapshot recorded today
                            </p>
                          )}
                        </div>

                        {change !== null && (
                          <span
                            className={`text-xs font-medium ${
                              change >= 0
                                ? 'text-emerald-400'
                                : 'text-red-400'
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
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-2 flex items-center gap-2">
                <Users className="h-5 w-5 text-violet-400" />

                <h2 className="font-semibold text-white">
                  Team Velocity
                </h2>

                <span className="ml-auto text-xs text-gray-500">
                  Completed tasks / week
                </span>
              </div>

              <p className="mb-4 text-xs text-gray-500">
                Weekly task-completion trend over the last 12 weeks.
              </p>

              {velocitySeries.length === 0 ? (
                <div className="flex h-[220px] flex-col items-center justify-center text-center">
                  <BarChart2 className="mb-3 h-8 w-8 text-gray-600" />

                  <p className="text-sm text-gray-400">
                    No recent velocity data available.
                  </p>

                  <p className="mt-1 text-xs text-gray-600">
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
          {Object.keys(taskStatusCounts).length > 0 && (
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="mb-4 font-semibold text-white">
                Task Status Breakdown
              </h2>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {Object.entries(taskStatusCounts).map(
                  ([status, count]) => (
                    <div
                      key={status}
                      className="text-center"
                    >
                      <p className="text-3xl font-bold text-white">
                        {count}
                      </p>

                      <p className="mt-1 text-xs capitalize text-gray-400">
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
