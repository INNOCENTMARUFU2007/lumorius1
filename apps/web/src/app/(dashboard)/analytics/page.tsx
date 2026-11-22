
'use client';

import MarketingPanel from './marketing-panel';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import api from '@/lib/api';
import { toast } from 'sonner';
import { RingGauge, ShareBar, StatTile } from '@/components/ui/insight-visuals';
import { useKpiScorecard } from '@/components/kpi-scorecard';
import { useAuth } from '@/hooks/use-auth';
import KpiPerformance from './kpi-performance';

type DataRecord = Record<string, unknown>;

type TrendPoint = {
  date: string;
  label: string;
  value: number;
};

type TeamMemberPoint = {
  id: string;
  name: string;
  role?: string;
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

const chartTick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
const chartTooltip = { background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 };
const statusColors = ['#7965e9', '#2997a1', '#c69438', '#6b81a6', '#cc6688', '#829f5a'];

function WorkloadBar({ value, scale, color }: { value: number; scale: number; color: string }) {
  return <div className="space-y-1.5">
    <span className={`tabular-nums ${value ? 'font-semibold' : 'text-muted-foreground'}`}>{formatNumber(value)}</span>
    <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
      {value > 0 && <div className={`h-full rounded-full ${color}`} style={{ width: value / scale * 100 + '%' }} />}
    </div>
  </div>;
}

export default function AnalyticsPage() {
  const [activityOnly, setActivityOnly] = useState(false);
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [cumulative, setCumulative] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const [teamSort, setTeamSort] = useState<keyof Pick<TeamMemberPoint, 'openTasks' | 'tasksCompleted'>>('openTasks');
  const dashboardQuery = useQuery<DashboardData, Error>({
    queryKey: ['analytics', 'founder-dashboard', 90],
    queryFn: async () => {
      const response = await api.get<unknown>(
        '/analytics/founder-dashboard', { params: { days: 90 } },
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
  // Executive Intelligence targets (owners and admins); the same data Executive Intelligence shows.
  const scorecard = useKpiScorecard();
  const { user } = useAuth();
  const canManageKpis = ['owner', 'admin', 'manager'].includes(String(user?.role ?? ''));
  const governedKpis = scorecard.data?.length ?? 0;

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

  const memberWorkload = members.flatMap((member): TeamMemberPoint[] => {
    const id = textValue(member.id, '');
    if (!id) return [];
    return [{
      id,
      name: textValue(member.name, 'Unnamed member'),
      role: readableStatus(member.role),
      tasksCompleted: countValue(member, 'tasks_completed_this_week'),
      openTasks: countValue(member, 'open_tasks'),
    }];
  }).sort((a, b) => b[teamSort] - a[teamSort] || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const unallocatedWorkload = asRecords(team?.unallocatedWork).flatMap((entry): TeamMemberPoint[] => {
    const group = textValue(entry.assignee_group, '');
    if (group !== 'unassigned' && group !== 'inactive') return [];
    return [{
      id: group,
      name: group === 'unassigned' ? 'Unassigned' : 'Assigned to inactive members',
      tasksCompleted: countValue(entry, 'tasks_completed_this_week'),
      openTasks: countValue(entry, 'open_tasks'),
    }];
  });
  const hasActivity = ({ openTasks, tasksCompleted }: TeamMemberPoint) => openTasks > 0 || tasksCompleted > 0;
  const hasMemberActivity = memberWorkload.some(hasActivity);
  const visibleMembers = activityOnly ? memberWorkload.filter(hasActivity) : memberWorkload;
  const workloadRows = [...visibleMembers.slice(0, 12), ...unallocatedWorkload];
  const workloadScale = Math.max(1, ...workloadRows.flatMap(({ openTasks, tasksCompleted }) => [openTasks, tasksCompleted]));
  const unassignedOpen = unallocatedWorkload.find((row) => row.id === 'unassigned')?.openTasks ?? 0;

  const totalTasks = countValue(taskStats, 'total');
  const completedTasks = countValue(taskStats, 'completed');
  const inProgressTasks = countValue(taskStats, 'in_progress');
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

  let periodCompletions = 0;
  const series = completionTrend.slice(-range).map((point) => {
    periodCompletions += point.value;
    return { ...point, value: cumulative ? periodCompletions : point.value };
  });
  const statusTotal = statusChartData.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Analytics</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Track work delivered, team workload, and progress against goals and KPIs.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void Promise.all([dashboardQuery.refetch(), teamQuery.refetch(), kpiQuery.refetch()])}
            disabled={dashboardQuery.isFetching || teamQuery.isFetching || kpiQuery.isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${dashboardQuery.isFetching || teamQuery.isFetching || kpiQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button type="button" onClick={() => weeklyReportMutation.mutate()} disabled={weeklyReportMutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
            {weeklyReportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {weeklyReportMutation.isPending ? 'Generating…' : 'Weekly report'}
          </button>
        </div>
      </header>

      <MarketingPanel />
      <nav aria-label="Analytics sections" className="flex flex-wrap gap-4 text-sm font-medium text-muted-foreground">
        {[['#activity', 'Activity'], ['#workload', 'Team workload'], ['#kpi-history', 'KPI history'], ['#goals', 'Goals']].map(([href, label]) => (
          <a key={href} href={href} className="hover:text-foreground hover:underline">{label}</a>
        ))}
      </nav>

      {dashboardQuery.isError && <div role="alert" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        {getErrorMessage(dashboardQuery.error, 'Workspace totals could not be loaded.')} <button type="button" onClick={() => void dashboardQuery.refetch()} className="ml-2 underline">Retry</button>
      </div>}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">
            Business overview
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Current workload and source activity.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* Delivery: one gauge for completion plus a breakdown of open work */}
          <article className="lm-panel grid items-center gap-6 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-6">
            <RingGauge
              value={dashboard ? completedTasks : null}
              max={dashboard ? totalTasks : null}
              label="delivered"
              tone="success"
              caption={dashboard ? `${formatNumber(completedTasks)} of ${formatNumber(totalTasks)} tasks done` : 'Loading…'}
            />
            <div className="min-w-0 space-y-4">
              <div>
                <h3 className="text-base font-semibold">Delivery</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">Where every task in the workspace stands right now.</p>
              </div>
              <ShareBar label="Completed" value={dashboard ? completedTasks : null} total={dashboard ? totalTasks : null} tone="success" />
              <ShareBar label="In progress" value={dashboard ? inProgressTasks : null} total={dashboard ? totalTasks : null} tone="primary" />
              <ShareBar label="Not started" value={dashboard ? Math.max(0, totalTasks - completedTasks - inProgressTasks) : null} total={dashboard ? totalTasks : null} tone="neutral" />
              <ShareBar label="Overdue" value={dashboard ? overdueTasks : null} total={dashboard ? totalTasks : null} tone="critical" hint="Uncompleted tasks past their due date" />
            </div>
          </article>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatTile
              label="Indexed documents"
              icon={FileText}
              tone="violet"
              value={dashboard ? `${formatNumber(countValue(documentStats, 'indexed'))} / ${formatNumber(countValue(documentStats, 'total'))}` : '—'}
              meter={dashboard ? { value: countValue(documentStats, 'indexed'), total: countValue(documentStats, 'total') } : undefined}
              note={dashboard ? `${formatNumber(countValue(documentStats, 'uploaded_this_week'))} uploaded in the last 7 days` : 'Uploads unavailable'}
            />
            <StatTile
              label="Completed meetings"
              icon={CalendarDays}
              tone="info"
              value={dashboard ? formatNumber(countValue(meetingStats, 'completed')) : '—'}
              note={dashboard ? `${formatNumber(countValue(meetingStats, 'last_30_days'))} created in the last 30 days` : 'Meeting activity unavailable'}
            />
            <StatTile
              label="Active goals"
              icon={Target}
              tone="warning"
              value={dashboard ? formatNumber(goals.length) : '—'}
              note="Goals currently in progress"
            />
            <StatTile
              label="Tracked KPIs"
              icon={TrendingUp}
              tone="success"
              value={kpiQuery.data ? formatNumber(kpis.length + governedKpis) : '—'}
              note={governedKpis ? formatNumber(governedKpis) + ' financial targets and ' + formatNumber(kpis.length) + ' team metrics' : 'Metrics configured for this workspace'}
            />
          </div>
        </div>
      </section>

      <section id="activity" className="grid min-w-0 scroll-mt-5 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
            <div>
              <h2 className="text-base font-semibold">Task completion</h2>
              <p className="mt-1 text-xs text-muted-foreground">{series.length ? `${formatFullDate(series[0].date)} – ${formatFullDate(series[series.length - 1].date)}` : 'Daily completions'}</p>
            </div>
            <div aria-label="Completion time range" className="flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
              {([7, 30, 90] as const).map((days) => (
                <button key={days} type="button" aria-pressed={range === days} onClick={() => setRange(days)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${range === days ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{days}D</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{series.length ? formatNumber(periodCompletions) : '—'}</span>
              <span className="text-xs text-muted-foreground">tasks completed</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="text-xs text-muted-foreground"><span className="sr-only">Completion series</span>
                <select value={cumulative ? 'cumulative' : 'daily'} onChange={(e) => setCumulative(e.target.value === 'cumulative')} className="rounded-md border border-border bg-background px-2 py-1.5 text-foreground"><option value="daily">Daily</option><option value="cumulative">Cumulative</option></select>
              </label>
              <button type="button" aria-pressed={showTable} onClick={() => setShowTable(!showTable)} className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted">{showTable ? 'Show chart' : 'Show data'}</button>
            </div>
          </div>
          {dashboardQuery.isLoading ? <div className="mx-4 mb-4 h-[280px] animate-pulse rounded-xl bg-muted/50" /> : !series.length ? (
            <div className="px-4 pb-4"><EmptyChart message={dashboardQuery.isError ? 'Completion history could not be loaded.' : 'No daily completion history is available.'} /></div>
          ) : showTable ? (
            <div className="mx-4 mb-4 max-h-[292px] overflow-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs tabular-nums">
                <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-3">Date</th><th className="p-3 text-right">{cumulative ? 'Running total' : 'Completed'}</th></tr></thead>
                <tbody className="divide-y divide-border">{[...series].reverse().map((point) => <tr key={point.date}><td className="px-3 py-2">{formatFullDate(point.date)}</td><td className="px-3 py-2 text-right">{formatNumber(point.value)}</td></tr>)}</tbody>
              </table>
            </div>
          ) : (
            <div className="h-[292px] min-w-0 px-2 pb-4 sm:px-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart accessibilityLayer data={series} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
                  <defs><linearGradient id="analytics-completion-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c6cf2" stopOpacity={0.24} /><stop offset="100%" stopColor="#7c6cf2" stopOpacity={0.015} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 4" />
                  <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={chartTick} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis allowDecimals={false} domain={[0, 'auto']} width={34} tick={chartTick} tickLine={false} axisLine={false} />
                  <Tooltip labelFormatter={formatFullDate} formatter={(value) => [formatNumber(Number(value)), cumulative ? 'Running total' : 'Completed']}
                    contentStyle={chartTooltip} cursor={{ stroke: '#8b7afa', strokeOpacity: 0.6, strokeDasharray: '3 4' }} />
                  <Area type="linear" dataKey="value" stroke="#7965e9" strokeWidth={2.25} fill="url(#analytics-completion-fill)" dot={false}
                    activeDot={{ r: 5, fill: '#7965e9', stroke: 'hsl(var(--background))', strokeWidth: 2 }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-base font-semibold">Work by status</h2>
          <p className="mt-1 text-xs text-muted-foreground">Current task inventory</p>
          {teamQuery.isError ? <div className="mt-4"><EmptyChart message="Task status could not be loaded." /></div> : teamQuery.isLoading ? (
            <div className="mt-4 h-44 animate-pulse rounded-xl bg-muted/50" />
          ) : statusTotal === 0 ? <div className="mt-4"><EmptyChart message="No tasks recorded." /></div> : (
            <>
              <p className="mt-5 text-3xl font-semibold tabular-nums">{formatNumber(statusTotal)} <span className="text-xs font-normal text-muted-foreground">tasks</span></p>
              <div aria-hidden="true" className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted">
                {statusChartData.map((item, index) => <span key={item.status} style={{ width: `${item.count / statusTotal * 100}%`, background: statusColors[index % statusColors.length] }} />)}
              </div>
              <ul className="mt-4 divide-y divide-border">
                {statusChartData.map((item, index) => <li key={item.status} className="flex items-center gap-2 py-2.5 text-sm">
                  <span className="h-2 w-2 rounded-sm" aria-hidden="true" style={{ background: statusColors[index % statusColors.length] }} />
                  <span className="min-w-0 flex-1">{item.status}</span><span className="tabular-nums font-medium">{formatNumber(item.count)}</span>
                  <span className="w-10 text-right tabular-nums text-muted-foreground">{Math.round(item.count / statusTotal * 100)}%</span>
                </li>)}
              </ul>
            </>
          )}
        </div>
      </section>

      <KpiPerformance
        rawKpis={kpis}
        loading={kpiQuery.isLoading}
        error={kpiQuery.isError ? getErrorMessage(kpiQuery.error, 'Team KPIs could not be loaded.') : null}
        onChanged={() => void kpiQuery.refetch()}
        canManage={canManageKpis}
        canRecord={Boolean(user)}
      />

      <section id="workload" className="scroll-mt-5 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:p-5">
          <div>
            <h2 className="text-lg font-semibold">Team workload</h2>
            <p className="mt-1 text-sm text-muted-foreground">Open assignments and tasks completed in the last seven days, grouped by current assignee.</p>
          </div>
          <Link href="/tasks" className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">Open tasks</Link>
        </div>
        {teamQuery.isError ? (
          <div role="alert" className="p-5 text-sm text-muted-foreground">
            {getErrorMessage(teamQuery.error, 'Team analytics could not be loaded.')}
            <button type="button" onClick={() => void teamQuery.refetch()} className="ml-2 font-medium underline">Retry</button>
          </div>
        ) : teamQuery.isLoading ? (
          <div className="m-4 h-40 animate-pulse rounded-xl bg-muted/50" />
        ) : (
          <div className="space-y-4 p-4 sm:p-5">
            {!hasMemberActivity && (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                No open or recently completed tasks are assigned to active members.{unassignedOpen > 0 && ` ${formatNumber(unassignedOpen)} open ${unassignedOpen === 1 ? 'task has' : 'tasks have'} no assignee.`}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap gap-3 text-muted-foreground">
                <span><span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-[#2997a1]" /> Open tasks</span>
                <span><span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-[#7965e9]" /> Completed in 7 days</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-muted-foreground">
                  <input type="checkbox" checked={activityOnly} onChange={(event) => setActivityOnly(event.target.checked)} className="accent-brand-500" />
                  Members with activity only
                </label>
                <label className="flex items-center gap-1.5 text-muted-foreground">
                  Sort by
                  <select value={teamSort} onChange={(event) => setTeamSort(event.target.value as typeof teamSort)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-foreground">
                    <option value="openTasks">Open tasks</option>
                    <option value="tasksCompleted">Completed tasks</option>
                  </select>
                </label>
              </div>
            </div>
            {workloadRows.length ? (
              <div className="max-h-[35rem] overflow-y-auto rounded-xl border border-border">
                <table className="w-full table-fixed text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-muted text-muted-foreground">
                    <tr>
                      <th scope="col" className="w-[38%] p-2.5 sm:p-3">Assignee</th>
                      <th scope="col" className="p-2.5 sm:p-3">Open tasks</th>
                      <th scope="col" className="p-2.5 sm:p-3">Completed · 7 days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {workloadRows.map((row) => (
                      <tr key={row.id} className={row.role ? 'hover:bg-muted/30' : 'bg-muted/40'}>
                        <th scope="row" className="break-words p-2.5 font-semibold sm:p-3">
                          {row.name}
                          {row.role && <span className="mt-0.5 block text-xs font-normal capitalize text-muted-foreground">{row.role}</span>}
                        </th>
                        <td className="p-2.5 sm:p-3"><WorkloadBar value={row.openTasks} scale={workloadScale} color="bg-[#2997a1]" /></td>
                        <td className="p-2.5 sm:p-3"><WorkloadBar value={row.tasksCompleted} scale={workloadScale} color="bg-[#7965e9]" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              {activityOnly ? 'No members match the activity filter.' : 'No active members or unallocated work to display.'}
            </p>}
            {visibleMembers.length > 12 && <p className="text-xs text-muted-foreground">Showing the first 12 of {formatNumber(visibleMembers.length)} members in this sort order.</p>}
          </div>
        )}
      </section>

      <section id="goals" className="scroll-mt-5 rounded-xl border border-border bg-card p-5">
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

        {!dashboard ? <p className="text-sm text-muted-foreground">{dashboardQuery.isLoading ? 'Loading goals…' : 'Goal data is unavailable.'}</p> : goals.length === 0 ? (
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
