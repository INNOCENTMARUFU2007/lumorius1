'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  ArrowDownRight,
  Brain,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  FolderKanban,
  ListChecks,
  Mic,
  Ratio,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { isAxiosError } from 'axios';
import { ActivityHeatmap, StatusBar } from './activity-heatmap';

// Recharts is the heaviest dependency on this page; load it after first paint.
const CompletionChart = dynamic(() => import('./completion-chart'), {
  ssr: false,
  loading: () => <div className="lm-skeleton w-full" style={{ height: 280 }} />,
});
import api from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  DataFreshness,
  EmptyState,
  ErrorState,
  InsightList,
  MetricCard,
  PageHeader,
  Panel,
  SectionHeading,
  SegmentedControl,
  Skeleton,
  StatusBadge,
  TrendIndicator,
  type Insight,
} from '@/components/ui/primitives';
import { ChartContainer } from '@/components/ui/chart';

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

interface ExecutiveMetric {
  metricKey: string;
  status: 'actual' | 'estimated' | 'unavailable';
  value: number | string | null;
  currency?: string;
  note?: string;
}

interface PersonalAiUsage {
  operations: string | number;
  tokens: string | number;
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

function number(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function DashboardOverview() {
  const [days, setDays] = useState(30);
  const { user } = useAuth();
  const canOpenTasks = ['owner', 'admin', 'manager', 'member'].includes(user?.role.toLowerCase() ?? '');
  const canSeeFinancials =
    Boolean(user?.organizationId) && ['owner', 'admin'].includes(user?.role.toLowerCase() ?? '');

  const financialQuery = useQuery({
    queryKey: ['executive-intelligence', 'dashboard', 'overview', user?.organizationId, user?.id],
    enabled: canSeeFinancials,
    queryFn: async () => {
      const payload = unwrapApiResponse(await api.get('/executive-intelligence/dashboard')) as
        { metrics?: ExecutiveMetric[] } | undefined;
      if (!Array.isArray(payload?.metrics)) {
        throw new Error('The executive dashboard API returned an invalid response.');
      }
      return payload.metrics;
    },
    // A 403 means the plan does not include advanced financial reporting; retrying cannot help.
    retry: (count, error) => !isAxiosError(error) || (error.response?.status !== 403 && count < 1),
  });
  const financialLocked = isAxiosError(financialQuery.error) && financialQuery.error.response?.status === 403;

  const aiUsageQuery = useQuery({
    queryKey: ['analytics', 'my-ai-usage', user?.organizationId, user?.id],
    enabled: Boolean(user?.organizationId && user.id),
    queryFn: async () => {
      const usage = unwrapApiResponse(await api.get('/analytics/my-ai-usage')) as PersonalAiUsage | undefined;
      const operations = number(usage?.operations);
      const tokens = number(usage?.tokens);
      if (operations === null || tokens === null) {
        throw new Error('The AI usage API returned an invalid response.');
      }
      return { operations, tokens };
    },
  });

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


  const executiveMetrics = financialQuery.data ?? [];
  const measuredMetrics = (key: string) =>
    executiveMetrics.flatMap((metric) => {
      const value = number(metric.value);
      return metric.metricKey === key && metric.status !== 'unavailable' && value !== null
        ? [{ ...metric, value }]
        : [];
    });

  const financialCard = (
    label: string,
    icon: LucideIcon,
    values: string[],
    note: string,
    missing: string,
  ): MetricDefinition => ({
    label,
    icon,
    value: values.length ? values.join('\n') : financialQuery.isLoading ? 'Loading…' : '—',
    note: values.length ? note : financialQuery.isError ? 'Could not load financial data' : missing,
    detail: values.length ? note : missing,
    available: values.length > 0,
  });

  const currencyValues = (key: string) =>
    measuredMetrics(key).flatMap(({ currency, value, status }) =>
      currency
        ? [`${status === 'estimated' ? '≈ ' : ''}${value.toLocaleString(undefined, {
            style: 'currency',
            currency,
            currencyDisplay: 'code',
          })}`]
        : [],
    );

  const cac = measuredMetrics('cac');
  const ratios = measuredMetrics('ltv').flatMap((ltv) => {
    const cost = cac.find((metric) => metric.currency && metric.currency === ltv.currency);
    if (!cost || cost.value <= 0 || ltv.value < 0) return [];
    const prefix = ltv.status === 'estimated' || cost.status === 'estimated' ? '≈ ' : '';
    const ratio = (ltv.value / cost.value).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return [`${prefix}${ratio}× (${ltv.currency})`];
  });
  const churn = measuredMetrics('customer_retention_rate')
    .filter(({ value }) => value >= 0 && value <= 100)
    .map(({ value, status }) =>
      `${status === 'estimated' ? '≈ ' : ''}${(1 - value / 100).toLocaleString(undefined, {
        style: 'percent',
        maximumFractionDigits: 2,
      })}`,
    );

  const financialMetrics = canSeeFinancials ? [
    financialCard('Total Revenue', CircleDollarSign, currencyValues('revenue'),
      'Committed revenue this month', 'Commit revenue transactions in Executive Intelligence'),
    financialCard('Churn Rate', ArrowDownRight, churn,
      'Customer churn this month', 'Customer cohort and churn history needed'),
    financialCard('MRR', CircleDollarSign, currencyValues('mrr'),
      'Monthly run rate from active contracts', 'Commit active recurring contracts in Executive Intelligence'),
    financialCard('ARR', Activity, currencyValues('arr'),
      'Annual run rate from active contracts', 'Commit active recurring contracts in Executive Intelligence'),
    financialCard('CAC', Users, currencyValues('cac'),
      'Customer acquisition cost this month', 'Verified acquisition spend and new customer counts needed'),
    financialCard('LTV:CAC', Ratio, ratios,
      'Lifetime value divided by acquisition cost', 'Verified LTV and CAC in the same currency needed'),
  ] : [];
  const aiUsage = aiUsageQuery.data;
  const metrics: MetricDefinition[] = [
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
      value: aiUsage ? `${aiUsage.operations.toLocaleString()} operations` : aiUsageQuery.isLoading ? 'Loading…' : '—',
      note: aiUsage
        ? `${aiUsage.tokens.toLocaleString()} recorded tokens · this month (UTC)`
        : aiUsageQuery.isError ? 'Could not load your AI usage' : 'Your usage this month (UTC)',
      detail: 'Recorded AI operations attributed to your account in this organization for the current UTC month.',
      icon: FileText,
      available: Boolean(aiUsage),
    },
  ];

  const statusRows = (team?.tasksByStatus ?? []).map((row) => ({
    key: row.status,
    status: row.status.replace(/_/g, ' '),
    count: Number(row.count),
  }));

  const statusTotal = statusRows.reduce(
    (sum, row) => sum + row.count,
    0,
  );

  const overdue = number(tasks?.overdue);
  const urgentOpen = number(tasks?.urgent_open);
  const failedDocs = number(documents?.failed);
  const processingDocs = (number(documents?.processing) ?? 0) + (number(documents?.uploading) ?? 0);
  const rawFirst = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';
  // Names stored in capitals ("JANE") read as shouting in a greeting.
  const firstName = rawFirst && rawFirst === rawFirst.toUpperCase() ? rawFirst.charAt(0) + rawFirst.slice(1).toLowerCase() : rawFirst;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // Deterministic briefing: every statement below is computed from the API
  // responses on this page. Nothing is inferred by AI and no causes are guessed.
  const briefing: Insight[] = [];
  if (current !== null && previous !== null) {
    const delta = current - previous;
    briefing.push({
      id: 'completion-change',
      tone: delta > 0 ? 'success' : delta < 0 ? 'warning' : 'neutral',
      provenance: 'calculated',
      title:
        delta === 0
          ? `Task completions held steady over the last ${days} days`
          : `Task completions ${delta > 0 ? 'rose' : 'fell'} by ${Math.abs(delta).toLocaleString()} versus the previous ${days} days`,
      body: `${current.toLocaleString()} tasks completed in this period compared with ${previous.toLocaleString()} in the prior period. The data does not show why; review the work queue to investigate.`,
    });
  }
  if (overdue !== null && overdue > 0) {
    briefing.push({
      id: 'overdue',
      tone: 'critical',
      provenance: 'calculated',
      title: `${overdue.toLocaleString()} open ${overdue === 1 ? 'task is' : 'tasks are'} past due`,
      body: 'Open tasks with a due date earlier than today.',
      action: canOpenTasks ? (
        <Link href="/tasks?status=overdue" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Review overdue tasks <ArrowRight className="h-3 w-3" />
        </Link>
      ) : undefined,
    });
  }
  if (failedDocs !== null && failedDocs > 0) {
    briefing.push({
      id: 'failed-docs',
      tone: 'warning',
      provenance: 'calculated',
      title: `${failedDocs.toLocaleString()} ${failedDocs === 1 ? 'document' : 'documents'} failed to index`,
      body: 'Failed documents are excluded from Company Brain answers until they are reprocessed or re-uploaded.',
      action: (
        <Link href="/brain" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Open Company Brain <ArrowRight className="h-3 w-3" />
        </Link>
      ),
    });
  }
  if (canSeeFinancials && financialQuery.isSuccess && currencyValues('revenue').length === 0) {
    briefing.push({
      id: 'revenue-gap',
      tone: 'warning',
      provenance: 'missing',
      title: 'No committed revenue for this month',
      body: 'Financial performance cannot be assessed until revenue transactions are imported and committed in Executive Intelligence.',
      action: (
        <Link href="/executive-intelligence" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Import financial data <ArrowRight className="h-3 w-3" />
        </Link>
      ),
    });
  }

  const sparkValues = trend.map((point) => point.value);

  const heroStats = [
    { label: 'Overdue tasks', value: overdue, tone: overdue ? 'text-destructive' : 'text-foreground', href: canOpenTasks ? '/tasks?status=overdue' : undefined },
    { label: 'Urgent and open', value: urgentOpen, tone: urgentOpen ? 'text-warning' : 'text-foreground', href: canOpenTasks ? '/tasks' : undefined },
    { label: 'Documents processing', value: documents ? processingDocs : null, tone: 'text-foreground', href: '/brain' },
    { label: 'Failed to index', value: failedDocs, tone: failedDocs ? 'text-warning' : 'text-foreground', href: '/brain' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6">
      <PageHeader
        hero
        title={firstName ? `${greeting}, ${firstName}` : 'Overview'}
        description={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={
          canOpenTasks ? (
            <>
              <Link href="/tasks?view=projects" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3.5 text-sm font-medium transition hover:bg-muted">
                <FolderKanban className="h-4 w-4" /> Projects
              </Link>
              <Link href="/tasks" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
                <ListChecks className="h-4 w-4" /> Work queue
              </Link>
            </>
          ) : undefined
        }
      />

      <dl aria-label="Needs attention" className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-4 sm:divide-y-0">
        {heroStats.map((stat) => {
          const content = (
            <>
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className={`mt-1 font-mono text-xl font-medium tabular-nums ${stat.tone}`}>
                {isLoading ? <Skeleton className="h-6 w-10" /> : stat.value === null ? '—' : stat.value.toLocaleString()}
              </dd>
            </>
          );
          return stat.href ? (
            <Link key={stat.label} href={stat.href} className="px-4 py-3 transition-colors hover:bg-muted/50">
              {content}
            </Link>
          ) : (
            <div key={stat.label} className="px-4 py-3">{content}</div>
          );
        })}
      </dl>

      {isError && <ErrorState title="Workspace activity could not be refreshed" description="Showing the most recent data available. Check your connection and retry." />}

      <section aria-label="Workspace activity">
        <SectionHeading title="Workspace activity" actions={<DataFreshness at={data?.generatedAt} />} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric, index) => (
            <MetricCard
              key={metric.label}
              {...metric}
              loading={isLoading && index < 3}
              emphasis={metric.label === 'Tasks Completed' ? 'primary' : 'default'}
              sparkline={metric.label === 'Tasks Completed' ? sparkValues : undefined}
              trend={metric.label === 'Tasks Completed' ? <TrendIndicator current={current} previous={previous} /> : undefined}
            />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(300px,1fr)]">
        <ChartContainer
          title="Task completions"
          description={`Tasks completed per day · last ${days} days`}
          loading={isLoading}
          error={isError && !data}
          empty={trend.length === 0}
          emptyTitle="No completion history for this period"
          emptyDescription="Completed tasks with a completion timestamp will appear here."
          height={280}
          legend={
            <>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-chart-1" aria-hidden="true" /> Completed per day</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-chart-2" aria-hidden="true" /> 7-day average</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0 w-3 border-t border-dashed border-muted-foreground" aria-hidden="true" /> Period average</span>
            </>
          }
          source="Tasks marked done with a completion time, grouped by calendar day."
          actions={
            <SegmentedControl
              label="Task completion period"
              value={days}
              onChange={setDays}
              options={[
                { value: 7, label: '7D' },
                { value: 30, label: '30D' },
                { value: 90, label: '90D' },
              ]}
            />
          }
        >
          <CompletionChart points={trend} height={280} />
          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-3 text-xs font-medium text-muted-foreground">Daily activity</p>
            <ActivityHeatmap points={trend} />
          </div>
        </ChartContainer>

        <Panel
          title="What changed"
          description={`Last ${days} days compared with the ${days} before`}
          footer="Calculated from your workspace records. Lumorius does not guess at causes here."
        >
          {isLoading ? (
            <div className="space-y-2.5">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : briefing.length ? (
            <InsightList insights={briefing} />
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing needs attention"
              description="No overdue tasks, indexing failures or data gaps were detected in the selected period."
              compact
            />
          )}
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel
          title="Task status"
          description="Organization-wide distribution"
          actions={<Link href="/tasks" className="text-xs font-medium text-primary hover:underline">Open tasks</Link>}
        >
          {teamLoading ? (
            <div className="space-y-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
          ) : teamError ? (
            <ErrorState title="Task status data could not be loaded" />
          ) : statusRows.length === 0 ? (
            <EmptyState icon={ListChecks} title="No tasks yet" description="Create tasks or import action items from meetings." compact />
          ) : (
            <StatusBar rows={statusRows} />
          )}
        </Panel>

        <Panel
          title="Document indexing"
          description="Processing state from Company Brain"
          actions={<Link href="/brain" className="text-xs font-medium text-primary hover:underline">Open library</Link>}
          footer={documents ? `${number(documents.total)?.toLocaleString() ?? '—'} total documents recorded.` : undefined}
        >
          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : documents ? (
            <ul className="space-y-2">
              {([
                ['Indexed', documents.indexed, 'success'],
                ['Processing', documents.processing, 'info'],
                ['Uploading', documents.uploading, 'primary'],
                ['Failed', documents.failed, 'critical'],
              ] as const).map(([label, value, tone]) => (
                <li key={label} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5">
                  <StatusBadge tone={(number(value) ?? 0) > 0 ? tone : 'neutral'}>{label}</StatusBadge>
                  <span className="text-sm font-semibold tabular-nums text-foreground">{number(value)?.toLocaleString() ?? '—'}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Brain} title="Indexing metrics unavailable" compact />
          )}
        </Panel>

        <Panel
          title="Priority work"
          description="Urgent and near-due open tasks"
          actions={<Link href="/tasks" className="text-xs font-medium text-primary hover:underline">View all</Link>}
          className="md:col-span-2 xl:col-span-1"
        >
          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : data?.urgentTasks?.length ? (
            <ul className="space-y-2">
              {data.urgentTasks.slice(0, 5).map((task) => (
                <li key={task.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 transition-colors hover:border-border-strong">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${task.priority === 'urgent' ? 'bg-destructive' : 'bg-warning'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{task.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <StatusBadge tone={task.priority === 'urgent' ? 'critical' : 'warning'} dot={false}>{task.priority}</StatusBadge>
                      {task.due_date ? `Due ${formatDate(task.due_date)}` : 'No due date'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CheckCircle2} title="No urgent or near-due tasks" compact />
          )}
        </Panel>
      </section>

      {canSeeFinancials && (
        <section aria-label="Financial performance">
          <SectionHeading
            title="Financial performance"
            description="Committed figures from Executive Intelligence. “≈” marks estimated values."
            actions={
              <Link href="/executive-intelligence" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Executive Intelligence <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          {financialLocked ? (
            <EmptyState
              icon={CircleDollarSign}
              title="Financial performance is not included in your current plan"
              description="Revenue, MRR, ARR, CAC and churn come from Executive Intelligence, which requires a plan with advanced financial reporting."
              action={
                <Link href="/billing" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90">
                  View plans <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
          ) : (
            <>
              {financialQuery.isError && <ErrorState className="mb-3" title="Financial data could not be loaded" onRetry={() => void financialQuery.refetch()} />}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                {financialMetrics.map((metric) => (
                  <MetricCard key={metric.label} {...metric} loading={financialQuery.isLoading} tone="info" />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
