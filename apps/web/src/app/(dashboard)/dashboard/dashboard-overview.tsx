'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Mic,
  Ratio,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '@/lib/api';
import { formatRelative } from '@/lib/utils';

interface TaskStats {
  total?: string | number;
  completed?: string | number;
  in_progress?: string | number;
  todo?: string | number;
  urgent_open?: string | number;
  overdue?: string | number;
  completed_period?: string | number;
  completed_previous_period?: string | number;
  completion_trend?: Array<{
    date: string;
    value: string | number;
  }>;
}

interface DashboardResponse {
  summary?: {
    tasks?: TaskStats;
    documents?: {
      total?: string | number;
      indexed?: string | number;
      processing?: string | number;
      failed?: string | number;
      uploading?: string | number;
    };
    meetings?: {
      this_month?: string | number;
    };
  };
  urgentTasks?: Array<{
    id: string;
    title: string;
    priority: string;
    due_date?: string | null;
  }>;
  generatedAt?: string;
}

interface TeamDashboardResponse {
  members: Array<Record<string, unknown>>;
  tasksByStatus: Array<{
    status: string;
    count: string | number;
  }>;
  meetingsByWeek: Array<Record<string, unknown>>;
}

type MetricDefinition = {
  label: string;
  value: string;
  note: string;
  detail: string;
  icon: LucideIcon;
  available: boolean;
};

/**
 * Supports API responses shaped as either:
 * { data: { ...payload } }
 * or:
 * { ...payload }
 */
function unwrapApiResponse(response: unknown): unknown {
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const body = response as {
    data?: unknown;
  };

  const payload = body.data;

  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'data' in payload
  ) {
    return (payload as { data?: unknown }).data;
  }

  return payload;
}

function number(value: string | number | undefined): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function MetricCard({ metric }: { metric: MetricDefinition }) {
  const Icon = metric.icon;

  return (
    <article
      title={metric.detail}
      className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">
            {metric.label}
          </p>
          <p
            className={`mt-2 truncate font-semibold tracking-tight ${
              metric.available
                ? 'text-2xl text-foreground'
                : 'text-sm text-muted-foreground'
            }`}
          >
            {metric.value}
          </p>
        </div>

        <span
          className={`rounded-lg p-2 ${
            metric.available
              ? 'bg-brand-500/10 text-brand-500'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
        {metric.note}
      </p>
    </article>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-lg border border-dashed border-border px-5 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export default function DashboardOverview() {
  const [days, setDays] = useState(30);

  const {
    data,
    isLoading,
    isError,
  } = useQuery<DashboardResponse>({
    queryKey: ['analytics', 'founder-dashboard', days],

    queryFn: async (): Promise<DashboardResponse> => {
      const response = await api.get('/analytics/founder-dashboard', {
        params: { days },
      });

      const payload = unwrapApiResponse(response);

      if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload)
      ) {
        throw new Error(
          'The founder dashboard API returned an invalid response.',
        );
      }

      return payload as DashboardResponse;
    },
  });

  const {
    data: team,
    isLoading: teamLoading,
    isError: teamError,
  } = useQuery<TeamDashboardResponse>({
    queryKey: ['analytics', 'team-dashboard'],

    queryFn: async (): Promise<TeamDashboardResponse> => {
      const response = await api.get('/analytics/team-dashboard');
      const payload = unwrapApiResponse(response);

      if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload)
      ) {
        throw new Error(
          'The team dashboard API returned an invalid response.',
        );
      }

      const result = payload as Record<string, unknown>;

      return {
        members: Array.isArray(result.members)
          ? (result.members as Array<Record<string, unknown>>)
          : [],

        tasksByStatus: Array.isArray(result.tasksByStatus)
          ? result.tasksByStatus.filter(
              (row): row is { status: string; count: string | number } =>
                Boolean(
                  row &&
                    typeof row === 'object' &&
                    typeof (row as Record<string, unknown>).status === 'string' &&
                    (
                      typeof (row as Record<string, unknown>).count === 'number' ||
                      typeof (row as Record<string, unknown>).count === 'string'
                    ),
                ),
            )
          : [],

        meetingsByWeek: Array.isArray(result.meetingsByWeek)
          ? (result.meetingsByWeek as Array<Record<string, unknown>>)
          : [],
      };
    },
  });

  const tasks = data?.summary?.tasks;
  const documents = data?.summary?.documents;
  const meetings = data?.summary?.meetings;

  const taskCount = number(tasks?.completed_period);
  const meetingCount = number(meetings?.this_month);
  const indexedCount = number(documents?.indexed);

  const trend = useMemo(
    () =>
      (tasks?.completion_trend ?? []).map((point) => ({
        ...point,
        value: Number(point.value),
        label: new Date(`${point.date}T12:00:00`).toLocaleDateString(
          undefined,
          { month: 'short', day: 'numeric' },
        ),
      })),
    [tasks?.completion_trend],
  );

  const previous = number(tasks?.completed_previous_period);
  const current = taskCount;

  const hasSignal =
    previous !== null &&
    current !== null &&
    previous >= 3 &&
    Math.abs(current - previous) / previous >= 0.5;

  const changePercent =
    hasSignal && previous
      ? Math.round(((current! - previous) / previous) * 100)
      : 0;

  const metrics: MetricDefinition[] = [
    {
      label: 'Total Revenue',
      value: 'Unavailable',
      note: 'No company revenue feed configured',
      detail:
        'Lumorius billing records describe the app subscription, not your company revenue. No verified revenue source is available.',
      icon: CircleDollarSign,
      available: false,
    },
    {
      label: 'Churn Rate',
      value: 'Unavailable',
      note: 'No customer subscription history',
      detail:
        'A verified customer churn calculation needs historical customer subscription events; that dataset is not available here.',
      icon: ArrowDownRight,
      available: false,
    },
    {
      label: 'MRR',
      value: 'Unavailable',
      note: 'No company recurring-revenue data',
      detail:
        'MRR requires the company’s active customer subscriptions and recurring amounts. The Lumorius plan subscription is not company revenue.',
      icon: CircleDollarSign,
      available: false,
    },
    {
      label: 'ARR',
      value: 'Unavailable',
      note: 'Requires validated MRR',
      detail:
        'ARR is derived from validated recurring company revenue. That source is not configured.',
      icon: Activity,
      available: false,
    },
    {
      label: 'CAC',
      value: 'Unavailable',
      note: 'Spend and acquisition data missing',
      detail:
        'CAC requires acquisition spend and newly acquired customers for the same period.',
      icon: Users,
      available: false,
    },
    {
      label: 'LTV:CAC',
      value: 'Unavailable',
      note: 'Validated LTV and CAC required',
      detail:
        'This ratio needs validated lifetime value and customer acquisition cost inputs.',
      icon: Ratio,
      available: false,
    },
    {
      label: 'Documents Indexed',
      value: isLoading
        ? '—'
        : indexedCount === null
          ? 'Unavailable'
          : indexedCount.toLocaleString(),
      note: 'Successfully indexed documents',
      detail:
        'Counts documents whose indexing status is indexed, not uploads still processing.',
      icon: Brain,
      available: indexedCount !== null,
    },
    {
      label: 'Meetings This Month',
      value: isLoading
        ? '—'
        : meetingCount === null
          ? 'Unavailable'
          : meetingCount.toLocaleString(),
      note: 'Current month in your account timezone',
      detail:
        'Counts meeting records by scheduled time, then completion time, then creation time, using your configured timezone.',
      icon: Mic,
      available: meetingCount !== null,
    },
    {
      label: 'Tasks Completed',
      value: isLoading
        ? '—'
        : taskCount === null
          ? 'Unavailable'
          : taskCount.toLocaleString(),
      note: `Selected period · last ${days} days`,
      detail:
        'Counts tasks with status done and a completed_at timestamp in the selected calendar-day range.',
      icon: CheckCircle2,
      available: taskCount !== null,
    },
    {
      label: 'AI Usage',
      value: 'Unavailable',
      note: 'Usage telemetry is not exposed',
      detail:
        'The current AI chat flow does not expose verified token, provider-call, or product-credit usage to this dashboard.',
      icon: FileText,
      available: false,
    },
  ];

  const statusRows = (team?.tasksByStatus ?? []).map((row) => ({
    status: row.status.replace(/_/g, ' '),
    count: Number(row.count),
  }));

  const statusTotal = statusRows.reduce(
    (sum, row) => sum + row.count,
    0,
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-500">
            Lumorius overview
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            Executive dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live operational metrics, with unavailable data called out clearly.
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          Task period
          <select
            aria-label="Task completion period"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
      </div>

      {isError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          Dashboard data could not be loaded. Values are left blank rather than shown as zero.
        </div>
      )}

      <section
        aria-label="Key performance indicators"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"
      >
        {metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.9fr)]">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">
                Task completions
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Daily completed tasks · last {days} days
              </p>
            </div>

            <span className="rounded-md bg-brand-500/10 px-2.5 py-1 text-xs font-medium text-brand-500">
              Tasks
            </span>
          </div>

          {isLoading ? (
            <div className="h-[270px] animate-pulse rounded-lg bg-muted/60" />
          ) : trend.length > 0 ? (
            <div className="h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trend}
                  margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
                >
                  <defs>
                    <linearGradient
                      id="taskCompletionFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#f59e0b"
                        stopOpacity={0.26}
                      />
                      <stop
                        offset="95%"
                        stopColor="#f59e0b"
                        stopOpacity={0.01}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    stroke="hsl(var(--border))"
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />

                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />

                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value) => [`${value} completed`, 'Tasks']}
                  />

                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="url(#taskCompletionFill)"
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyPanel>
              Task completion history is unavailable for this period.
            </EmptyPanel>
          )}
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <div>
              <h2 className="font-semibold text-foreground">
                Operational signal
              </h2>
              <p className="text-xs text-muted-foreground">
                Deterministic task-completion comparison
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="h-44 animate-pulse rounded-lg bg-muted/60" />
          ) : hasSignal ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2">
                {changePercent >= 0 ? (
                  <ArrowUpRight className="h-4 w-4 text-amber-500" />
                ) : (
                  <ArrowDownRight className="h-4 w-4 text-amber-500" />
                )}

                <p className="text-sm font-semibold text-foreground">
                  Task completions {changePercent >= 0 ? 'increased' : 'decreased'}{' '}
                  {Math.abs(changePercent)}%
                </p>
              </div>

              <p className="mt-2 text-sm text-muted-foreground">
                {current} completed in the last {days} days, compared with{' '}
                {previous} in the preceding {days} days.
              </p>

              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                Rule: at least a 50% change, with at least 3 completions in the
                prior window. No confidence score is inferred.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">
                No signal met the comparison rule.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                The panel compares completed tasks with the preceding {days}-day
                window and requires a 50% change plus a baseline of 3 tasks.
              </p>
            </div>
          )}

          <p className="mt-4 text-[11px] leading-4 text-muted-foreground">
            This is a simple activity threshold, not a predictive anomaly model.
          </p>
        </article>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <article className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">Task status</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Organization-wide task distribution
              </p>
            </div>

            <Link
              href="/tasks"
              className="text-xs font-medium text-brand-500 hover:underline"
            >
              Open tasks
            </Link>
          </div>

          {teamLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted/60" />
          ) : teamError ? (
            <EmptyPanel>Task status data could not be loaded.</EmptyPanel>
          ) : statusRows.length === 0 ? (
            <EmptyPanel>No task status data yet.</EmptyPanel>
          ) : (
            <div className="space-y-4">
              {statusRows.map((row) => (
                <div key={row.status}>
                  <div className="mb-1.5 flex justify-between gap-3 text-xs">
                    <span className="capitalize text-muted-foreground">
                      {row.status}
                    </span>
                    <span className="font-medium tabular-nums text-foreground">
                      {row.count.toLocaleString()}
                    </span>
                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{
                        width: `${
                          statusTotal
                            ? (row.count / statusTotal) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">
                Document indexing
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Processing state from Company Brain
              </p>
            </div>

            <Link
              href="/brain"
              className="text-xs font-medium text-brand-500 hover:underline"
            >
              Open library
            </Link>
          </div>

          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted/60" />
          ) : documents ? (
            <div className="space-y-3">
              {[
                ['Indexed', documents.indexed],
                ['Processing', documents.processing],
                ['Uploading', documents.uploading],
                ['Failed', documents.failed],
              ].map(([label, value]) => (
                <div
                  key={label as string}
                  className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2.5"
                >
                  <span className="text-sm text-muted-foreground">
                    {label}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {number(value as string | number)?.toLocaleString() ?? '—'}
                  </span>
                </div>
              ))}

              <p className="pt-1 text-[11px] text-muted-foreground">
                {number(documents.total)?.toLocaleString() ?? '—'} total
                documents recorded.
              </p>
            </div>
          ) : (
            <EmptyPanel>
              Document indexing metrics are unavailable.
            </EmptyPanel>
          )}
        </article>

        <article className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">
                Priority work
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Urgent and near-due open tasks
              </p>
            </div>

            <Link
              href="/tasks"
              className="text-xs font-medium text-brand-500 hover:underline"
            >
              View all
            </Link>
          </div>

          {isLoading ? (
            <div className="h-40 animate-pulse rounded-lg bg-muted/60" />
          ) : data?.urgentTasks?.length ? (
            <div className="space-y-2">
              {data.urgentTasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      task.priority === 'urgent'
                        ? 'bg-red-500'
                        : 'bg-amber-500'
                    }`}
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {task.title}
                    </span>

                    <span className="mt-1 block text-xs capitalize text-muted-foreground">
                      {task.priority}
                      {task.due_date
                        ? ` · due ${formatRelative(task.due_date)}`
                        : ''}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel>No urgent or near-due tasks.</EmptyPanel>
          )}
        </article>
      </section>

      {data?.generatedAt && (
        <p className="text-right text-[11px] text-muted-foreground">
          Metrics refreshed {formatRelative(data.generatedAt)}
        </p>
      )}
    </div>
  );
}