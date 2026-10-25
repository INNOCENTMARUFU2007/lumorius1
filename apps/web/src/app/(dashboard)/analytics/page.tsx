
'use client';

import { useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  TrendingUp,
  Users,
  Target,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  FileText,
  CalendarDays,
  RefreshCw,
  Loader2,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import api from '@/lib/api';
import { toast } from 'sonner';

type DataRecord = Record<string, unknown>;

type TrendPoint = {
  date: string;
  label: string;
  value: number;
};

type TeamMemberPoint = {
  name: string;
  tasksCompleted: number;
  openTasks: number;
};

type StatusPoint = {
  status: string;
  count: number;
};

type DashboardData = DataRecord & {
  summary?: DataRecord;
  goals?: unknown[];
  urgentTasks?: unknown[];
  risks?: unknown[];
  opportunities?: unknown[];
};

type KpiHistoryPoint = {
  date: string;
  label: string;
  value: number;
  timestamp: number;
};

type MetricCardProps = {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  iconClass: string;
};

function isRecord(value: unknown): value is DataRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function asRecord(value: unknown): DataRecord {
  return isRecord(value) ? value : {};
}

function asRecords(value: unknown): DataRecord[] {
  return Array.isArray(value)
    ? value.filter(isRecord)
    : [];
}

function unwrapResponse(value: unknown): unknown {
  let current = value;

  for (let depth = 0; depth < 5; depth += 1) {
    if (
      isRecord(current) &&
      Object.prototype.hasOwnProperty.call(current, 'data')
    ) {
      current = current.data;
    } else {
      break;
    }
  }

  return current;
}

function toNumber(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function countValue(record: DataRecord, key: string): number {
  return toNumber(record[key]) ?? 0;
}

function textValue(
  value: unknown,
  fallback = '—',
): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateLabel(value: unknown): string {
  const raw = textValue(value, '');

  if (!raw) return '—';

  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? `${raw}T12:00:00`
      : raw,
  );

  if (!Number.isFinite(date.getTime())) {
    return raw.slice(0, 10);
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function formatFullDate(value: unknown): string {
  const raw = textValue(value, '');

  if (!raw) return 'Date unavailable';

  const date = new Date(raw);

  if (!Number.isFinite(date.getTime())) {
    return raw.slice(0, 10);
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatUnit(
  value: number,
  unit: string,
): string {
  const formatted = formatNumber(value);

  if (!unit) return formatted;
  if (unit === '%') return `${formatted}%`;

  return `${formatted} ${unit}`;
}

function readableStatus(value: unknown): string {
  return textValue(value, 'Unknown')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

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

  return fallback;
}

function normalizeTrend(value: unknown): TrendPoint[] {
  return asRecords(value)
    .map((point) => {
      const rawDate = textValue(point.date, '');
      const number = toNumber(point.value);

      return {
        date: rawDate,
        label: formatDateLabel(rawDate),
        value: number,
      };
    })
    .filter(
      (
        point,
      ): point is TrendPoint =>
        point.date.length > 0 && point.value !== null,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeKpiHistory(
  value: unknown,
): KpiHistoryPoint[] {
  return asRecords(value)
    .map((point) => {
      const rawDate = textValue(
        point.date,
        textValue(point.recorded_at, ''),
      );

      const valueNumber = toNumber(point.value);

      const parsedDate = new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
          ? `${rawDate}T12:00:00`
          : rawDate,
      );

      return {
        date: rawDate,
        label: formatDateLabel(rawDate),
        value: valueNumber,
        timestamp: Number.isFinite(parsedDate.getTime())
          ? parsedDate.getTime()
          : 0,
      };
    })
    .filter(
      (
        point,
      ): point is KpiHistoryPoint =>
        point.date.length > 0 && point.value !== null,
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  iconClass,
}: MetricCardProps) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{title}</p>

        <div className={`rounded-lg p-2 ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-3 break-words text-2xl font-bold tabular-nums text-foreground">
        {value}
      </p>

      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function EmptyChart({
  message,
}: {
  message: string;
}) {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center rounded-lg bg-muted/30 px-5 text-center">
      <div>
        <Activity className="mx-auto h-7 w-7 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">
          {message}
        </p>
      </div>
    </div>
  );
}

function ChartTooltipStyle() {
  return null;
}

export default function AnalyticsPage() {
  const dashboardQuery = useQuery<DashboardData, Error>({
    queryKey: ['analytics', 'founder-dashboard'],
    queryFn: async () => {
      const response = await api.get<unknown>(
        '/analytics/founder-dashboard',
      );

      const payload = unwrapResponse(response.data);

      if (!isRecord(payload)) {
        throw new Error(
          'The analytics API returned an unexpected dashboard response.',
        );
      }

      return payload as DashboardData;
    },
    retry: 1,
  });

  const teamQuery = useQuery<DataRecord, Error>({
    queryKey: ['analytics', 'team'],
    queryFn: async () => {
      const response = await api.get<unknown>(
        '/analytics/team-dashboard',
      );

      const payload = unwrapResponse(response.data);

      if (!isRecord(payload)) {
        throw new Error(
          'The team analytics API returned an unexpected response.',
        );
      }

      return payload;
    },
    retry: 1,
  });

  const kpiQuery = useQuery<DataRecord[], Error>({
    queryKey: ['analytics', 'kpis'],
    queryFn: async () => {
      const response = await api.get<unknown>(
        '/analytics/kpis',
      );

      const payload = unwrapResponse(response.data);

      if (Array.isArray(payload)) {
        return payload.filter(isRecord);
      }

      if (isRecord(payload) && Array.isArray(payload.kpis)) {
        return asRecords(payload.kpis);
      }

      throw new Error(
        'The KPI API returned an unexpected response.',
      );
    },
    retry: 1,
  });

  const weeklyReportMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<unknown>(
        '/analytics/reports/weekly',
      );

      return unwrapResponse(response.data);
    },

    onSuccess: (payload) => {
      const content =
        isRecord(payload) &&
        typeof payload.content === 'string'
          ? payload.content
          : '';

      if (!content.trim()) {
        toast.error(
          'The report was generated without downloadable content.',
        );
        return;
      }

      const blob = new Blob([content], {
        type: 'text/markdown;charset=utf-8',
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = `lumorius-weekly-report-${new Date()
        .toISOString()
        .slice(0, 10)}.md`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast.success('Weekly report generated.');
    },

    onError: (error: unknown) => {
      toast.error(
        getErrorMessage(
          error,
          'Failed to generate the weekly report. Check the AI provider settings.',
        ),
      );
    },
  });

  const dashboard = dashboardQuery.data;
  const team = teamQuery.data;
  const kpis = kpiQuery.data ?? [];

  const summary = asRecord(dashboard?.summary);
  const taskStats = asRecord(summary.tasks);
  const documentStats = asRecord(summary.documents);
  const meetingStats = asRecord(summary.meetings);

  const goals = asRecords(dashboard?.goals);
  const members = asRecords(team?.members);

  const rawCompletionTrend = taskStats.completion_trend;

  const completionTrend = useMemo(
    () => normalizeTrend(rawCompletionTrend),
    [rawCompletionTrend],
  );

  const statusChartData = useMemo((): StatusPoint[] => {
    return asRecords(team?.tasksByStatus)
      .map((item) => ({
        status: readableStatus(item.status),
        count: toNumber(item.count) ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [team?.tasksByStatus]);

  const memberChartData = useMemo((): TeamMemberPoint[] => {
    return members
      .map((member) => ({
        name: textValue(member.name, 'Unnamed member'),
        tasksCompleted:
          toNumber(member.tasks_completed_this_week) ?? 0,
        openTasks: toNumber(member.open_tasks) ?? 0,
      }))
      .sort(
        (a, b) =>
          b.tasksCompleted +
          b.openTasks -
          (a.tasksCompleted + a.openTasks),
      )
      .slice(0, 12);
  }, [members]);

  const totalTasks = countValue(taskStats, 'total');
  const completedTasks = countValue(taskStats, 'completed');
  const inProgressTasks = countValue(taskStats, 'in_progress');
  const todoTasks = countValue(taskStats, 'todo');
  const overdueTasks = countValue(taskStats, 'overdue');

  const completionRate =
    totalTasks > 0
      ? (completedTasks / totalTasks) * 100
      : null;

  const dashboardLoading =
    dashboardQuery.isLoading &&
    teamQuery.isLoading &&
    kpiQuery.isLoading;

  if (dashboardLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="h-16 animate-pulse rounded-xl bg-muted/50" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl border border-border bg-card"
            />
          ))}
        </div>

        <div className="h-[380px] animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-[320px] animate-pulse rounded-xl border border-border bg-card" />
      </div>
    );
  }

  if (dashboardQuery.isError) {
    return (
      <div className="mx-auto max-w-4xl rounded-xl border border-red-500/30 bg-card p-6">
        <h1 className="text-xl font-bold">
          Analytics could not be loaded
        </h1>

        <p role="alert" className="mt-2 text-sm text-red-500">
          {getErrorMessage(
            dashboardQuery.error,
            'The analytics dashboard request failed.',
          )}
        </p>

        <button
          type="button"
          onClick={() => void dashboardQuery.refetch()}
          className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-orange-500/10 p-3">
            <BarChart3 className="h-6 w-6 text-orange-500" />
          </div>

          <div>
            <h1 className="text-2xl font-bold">
              Analytics &amp; Founder OS
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Understand task progress, team activity and business performance.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void dashboardQuery.refetch();
              void teamQuery.refetch();
              void kpiQuery.refetch();
            }}
            disabled={
              dashboardQuery.isFetching ||
              teamQuery.isFetching ||
              kpiQuery.isFetching
            }
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                dashboardQuery.isFetching ||
                teamQuery.isFetching ||
                kpiQuery.isFetching
                  ? 'animate-spin'
                  : ''
              }`}
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => weeklyReportMutation.mutate()}
            disabled={weeklyReportMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {weeklyReportMutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}

            {weeklyReportMutation.isPending
              ? 'Generating report…'
              : 'Generate weekly report'}
          </button>
        </div>
      </div>

      {/* Summary metrics */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">
            Business overview
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Current counts returned by your organisation's analytics API.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Total tasks"
            value={formatNumber(totalTasks)}
            description="Tasks in the organisation"
            icon={Target}
            iconClass="bg-blue-500/10 text-blue-500"
          />

          <MetricCard
            title="Completed tasks"
            value={formatNumber(completedTasks)}
            description={
              completionRate === null
                ? 'No tasks recorded'
                : `${completionRate.toFixed(1)}% of all tasks`
            }
            icon={CheckCircle2}
            iconClass="bg-green-500/10 text-green-500"
          />

          <MetricCard
            title="In progress"
            value={formatNumber(inProgressTasks)}
            description="Tasks currently being worked on"
            icon={Clock3}
            iconClass="bg-indigo-500/10 text-indigo-500"
          />

          <MetricCard
            title="Overdue tasks"
            value={formatNumber(overdueTasks)}
            description="Uncompleted tasks past their due date"
            icon={AlertTriangle}
            iconClass="bg-red-500/10 text-red-500"
          />

          <MetricCard
            title="Indexed documents"
            value={`${formatNumber(countValue(documentStats, 'indexed'))} / ${formatNumber(countValue(documentStats, 'total'))}`}
            description={`${formatNumber(countValue(documentStats, 'uploaded_this_week'))} uploaded in the last 7 days`}
            icon={FileText}
            iconClass="bg-violet-500/10 text-violet-500"
          />

          <MetricCard
            title="Completed meetings"
            value={formatNumber(countValue(meetingStats, 'completed'))}
            description={`${formatNumber(countValue(meetingStats, 'last_30_days'))} meetings created in the last 30 days`}
            icon={CalendarDays}
            iconClass="bg-cyan-500/10 text-cyan-500"
          />

          <MetricCard
            title="Active goals"
            value={formatNumber(goals.length)}
            description="Goals returned with active status"
            icon={Target}
            iconClass="bg-orange-500/10 text-orange-500"
          />

          <MetricCard
            title="Tracked KPIs"
            value={formatNumber(kpis.length)}
            description="Metrics configured for this organisation"
            icon={TrendingUp}
            iconClass="bg-emerald-500/10 text-emerald-500"
          />
        </div>
      </section>

      {/* Daily completions and status distribution */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-border bg-card p-5 xl:col-span-2">
          <div className="mb-5">
            <h2 className="font-semibold">
              Daily task completion
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Number of tasks marked complete each day in the reporting period.
            </p>
          </div>

          <div className="h-[320px]">
            {completionTrend.length === 0 ? (
              <EmptyChart
                message="No daily completion history is available yet."
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={completionTrend}
                  margin={{
                    top: 8,
                    right: 16,
                    left: 6,
                    bottom: 24,
                  }}
                >
                  <defs>
                    <linearGradient
                      id="task-completion-gradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#6366f1"
                        stopOpacity={0.26}
                      />

                      <stop
                        offset="100%"
                        stopColor="#6366f1"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="currentColor"
                    strokeOpacity={0.12}
                  />

                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={18}
                    label={{
                      value: 'Date',
                      position: 'insideBottom',
                      offset: -14,
                      fontSize: 12,
                    }}
                  />

                  <YAxis
                    allowDecimals={false}
                    width={44}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    label={{
                      value: 'Tasks completed',
                      angle: -90,
                      position: 'insideLeft',
                      fontSize: 12,
                    }}
                  />

                  <Tooltip
                    labelFormatter={(label) => `Date: ${String(label)}`}
                    formatter={(value) => [
                      formatNumber(Number(value)),
                      'Completed tasks',
                    ]}
                    contentStyle={{
                      borderRadius: 10,
                      border: '1px solid #d1d5db',
                      fontSize: 12,
                    }}
                  />

                  <Area
                    type="monotone"
                    dataKey="value"
                    name="Completed tasks"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fill="url(#task-completion-gradient)"
                    activeDot={{ r: 5 }}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-border bg-card p-5">
          <div className="mb-5">
            <h2 className="font-semibold">
              Task status
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              How many tasks currently belong to each status.
            </p>
          </div>

          <div className="h-[320px]">
            {teamQuery.isError ? (
              <EmptyChart message="Task status data could not be loaded." />
            ) : teamQuery.isLoading ? (
              <EmptyChart message="Loading task status…" />
            ) : statusChartData.length === 0 ? (
              <EmptyChart message="No task status data is available." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={statusChartData}
                  layout="vertical"
                  margin={{
                    top: 8,
                    right: 14,
                    left: 4,
                    bottom: 24,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="currentColor"
                    strokeOpacity={0.12}
                  />

                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    label={{
                      value: 'Number of tasks',
                      position: 'insideBottom',
                      offset: -14,
                      fontSize: 11,
                    }}
                  />

                  <YAxis
                    type="category"
                    dataKey="status"
                    width={92}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />

                  <Tooltip
                    formatter={(value) => [
                      formatNumber(Number(value)),
                      'Tasks',
                    ]}
                    contentStyle={{
                      borderRadius: 10,
                      border: '1px solid #d1d5db',
                      fontSize: 12,
                    }}
                  />

                  <Bar
                    dataKey="count"
                    name="Tasks"
                    fill="#8b5cf6"
                    radius={[0, 5, 5, 0]}
                    maxBarSize={34}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* KPI history charts */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-500" />

            <h2 className="text-lg font-semibold">
              KPI performance
            </h2>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Each chart shows the recorded value of one KPI over time.
            The horizontal axis is the date; the vertical axis is the KPI value.
          </p>
        </div>

        {kpiQuery.isError ? (
          <p role="alert" className="text-sm text-red-500">
            {getErrorMessage(
              kpiQuery.error,
              'KPI metrics could not be loaded.',
            )}
          </p>
        ) : kpiQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-64 animate-pulse rounded-xl bg-muted/40"
              />
            ))}
          </div>
        ) : kpis.length === 0 ? (
          <div className="rounded-lg bg-muted/30 px-5 py-10 text-center">
            <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/50" />

            <p className="mt-3 font-medium">
              No KPI metrics configured
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Create a KPI and record values to see its performance history here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {kpis.slice(0, 8).map((kpi, index) => {
              const id = textValue(kpi.id, `kpi-${index}`);
              const name = textValue(kpi.name, 'Unnamed KPI');
              const unit = textValue(kpi.unit, '');

              const current = toNumber(kpi.current_value);
              const previous = toNumber(kpi.previous_value);

              const change =
                current !== null &&
                previous !== null &&
                previous !== 0
                  ? ((current - previous) / Math.abs(previous)) * 100
                  : null;

              const history = normalizeKpiHistory(kpi.history);

              return (
                <article
                  key={id}
                  className="min-w-0 rounded-xl border border-border p-4"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-medium text-muted-foreground">
                        {name}
                      </h3>

                      <p className="mt-1 break-words text-2xl font-bold">
                        {current === null
                          ? 'Not recorded'
                          : formatUnit(current, unit)}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        Current recorded value
                      </p>
                    </div>

                    <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
                      {previous === null ? (
                        <span className="text-muted-foreground">
                          No previous value
                        </span>
                      ) : (
                        <span>
                          Previous: {formatUnit(previous, unit)}
                        </span>
                      )}

                      {change !== null && (
                        <p className="mt-1 font-medium text-foreground">
                          {change > 0 ? '+' : ''}
                          {change.toFixed(1)}% vs previous
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 h-[220px]">
                    {history.length < 2 ? (
                      <EmptyChart
                        message="Record at least two KPI values to see a trend."
                      />
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={history}
                          margin={{
                            top: 8,
                            right: 10,
                            left: 4,
                            bottom: 24,
                          }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="currentColor"
                            strokeOpacity={0.12}
                          />

                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={16}
                            label={{
                              value: 'Date',
                              position: 'insideBottom',
                              offset: -14,
                              fontSize: 11,
                            }}
                          />

                          <YAxis
                            width={58}
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                            domain={['auto', 'auto']}
                            label={{
                              value: unit ? `Value (${unit})` : 'KPI value',
                              angle: -90,
                              position: 'insideLeft',
                              fontSize: 10,
                            }}
                          />

                          <Tooltip
                            labelFormatter={(label) => `Date: ${String(label)}`}
                            formatter={(value) => [
                              formatUnit(Number(value), unit),
                              name,
                            ]}
                            contentStyle={{
                              borderRadius: 10,
                              border: '1px solid #d1d5db',
                              fontSize: 12,
                            }}
                          />

                          <Line
                            type="monotone"
                            dataKey="value"
                            name={name}
                            stroke="#6366f1"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {history.length > 0
                      ? `${history.length} recorded value${history.length === 1 ? '' : 's'}`
                      : 'No historical values recorded'}
                  </p>
                </article>
              );
            })}
          </div>
        )}

        {kpis.length > 8 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Showing 8 of {kpis.length} KPI metrics.
          </p>
        )}
      </section>

      {/* Team productivity */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2">
            <Users className="h-5 w-5 text-blue-500" />
          </div>

          <div>
            <h2 className="text-lg font-semibold">
              Team productivity
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Each row is a team member. Compare their open task count
              with done tasks updated during the last 7 days.
            </p>
          </div>
        </div>

        {teamQuery.isError ? (
          <div className="rounded-lg bg-muted/30 p-5">
            <p className="text-sm text-red-500">
              {getErrorMessage(
                teamQuery.error,
                'Team analytics could not be loaded.',
              )}
            </p>

            <button
              type="button"
              onClick={() => void teamQuery.refetch()}
              className="mt-3 text-sm font-medium text-brand-500 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : teamQuery.isLoading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
        ) : memberChartData.length === 0 ? (
          <div className="rounded-lg bg-muted/30 p-10 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />

            <p className="mt-3 font-medium">
              No team member activity
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              No active team members were returned by the analytics API.
            </p>
          </div>
        ) : (
          <>
            <div
              className="w-full"
              style={{
                height: Math.max(320, memberChartData.length * 48),
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={memberChartData}
                  layout="vertical"
                  margin={{
                    top: 12,
                    right: 16,
                    left: 8,
                    bottom: 30,
                  }}
                  barCategoryGap="25%"
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="currentColor"
                    strokeOpacity={0.12}
                  />

                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    label={{
                      value: 'Number of tasks',
                      position: 'insideBottom',
                      offset: -18,
                      fontSize: 12,
                    }}
                  />

                  <YAxis
                    type="category"
                    dataKey="name"
                    width={125}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => {
                      const name = String(value);
                      return name.length > 18
                        ? `${name.slice(0, 16)}…`
                        : name;
                    }}
                  />

                  <Tooltip
                    formatter={(value) => [
                      formatNumber(Number(value)),
                      'Tasks',
                    ]}
                    contentStyle={{
                      borderRadius: 10,
                      border: '1px solid #d1d5db',
                      fontSize: 12,
                    }}
                  />

                  <Legend
                    verticalAlign="top"
                    height={34}
                    wrapperStyle={{ fontSize: 12 }}
                  />

                  <Bar
                    dataKey="tasksCompleted"
                    name="Done tasks updated (7 days)"
                    fill="#6366f1"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={24}
                  />

                  <Bar
                    dataKey="openTasks"
                    name="Open tasks"
                    fill="#cbd5e1"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Note: the current API measures the first series using
              tasks updated in the last 7 days, not necessarily tasks
              whose completion date falls within that period.
            </p>
          </>
        )}
      </section>

      {/* Active goals */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-5 flex items-center gap-2">
          <Target className="h-5 w-5 text-orange-500" />

          <div>
            <h2 className="text-lg font-semibold">
              Active goals
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Current progress against each goal's recorded target.
            </p>
          </div>
        </div>

        {goals.length === 0 ? (
          <div className="rounded-lg bg-muted/30 p-8 text-center">
            <Target className="mx-auto h-8 w-8 text-muted-foreground/50" />

            <p className="mt-3 font-medium">
              No active goals
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Active goals will appear here when they are created.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {goals.slice(0, 9).map((goal, index) => {
              const current = toNumber(goal.current_value);
              const target = toNumber(goal.target_value);
              const unit = textValue(goal.unit, '');

              const hasTarget =
                target !== null && target > 0;

              const progress =
                hasTarget && current !== null
                  ? Math.max(
                      0,
                      Math.min(100, (current / target) * 100),
                    )
                  : null;

              const dueDate = textValue(goal.due_date, '');

              return (
                <article
                  key={textValue(goal.id, `goal-${index}`)}
                  className="min-w-0 rounded-xl border border-border p-4"
                >
                  <h3 className="break-words font-medium">
                    {textValue(goal.title, 'Untitled goal')}
                  </h3>

                  {dueDate && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Due {formatFullDate(dueDate)}
                    </p>
                  )}

                  {hasTarget ? (
                    <>
                      <div className="mt-4 flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                          Current / target
                        </span>

                        <span className="text-right font-medium tabular-nums">
                          {current === null
                            ? 'Not recorded'
                            : formatUnit(current, unit)}
                          {' / '}
                          {formatUnit(target, unit)}
                        </span>
                      </div>

                      {progress !== null ? (
                        <>
                          <div
                            className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-valuenow={Math.round(progress)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${textValue(goal.title, 'Goal')} progress`}
                          >
                            <div
                              className="h-full rounded-full bg-brand-500 transition-all"
                              style={{
                                width: `${progress}%`,
                              }}
                            />
                          </div>

                          <p className="mt-2 text-right text-xs text-muted-foreground">
                            {progress.toFixed(1)}% of target
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          A current value has not been recorded.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No positive target has been configured.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Report timestamp */}
      {typeof dashboard?.generatedAt === 'string' && (
        <p className="text-right text-xs text-muted-foreground">
          Dashboard data generated:{' '}
          {formatFullDate(dashboard.generatedAt)}
        </p>
      )}
    </div>
  );
}
