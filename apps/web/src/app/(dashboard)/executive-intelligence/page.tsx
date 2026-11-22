'use client';

import CashForecast from './cash-forecast';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers3,
  Loader2,
  LockKeyhole,
  Minus,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import api from '@/lib/api';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { AreaSparkline } from '@/components/ui/area-sparkline';
import type { SparkTone } from '@/components/ui/area-sparkline';
import { ImportMapping, isMapped } from './import-mapping';
import { KpiScorecard } from '@/components/kpi-scorecard';
import type { MonthlySeries } from './revenue-analytics';

// ECharts loads only when the Financials view renders.
const RevenueAnalytics = dynamic(() => import('./revenue-analytics'), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="lm-skeleton h-[480px] rounded-2xl" />,
});

type AnyRecord = Record<string, unknown>;

type ExecutiveMetric = {
  key: string;
  metricKey: string;
  label: string;
  category: string;
  status: 'actual' | 'estimated' | 'unavailable' | string;
  value: number | null;
  unit: string;
  currency?: string;
  definition?: string;
  formula?: string;
  note?: string;
  sampleSize?: number;
  sourceLabels?: string[];
  trend?: Array<{ label: string; value: number }>;
  targetValue?: number | null;
  targetProgressPct?: number | null;
  targetDirection?: 'higher_is_better' | 'lower_is_better';
  targetStatus?: 'on_track' | 'behind' | 'insufficient_data' | 'unavailable';
  targetOwnerName?: string | null;
  alertThresholdPct?: number | null;
};

type ExecutiveDashboard = {
  organizationId: string;
  organizationName: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  metrics: ExecutiveMetric[];
  alerts: Array<{
    metricKey: string;
    label: string;
    currency?: string;
    severity: 'warning' | string;
    message: string;
    actualValue: number;
    targetValue: number;
    gapPct: number;
  }>;
  sections: Array<{ title: string; body?: string; items?: string[] }>;
  sources: Array<{
    sourceType: string;
    sourceName: string;
    recordCount: number;
    periodStart: string;
    periodEnd: string;
  }>;
  assumptions: string[];
  trendWindow?: { start: string; end: string };
  monthlySeries?: MonthlySeries[];
};

type ImportSummary = {
  id: string;
  dataset_type: 'transactions' | 'contracts' | 'pipeline' | 'campaigns' | 'cash';
  status: string;
  file_name: string;
  row_count: number;
  valid_row_count: number;
  invalid_row_count: number;
  duplicate_row_count: number;
  validation_summary?: AnyRecord;
  committed_at?: string | null;
  created_at?: string;
};

type FinancialCandidate = {
  id: string;
  transaction_date: string;
  transaction_type: string;
  amount: number | string;
  currency: string;
  confidence: number | string;
  evidence_excerpt: string;
  document_name: string;
};

type ImportDetail = ImportSummary & {
  source_headers: string[];
  column_mapping: Record<string, string>;
  rows: Array<{
    id: string;
    row_number: number;
    raw_data: Record<string, unknown>;
    normalized_data?: Record<string, unknown> | null;
    validation_status: string;
    validation_errors: unknown[];
  }>;
  previewLimit: number;
};

type TargetRecord = {
  id: string;
  metric_key: string;
  target_value: number | string;
  unit: string;
  currency?: string | null;
  target_period: string;
  period_start: string;
  period_end: string;
  direction: 'higher_is_better' | 'lower_is_better';
  alert_threshold_pct?: number | string | null;
  minimum_sample_size: number | string;
  owner_name?: string | null;
};

type UploadResult = {
  id: string;
  datasetType: 'transactions' | 'contracts' | 'pipeline' | 'campaigns' | 'cash';
  status: string;
  fileName: string;
  headers: string[];
  rowCount: number;
};

type DatasetType = 'transactions' | 'contracts' | 'pipeline' | 'campaigns' | 'cash';

type TargetForm = {
  metricKey: string;
  targetValue: string;
  currency: string;
  targetPeriod: 'monthly' | 'quarterly' | 'annual' | 'custom';
  periodStart: string;
  periodEnd: string;
  direction: 'higher_is_better' | 'lower_is_better';
  alertThresholdPct: string;
  minimumSampleSize: string;
};

const DATASET_FIELDS: Record<DatasetType, { required: string[]; optional: string[] }> = {
  cash: { required: ['report_month','currency','opening_balance','inflows','outflows','closing_balance'], optional: [] },
  campaigns: { required: ['report_date','campaign','channel','currency','spend'], optional: ['segment','impressions','clicks','leads','customers','attributed_revenue','attribution_model','budget'] },
  transactions: {
    required: ['transaction_date', 'transaction_type', 'amount', 'currency'],
    optional: ['customer_key', 'external_reference', 'description'],
  },
  contracts: {
    required: ['external_contract_id', 'customer_key', 'status', 'recurring_amount', 'currency', 'billing_interval', 'start_date'],
    optional: ['end_date', 'cancelled_at'],
  },
  pipeline: {
    required: ['external_opportunity_id', 'title', 'stage', 'status', 'amount', 'currency', 'probability'],
    optional: ['customer_key', 'expected_close_date', 'closed_at'],
  },
};

const TARGET_METRICS = [
  'revenue', 'refund', 'cost_of_goods_sold', 'operating_expense', 'acquisition_cost',
  'other_income', 'tax', 'capital_expenditure', 'net_revenue', 'gross_profit',
  'operating_result', 'mrr', 'arr', 'customer_retention_rate', 'mrr_growth_pct',
  'open_pipeline', 'weighted_pipeline', 'closed_won', 'closed_lost', 'tasks_created',
  'tasks_completed', 'tasks_overdue', 'projects_created', 'projects_updated',
  'documents_uploaded', 'documents_indexed', 'documents_failed', 'meetings_created',
  'meetings_completed', 'meeting_average_duration_seconds', 'ai_operations',
  'ai_tokens', 'ai_unpriced_operations', 'ai_cost_usd',
];

const CURRENCY_METRICS = new Set([
  'revenue', 'refund', 'cost_of_goods_sold', 'operating_expense', 'acquisition_cost',
  'other_income', 'tax', 'capital_expenditure', 'net_revenue', 'gross_profit',
  'operating_result', 'mrr', 'arr', 'mrr_growth_pct', 'open_pipeline',
  'weighted_pipeline', 'closed_won', 'closed_lost', 'ai_cost_usd',
]);

const METRIC_UNITS: Record<string, string> = {
  customer_retention_rate: '%',
  tasks_created: 'tasks', tasks_completed: 'tasks', tasks_overdue: 'tasks',
  projects_created: 'projects', projects_updated: 'projects',
  documents_uploaded: 'documents', documents_indexed: 'documents', documents_failed: 'documents',
  meetings_created: 'meetings', meetings_completed: 'meetings',
  meeting_average_duration_seconds: 'seconds', ai_operations: 'operations',
  ai_unpriced_operations: 'operations', ai_tokens: 'tokens',
};

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapRecord(value: unknown): AnyRecord {
  let current: unknown = value;
  for (let depth = 0; depth < 4; depth += 1) {
    if (isRecord(current) && isRecord(current.data)) current = current.data;
    else break;
  }
  return isRecord(current) ? current : {};
}

function unwrapArray(value: unknown): AnyRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  const record = unwrapRecord(value);
  if (Array.isArray(record.data)) return record.data.filter(isRecord);
  if (Array.isArray(record.items)) return record.items.filter(isRecord);
  return [];
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits }).format(value);
}

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${formatNumber(value)}`;
  }
}

function formatMetricValue(metric: ExecutiveMetric): string {
  if (metric.status === 'unavailable' || metric.value === null || !Number.isFinite(metric.value)) return 'Unavailable';
  if (metric.unit === '%') return `${formatNumber(metric.value)}%`;
  if (metric.currency) return formatMoney(metric.value, metric.currency);
  if (metric.unit === 'seconds') return `${formatNumber(metric.value)} sec`;
  if (!metric.unit || metric.unit === 'currency') return formatNumber(metric.value);
  return `${formatNumber(metric.value)} ${metric.unit}`;
}

function formatCompactDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function initialPeriod(days = 30) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: dateInputValue(start), endDate: dateInputValue(end) };
}

function statusClasses(status: string): string {
  if (status === 'actual' || status === 'committed' || status === 'on_track') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300';
  }
  if (status === 'estimated' || status === 'validated' || status === 'mapping_required') {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-700 dark:text-amber-300';
  }
  if (status === 'behind' || status === 'invalid' || status === 'failed') {
    return 'border-rose-400/20 bg-rose-400/10 text-rose-700 dark:text-rose-300';
  }
  return 'border-slate-500/20 bg-slate-500/10 text-muted-foreground';
}

function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function metricIcon(metricKey: string): LucideIcon {
  if (metricKey.includes('revenue') || metricKey === 'mrr' || metricKey === 'arr') return CircleDollarSign;
  if (metricKey.includes('task') || metricKey.includes('project')) return CheckCircle2;
  if (metricKey.includes('document')) return FileText;
  if (metricKey.includes('meeting')) return CalendarDays;
  if (metricKey.includes('ai_')) return Zap;
  return Activity;
}

function autoMap(headers: string[], fields: { required: string[]; optional: string[] }): Record<string, string> {
  const result: Record<string, string> = {};
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedHeaders = new Map(headers.map((header) => [normalize(header), header]));
  for (const field of [...fields.required, ...fields.optional]) {
    const direct = normalizedHeaders.get(normalize(field));
    if (direct) result[field] = direct;
  }
  return result;
}

function errorMessage(error: unknown, fallback: string): string {
  if (isRecord(error) && isRecord(error.response)) {
    const responseData = error.response.data;
    if (isRecord(responseData)) {
      const nested = isRecord(responseData.data) ? responseData.data : responseData;
      if (typeof nested.message === 'string') return nested.message;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border bg-card ${className}`}>
      {children as unknown as React.ReactNode}
    </section>
  );
}
function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {action as unknown as React.ReactNode}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = status === 'on_track' ? 'On track' : status === 'behind' ? 'Behind' : status === 'insufficient_data' ? 'Insufficient data' : humanize(status);
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize tracking-wide ${statusClasses(status)}`}>{label}</span>;
}

const HEADLINE_ORDER = ['revenue', 'gross_profit', 'mrr', 'arr', 'net_revenue', 'operating_result', 'cost_of_goods_sold', 'operating_expense'];

/** Four headline KPIs for a currency: available ones first, in a fixed order. */
function pickHeadline(metrics: ExecutiveMetric[]): ExecutiveMetric[] {
  const ordered = HEADLINE_ORDER
    .map((key) => metrics.find((metric) => metric.metricKey === key))
    .filter((metric): metric is ExecutiveMetric => Boolean(metric));
  const isAvailable = (metric: ExecutiveMetric) => metric.status !== 'unavailable' && metric.value !== null;
  return [...ordered.filter(isAvailable), ...ordered.filter((metric) => !isAvailable(metric))].slice(0, 4);
}

/** Metrics where a rise is bad news (costs and losses). */
const LOWER_IS_BETTER = new Set(['refund', 'cost_of_goods_sold', 'operating_expense', 'acquisition_cost', 'tax', 'capital_expenditure', 'closed_lost']);

function sparkTone(metricKey: string): SparkTone {
  if (metricKey === 'mrr' || metricKey === 'arr') return 'chart-2';
  if (metricKey === 'gross_profit' || metricKey === 'operating_result' || metricKey === 'net_revenue') return 'chart-4';
  if (LOWER_IS_BETTER.has(metricKey)) return 'chart-5';
  return 'chart-1';
}

function formatMonthLabel(value: string): string {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
}

function formatCompactMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(value);
  } catch {
    return `${currency} ${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`;
  }
}

/** Latest month against the month before it. */
function monthOverMonth(points: Array<{ label: string; value: number }>) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const previous = points[points.length - 2];
  if (last.value === 0 && previous.value === 0) return null;
  const pct = previous.value === 0 ? null : ((last.value - previous.value) / Math.abs(previous.value)) * 100;
  const direction: 'up' | 'down' | 'flat' = last.value > previous.value ? 'up' : last.value < previous.value ? 'down' : 'flat';
  return { pct, direction, previousLabel: formatMonthLabel(previous.label).split(' ')[0] };
}

function MetricCard({ metric, compact = false, featured = false }: { metric: ExecutiveMetric; compact?: boolean; featured?: boolean }) {
  const Icon = metricIcon(metric.metricKey);
  const available = metric.status !== 'unavailable' && metric.value !== null;
  const edge = !available ? 'hsl(var(--muted-foreground) / 0.4)' : metric.status === 'estimated' ? 'hsl(var(--chart-5))' : `hsl(var(--${sparkTone(metric.metricKey)}))`;
  const trend = (metric.trend ?? []).filter((point) => Number.isFinite(point.value));
  const change = monthOverMonth(trend);
  const lowerIsBetter = LOWER_IS_BETTER.has(metric.metricKey);
  const good = change && change.direction !== 'flat' && (change.direction === 'up') !== lowerIsBetter;
  const bad = change && change.direction !== 'flat' && !good;
  const ChangeIcon = !change || change.direction === 'flat' ? Minus : change.direction === 'up' ? ArrowUpRight : ArrowDownRight;
  const formatTrendValue = (value: number) => (metric.currency ? formatMoney(value, metric.currency) : formatNumber(value));
  const target = metric.targetProgressPct;
  return (
    <div className={`lm-panel lm-panel-interactive group relative ${compact ? 'p-3.5' : 'p-4'}`}>
      <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: edge }} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{metric.label}</p>
          <p className={`mt-2 truncate font-mono font-medium tabular-nums tracking-tight ${available ? 'text-foreground' : 'text-muted-foreground'} ${featured ? 'text-[1.75rem] leading-9' : compact ? 'text-xl' : 'text-2xl'}`}>
            {formatMetricValue(metric)}
          </p>
        </div>
        <Icon size={15} className="mt-0.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
      </div>
      {trend.length > 1 && (
        <div className="relative mt-3">
          <AreaSparkline
            points={trend}
            tone={available ? sparkTone(metric.metricKey) : 'muted-foreground'}
            height={featured ? 56 : 42}
            label={`${metric.label}, monthly`}
            formatValue={formatTrendValue}
            formatLabel={formatMonthLabel}
          />
          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">{formatMonthLabel(trend[0].label)} – {formatMonthLabel(trend[trend.length - 1].label)}</span>
            {change && (
              <span className="inline-flex shrink-0 items-center gap-1">
                <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${good ? 'text-emerald-700 dark:text-emerald-300' : bad ? 'text-rose-700 dark:text-rose-300' : 'text-muted-foreground'}`}>
                  <ChangeIcon size={13} aria-hidden="true" />
                  {change.pct === null ? 'New' : `${change.pct > 0 ? '+' : ''}${formatNumber(change.pct, 1)}%`}
                </span>
                <span>vs {change.previousLabel}</span>
              </span>
            )}
          </div>
        </div>
      )}
      {metric.targetStatus ? (
        <div className="relative mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Target progress</span>
            <span className="font-mono text-foreground/80">{target === null || target === undefined ? '—' : `${formatNumber(target)}%`}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, Number(target ?? 0)))}%` }} />
          </div>
        </div>
      ) : null}
      <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <StatusPill status={metric.status} />
        <span className="text-xs text-muted-foreground">{formatNumber(metric.sampleSize ?? 0, 0)} records</span>
      </div>
      {metric.note ? <p className="relative mt-2 text-xs leading-4 text-muted-foreground">{metric.note}</p> : null}
    </div>
  );
}

function FinancialCandidateReview() {
  const queryClient = useQueryClient();
  const candidatesQuery = useQuery({
    queryKey: ['executive-intelligence', 'financial-candidates', 'pending'],
    queryFn: async () => {
      const payload = unwrapRecord((await api.get('/executive-intelligence/financial-candidates', {
        params: { status: 'pending', limit: 50 },
      })).data);
      if (!Array.isArray(payload.data)) {
        throw new Error('The financial-candidate API returned an unexpected response.');
      }
      return payload.data.filter(isRecord) as unknown as FinancialCandidate[];
    },
  });
  const reviewMutation = useMutation({
    mutationFn: async (input: { candidateId: string; action: 'approve' | 'reject'; reason?: string }) => {
      if (input.action === 'approve') {
        await api.post(`/executive-intelligence/financial-candidates/${input.candidateId}/approve`);
      } else {
        await api.post(`/executive-intelligence/financial-candidates/${input.candidateId}/reject`, {
          reason: input.reason,
        });
      }
    },
    onSuccess: async (_result, input) => {
      toast.success(input.action === 'approve'
        ? 'Candidate approved and committed through Executive Intelligence validation.'
        : 'Financial candidate rejected.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['executive-intelligence', 'financial-candidates'] }),
        queryClient.invalidateQueries({ queryKey: ['executive-intelligence'] }),
      ]);
    },
    onError: (error) => toast.error(errorMessage(error, 'Candidate review failed.')),
  });

  return (
    <section>
      <SectionHeading
        title="Financial candidates"
        description="Document-derived transaction suggestions remain non-authoritative until an owner/admin reviews the cited passage."
      />
      <Panel className="p-4 sm:p-5">
        {candidatesQuery.isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" size={15} /> Loading evidence-backed candidates…
          </div>
        ) : candidatesQuery.isError ? (
          <div className="flex items-center justify-between gap-3 py-2">
            <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
              {errorMessage(candidatesQuery.error, 'Financial candidates could not be loaded.')}
            </p>
            <button type="button" onClick={() => void candidatesQuery.refetch()} className="text-xs font-semibold text-primary">
              Retry
            </button>
          </div>
        ) : candidatesQuery.data?.length ? (
          <div className="space-y-3">
            {candidatesQuery.data.map((candidate) => (
              <article key={candidate.id} id={'financial-' + candidate.id} className="scroll-mt-6 rounded-xl border border-border bg-muted/50 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {humanize(candidate.transaction_type)} · {candidate.currency} {formatNumber(Number(candidate.amount))}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {candidate.transaction_date} · {candidate.document_name} · confidence {formatNumber(Number(candidate.confidence) * 100, 0)}%
                    </p>
                    <blockquote className="mt-3 border-l-2 border-primary/50 pl-3 text-xs leading-5 text-foreground/80">
                      {candidate.evidence_excerpt}
                    </blockquote>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ candidateId: candidate.id, action: 'approve' })}
                      className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                    >
                      Approve & commit
                    </button>
                    <button
                      type="button"
                      disabled={reviewMutation.isPending}
                      onClick={() => {
                        const reason = window.prompt('Why is this financial candidate being rejected?');
                        if (reason?.trim()) reviewMutation.mutate({ candidateId: candidate.id, action: 'reject', reason });
                      }}
                      className="rounded-lg border border-rose-400/20 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="py-3 text-sm text-muted-foreground">
            No pending candidates. New suggestions appear only when a source passage contains an explicit date, currency amount and transaction type.
          </p>
        )}
      </Panel>
    </section>
  );
}

export default function ExecutiveIntelligencePage() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div role="status" className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">Loading workspace access…</div>;
  if (!user) return <div className="mx-auto max-w-4xl p-6 text-sm">Workspace access could not be confirmed. <Link href="/login" className="underline">Sign in</Link></div>;
  if (!['owner', 'admin'].includes(user.role.toLowerCase())) {
    return <section className="mx-auto max-w-4xl rounded-2xl border border-border bg-card p-6 sm:p-8">
      <LockKeyhole className="mb-4 h-6 w-6 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Executive Intelligence</h1>
      <p className="mt-2 text-sm text-muted-foreground">Financial reporting is available to organisation owners and administrators.</p>
      <Link href="/analytics" className="mt-5 inline-block rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white">Open workspace analytics</Link>
    </section>;
  }
  const account = user.organizationId + '/' + user.id;
  return <ExecutiveWorkspace key={account} account={account} />;
}

function ExecutiveWorkspace({ account }: { account: string }) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(initialPeriod);
  const [draftPeriod, setDraftPeriod] = useState(initialPeriod);
  const [view, setView] = useState<'overview' | 'financials' | 'targets' | 'sources'>('overview');
  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('view');
    if (tab === 'sources' || tab === 'financials') setView(tab);
  }, []);
  const todayUtc = dateInputValue(new Date());
  const rangeLength = Date.parse(draftPeriod.endDate) - Date.parse(draftPeriod.startDate);
  const validPeriod = rangeLength >= 0 && rangeLength <= 3660 * 86_400_000 && draftPeriod.endDate <= todayUtc;
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);
  const [datasetType, setDatasetType] = useState<DatasetType>('transactions');
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mappingInitializedFor, setMappingInitializedFor] = useState<string | null>(null);
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetForm, setTargetForm] = useState<TargetForm>(() => {
    const dates = initialPeriod();
    return {
      metricKey: 'revenue', targetValue: '', currency: 'USD', targetPeriod: 'monthly',
      periodStart: dates.startDate, periodEnd: dates.endDate, direction: 'higher_is_better',
      alertThresholdPct: '10', minimumSampleSize: '1',
    };
  });

  const dashboardQuery = useQuery<ExecutiveDashboard>({
    queryKey: ['executive-intelligence', 'dashboard', account, period.startDate, period.endDate],
    queryFn: async ({ signal }) => {
      const payload = unwrapRecord((await api.get('/executive-intelligence/dashboard', {
        signal, params: { startDate: period.startDate, endDate: period.endDate },
      })).data);
      if (!Array.isArray(payload.metrics) || !Array.isArray(payload.alerts)) {
        throw new Error('The reporting service returned an incomplete dashboard response.');
      }
      return payload as unknown as ExecutiveDashboard;
    },
    retry: 1,
    staleTime: 30_000,
  });

  const importsQuery = useQuery<ImportSummary[]>({
    queryKey: ['executive-intelligence', 'imports', account],
    enabled: view === 'sources',
    queryFn: async () => {
      const payload = unwrapRecord((await api.get('/executive-intelligence/imports', { params: { page: 1, pageSize: 12 } })).data);
      const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.items) ? payload.items : [];
      return rows.filter(isRecord) as unknown as ImportSummary[];
    },
    staleTime: 20_000,
  });

  const targetsQuery = useQuery<TargetRecord[]>({
    queryKey: ['executive-intelligence', 'targets', account],
    queryFn: async () => unwrapArray((await api.get('/executive-intelligence/targets')).data) as unknown as TargetRecord[],
    staleTime: 30_000,
  });

  const importDetailQuery = useQuery<ImportDetail>({
    queryKey: ['executive-intelligence', 'import', account, selectedImportId],
    queryFn: async () => unwrapRecord((await api.get(`/executive-intelligence/imports/${selectedImportId}`)).data) as unknown as ImportDetail,
    enabled: view === 'sources' && Boolean(selectedImportId),
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: DatasetType }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('datasetType', type);
      const response = await api.post('/executive-intelligence/imports', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return unwrapRecord(response.data) as unknown as UploadResult;
    },
    onSuccess: (result) => {
      setSelectedImportId(result.id);
      setMapping(autoMap(result.headers ?? [], DATASET_FIELDS[result.datasetType]));
      setMappingInitializedFor(result.id);
      setConfirmPartial(false);
      void queryClient.invalidateQueries({ queryKey: ['executive-intelligence', 'imports'] });
      toast.success('Import staged. Review the column mapping before validation.');
    },
    onError: (error) => toast.error(errorMessage(error, 'The file could not be staged.')),
  });

  const validateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.post(`/executive-intelligence/imports/${id}/validate`, { mapping });
      return unwrapRecord(response.data);
    },
    onSuccess: async () => {
      setConfirmPartial(false);
      await Promise.all([
        importDetailQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['executive-intelligence', 'imports'] }),
      ]);
      toast.success('Validation completed. Review valid, invalid and duplicate rows.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Import validation failed.')),
  });

  const commitMutation = useMutation({
    mutationFn: async ({ id, partial }: { id: string; partial: boolean }) => {
      const response = await api.post(`/executive-intelligence/imports/${id}/commit`, { confirmPartial: partial });
      return unwrapRecord(response.data);
    },
    onSuccess: async () => {
      await Promise.all([
        importDetailQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['executive-intelligence', 'imports'] }),
        queryClient.invalidateQueries({ queryKey: ['executive-intelligence', 'dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['executive-intelligence', 'targets'] }),
        queryClient.invalidateQueries({ queryKey: ['executive-intelligence', 'scorecard'] }),
        queryClient.invalidateQueries({ queryKey: ['executive-intelligence', 'cash-forecasts'] }),
      ]);
      toast.success('Import committed. Executive metrics are refreshing.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Import could not be committed.')),
  });

  const targetMutation = useMutation({
    mutationFn: async () => {
      const currencyScoped = CURRENCY_METRICS.has(targetForm.metricKey);
      const unit = targetForm.metricKey === 'mrr_growth_pct'
        ? '%'
        : currencyScoped
          ? targetForm.currency.trim().toUpperCase()
          : (METRIC_UNITS[targetForm.metricKey] ?? 'value');
      const payload = {
        metricKey: targetForm.metricKey,
        targetValue: Number(targetForm.targetValue),
        unit,
        currency: currencyScoped ? targetForm.currency.trim().toUpperCase() : undefined,
        targetPeriod: targetForm.targetPeriod,
        periodStart: targetForm.periodStart,
        periodEnd: targetForm.periodEnd,
        direction: targetForm.direction,
        alertThresholdPct: targetForm.alertThresholdPct === '' ? null : Number(targetForm.alertThresholdPct),
        minimumSampleSize: Number(targetForm.minimumSampleSize),
      };
      return unwrapRecord((await api.post('/executive-intelligence/targets', payload)).data);
    },
    onSuccess: async () => {
      setTargetModalOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['executive-intelligence', 'targets'] }),
        queryClient.invalidateQueries({ queryKey: ['executive-intelligence', 'scorecard'] }),
        queryClient.invalidateQueries({ queryKey: ['executive-intelligence', 'cash-forecasts'] }),
        queryClient.invalidateQueries({ queryKey: ['executive-intelligence', 'dashboard'] }),
      ]);
      toast.success('KPI target created.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Target could not be created.')),
  });

  useEffect(() => {
    const detail = importDetailQuery.data;
    if (!detail || mappingInitializedFor === detail.id) return;
    const existing = isRecord(detail.column_mapping) ? detail.column_mapping : {};
    const nextMapping = Object.keys(existing).length
      ? Object.fromEntries(Object.entries(existing).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      : autoMap(detail.source_headers ?? [], DATASET_FIELDS[detail.dataset_type]);
    setMapping(nextMapping);
    setMappingInitializedFor(detail.id);
  }, [importDetailQuery.data, mappingInitializedFor]);

  const dashboard = dashboardQuery.data;
  const metrics = Array.isArray(dashboard?.metrics) ? dashboard.metrics : [];
  const financialCategories = ['Financial performance', 'Recurring revenue', 'Sales pipeline'];
  const financialMetrics = metrics.filter((metric) => financialCategories.includes(metric.category));
  const currencies = Array.from(new Set(financialMetrics.flatMap((metric) => metric.currency ? [metric.currency] : []))).sort();
  const activeCurrency = currencies.includes(currencyFilter) ? currencyFilter : currencies[0];
  const financialGroups = financialMetrics.filter((metric) => (metric.currency ?? undefined) === activeCurrency).reduce<Record<string, ExecutiveMetric[]>>((groups, metric) => {
      (groups[metric.currency ?? 'Currency not specified'] ??= []).push(metric);
      return groups;
    }, {});
  const operationalMetrics = metrics.filter((metric) => metric.category === 'Operations' && !['tasks_completed', 'meetings_completed', 'documents_indexed'].includes(metric.metricKey));
  const aiMetrics = metrics.filter((metric) => metric.category === 'AI economics' && metric.metricKey !== 'ai_operations');
  const pulseMetrics = pickHeadline(financialMetrics.filter((metric) => metric.currency === activeCurrency))
    .filter((metric) => metric.status !== 'unavailable' && metric.value !== null);
  const signalMetrics = ['tasks_completed', 'meetings_completed', 'documents_indexed', 'ai_operations']
    .map((key) => metrics.find((metric) => metric.metricKey === key))
    .filter((metric): metric is ExecutiveMetric => Boolean(metric));
  const alerts = dashboard?.alerts ?? [];
  const imports = importsQuery.data ?? [];
  const targets = targetsQuery.data ?? [];
  const importDetail = importDetailQuery.data;
  const mappingFields = importDetail ? DATASET_FIELDS[importDetail.dataset_type] : DATASET_FIELDS[datasetType];
  const mappedRequiredCount = mappingFields.required.filter((field) => isMapped(mapping[field])).length;
  const validRows = importDetail?.valid_row_count ?? 0;
  const skippedRows = (importDetail?.invalid_row_count ?? 0) + (importDetail?.duplicate_row_count ?? 0);
  const canCommit = importDetail?.status === 'validated' && validRows > 0 && (skippedRows === 0 || confirmPartial);

  const refreshAll = async () => {
    await Promise.all([
      dashboardQuery.refetch(),
      targetsQuery.refetch(),
    ]);
  };

  const exportReport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    setExporting(format);
    try {
      const response = await api.get(`/executive-intelligence/reports/${format}`, {
        params: { startDate: period.startDate, endDate: period.endDate },
        responseType: 'blob',
      });
      const mime = format === 'pdf'
        ? 'application/pdf'
        : format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv;charset=utf-8';
      const blob = new Blob([response.data], { type: mime });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `lumorius-executive-report-${period.startDate}-to-${period.endDate}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1500);
      toast.success(`${format.toUpperCase()} report generated.`);
    } catch (error) {
      toast.error(errorMessage(error, `The ${format.toUpperCase()} export failed.`));
    } finally {
      setExporting(null);
    }
  };

  const openImport = (id: string) => {
    setSelectedImportId(id);
    setMapping({});
    setMappingInitializedFor(null);
    setConfirmPartial(false);
  };

  const updateTargetField = (field: keyof TargetForm, value: string) => {
    setTargetForm((current) => ({ ...current, [field]: value }));
  };

  const currencyScopedTarget = CURRENCY_METRICS.has(targetForm.metricKey);
  const targetUnit = targetForm.metricKey === 'mrr_growth_pct'
    ? '%'
    : currencyScopedTarget
      ? targetForm.currency.trim().toUpperCase() || 'Currency required'
      : (METRIC_UNITS[targetForm.metricKey] ?? 'value');

  return (
    <div className="relative min-h-full text-foreground">
      <main className="relative mx-auto w-full max-w-[1680px] space-y-7">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Executive Intelligence</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{dashboard?.organizationName ?? 'Workspace reporting'} <span aria-hidden="true">·</span> {formatCompactDate(period.startDate)} – {formatCompactDate(period.endDate)} UTC</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['pdf', 'xlsx', 'csv'] as const).map((format) => (
              <button key={format} type="button" onClick={() => void exportReport(format)}
                disabled={Boolean(exporting) || (format === 'pdf' && metrics.length > 150) || !dashboard}
                title={format === 'pdf' && metrics.length > 150 ? 'Shorten the reporting period or export as CSV or XLSX' : undefined}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold  text-foreground/90 hover:bg-muted disabled:opacity-40">
                {exporting === format ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {format}
              </button>
            ))}
          </div>
        </header>

        <nav aria-label="Executive Intelligence views" className="flex flex-wrap gap-1 border-b border-border">
          {([['overview', 'Overview'], ['financials', 'Financials'], ['targets', 'KPI targets'], ['sources', 'Data sources']] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
              className={`border-b-2 px-3 py-2.5 text-sm font-medium ${id === view ? 'border-indigo-400 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{label}</button>
          ))}
        </nav>

        {(view === 'overview' || view === 'financials') && (
          <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3" onSubmit={(event) => {
            event.preventDefault();
            if (validPeriod) setPeriod(draftPeriod);
          }}>
            <div className="flex flex-wrap gap-1.5 self-center" aria-label="Reporting period presets">
              {[30, 90, 365].map((days) => <button key={days} type="button" onClick={() => {
                const range = initialPeriod(days);
                setDraftPeriod(range);
                setPeriod(range);
              }} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground/90 hover:bg-muted">{days} days</button>)}
            </div>
            <label className="block flex-1 text-xs font-medium text-muted-foreground sm:flex-none">From
              <input type="date" required value={draftPeriod.startDate} max={draftPeriod.endDate || todayUtc}
                onChange={(e) => setDraftPeriod((current) => ({ ...current, startDate: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground/90" />
            </label>
            <label className="block flex-1 text-xs font-medium text-muted-foreground sm:flex-none">To
              <input type="date" required value={draftPeriod.endDate} min={draftPeriod.startDate || undefined} max={todayUtc}
                onChange={(e) => setDraftPeriod((current) => ({ ...current, endDate: e.target.value }))}
                className="mt-1 block w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground/90" />
            </label>
            <button type="submit" disabled={!validPeriod} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-40">Apply range</button>
            <button type="button" disabled={dashboardQuery.isFetching} onClick={() => void refreshAll()} aria-label="Refresh reporting data" className="rounded-lg border border-border p-2.5 text-foreground/80 hover:bg-muted disabled:opacity-50"><RefreshCw size={15} className={dashboardQuery.isFetching ? 'animate-spin' : ''} /></button>
            {!validPeriod && <p className="w-full text-xs text-amber-700 dark:text-amber-300">Choose a valid UTC date range of up to 10 years, ending today or earlier.</p>}
          </form>
        )}

        {(view === 'overview' || view === 'financials') && (dashboardQuery.isLoading ? (
          <Panel className="flex min-h-72 items-center justify-center p-8"><div className="text-center"><Loader2 className="mx-auto mb-3 animate-spin text-primary" size={26} /><p className="text-sm font-medium text-foreground/80">Synchronising executive data</p><p className="mt-1 text-sm text-muted-foreground">Loading governed KPIs, targets and source records.</p></div></Panel>
        ) : dashboardQuery.isError ? (
          <Panel className="p-6 sm:p-8">
            <div className="mx-auto max-w-xl text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 text-rose-700 dark:text-rose-300"><LockKeyhole size={21} /></div>
              <h2 className="text-lg font-semibold text-foreground">Executive data unavailable</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{errorMessage(dashboardQuery.error, 'The API did not return Executive Intelligence data.')}</p>
              <button type="button" onClick={() => void dashboardQuery.refetch()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-primary/90"><RefreshCw size={13} /> Retry connection</button>
            </div>
          </Panel>
        ) : dashboard ? (
          <>
            {view === 'overview' && <section>
              <SectionHeading title="Activity in this period" />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {signalMetrics.length ? signalMetrics.map((metric) => <MetricCard key={metric.key} metric={metric} />) : (
                  <Panel className="col-span-full p-5"><p className="text-sm text-muted-foreground">Operational indicators will appear when source activity is available.</p></Panel>
                )}
              </div>
            </section>}

            {view === 'overview' && pulseMetrics.length > 0 && <section>
              <SectionHeading
                title={`Financial pulse · ${activeCurrency}`}
                description={dashboard.trendWindow
                  ? `Values cover the selected period. Lines show each month from ${formatMonthLabel(dashboard.trendWindow.start.slice(0, 7))} to ${formatMonthLabel(dashboard.trendWindow.end.slice(0, 7))}.`
                  : 'Values cover the selected period.'}
                action={<button type="button" onClick={() => setView('financials')} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/90 hover:bg-muted">Monthly analytics <ChevronRight size={13} /></button>}
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {pulseMetrics.map((metric) => <MetricCard key={metric.key} metric={metric} featured />)}
              </div>
            </section>}

            {view === 'financials' && <section>
              <CashForecast />
              <SectionHeading
                title="Performance by currency"
                description="Imported transactions, customer contracts and sales opportunities. Amounts are never combined across currencies."
                action={(
                  <label className="flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3">
                    <Filter size={12} className="text-muted-foreground" />
                    <select aria-label="Financial reporting currency" value={activeCurrency ?? ''} onChange={(event) => setCurrencyFilter(event.target.value)} className="max-w-[170px] bg-transparent text-xs font-semibold text-foreground/90 outline-none">
                      {!activeCurrency && <option value="">No currency recorded</option>}
                      {currencies.map((currency) => <option key={currency} value={currency} className="bg-card">{currency}</option>)}
                    </select>
                    <ChevronDown size={12} className="text-muted-foreground" />
                  </label>
                )}
              />
              {Object.keys(financialGroups).length ? (
                <div className="space-y-4">
                  {Object.entries(financialGroups).map(([currency, currencyMetrics]) => {
                    const headline = pickHeadline(currencyMetrics);
                    const others = currencyMetrics.filter((metric) => !headline.includes(metric));
                    const series = dashboard.monthlySeries?.find((item) => item.currency === currency);
                    return (
                      <div key={currency} className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary"><CircleDollarSign size={15} /></span><div><p className="text-sm font-semibold text-foreground">{currency}</p><p className="text-xs text-muted-foreground">Reporting currency</p></div></div>
                          <span className="text-xs font-medium text-muted-foreground">{currencyMetrics.length} indicators</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {headline.map((metric) => <MetricCard key={metric.key} metric={metric} featured />)}
                        </div>
                        {series ? <RevenueAnalytics series={series} /> : null}
                        {others.length > 0 && (
                          <div>
                            <h3 className="mb-3 text-sm font-semibold text-foreground">All indicators</h3>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                              {others.map((metric) => <MetricCard key={metric.key} metric={metric} compact />)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Panel className="p-6"><div className="flex flex-col items-center text-center"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground"><Database size={19} /></div><p className="text-sm font-medium text-foreground">No committed financial records</p><p className="mt-1 max-w-lg text-sm leading-5 text-muted-foreground">Upload a transaction, contract or pipeline dataset below. Financial KPIs populate only after validation and an explicit commit.</p></div></Panel>
              )}
            </section>}

            {view === 'overview' && <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
              <section>
                <SectionHeading title="Operational performance" description="Task throughput, knowledge ingestion, meetings and project activity." />
                {operationalMetrics.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {operationalMetrics.map((metric) => <MetricCard key={metric.key} metric={metric} compact />)}
                  </div>
                ) : <Panel className="p-5"><p className="text-sm text-muted-foreground">No operational metrics were returned for this period.</p></Panel>}
                {aiMetrics.length ? (
                  <div className="mt-5">
                    <SectionHeading title="Usage and cost governance" description="Only usage with an effective pricing record contributes to priced AI expenditure." />
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{aiMetrics.map((metric) => <MetricCard key={metric.key} metric={metric} compact />)}</div>
                  </div>
                ) : null}
              </section>

              <section>
                <SectionHeading title="Target alerts" description="Threshold breaches are surfaced only when the configured sample size is met." />
                <Panel className="p-4">
                  <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold  text-muted-foreground">Current period</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${alerts.length ? 'bg-amber-400/10 text-amber-700 dark:text-amber-300' : 'bg-emerald-400/10 text-emerald-700 dark:text-emerald-300'}`}>{alerts.length} active</span></div>
                  {alerts.length ? (
                    <div className="space-y-2.5">{alerts.map((alert, index) => (
                      <div key={`${alert.metricKey}-${alert.currency ?? 'none'}-${index}`} className="rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-3.5">
                        <div className="flex items-start gap-2.5"><span className="mt-0.5 text-amber-700 dark:text-amber-300"><AlertTriangle size={15} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-foreground">{alert.label}{alert.currency ? ` · ${alert.currency}` : ''}</p><span className="text-xs font-bold text-amber-700 dark:text-amber-300">{formatNumber(alert.gapPct)}% gap</span></div><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{alert.message}</p></div></div>
                      </div>
                    ))}</div>
                  ) : (
                    <div className="flex min-h-40 flex-col items-center justify-center text-center"><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-700 dark:text-emerald-300"><Check size={17} /></div><p className="text-sm font-semibold text-foreground/90">No threshold breaches</p><p className="mt-1 max-w-[230px] text-xs leading-4 text-muted-foreground">No configured alert crossed its threshold with sufficient sample data.</p></div>
                  )}
                </Panel>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-card p-3.5"><p className="text-xs font-semibold  text-muted-foreground">Configured targets</p><p className="mt-1.5 text-2xl font-semibold text-foreground">{(targetsQuery.data ? targets.length : '—')}</p><p className="mt-1 text-xs text-muted-foreground">Organisation-wide</p></div>
                  <div className="rounded-xl border border-border bg-card p-3.5"><p className="text-xs font-semibold  text-muted-foreground">Data sources</p><p className="mt-1.5 text-2xl font-semibold text-foreground">{dashboard.sources?.length ?? 0}</p><p className="mt-1 text-xs text-muted-foreground">With source records</p></div>
                </div>
              </section>
            </div>}
          </>
        ) : null)}

        {view === 'targets' && (
            <section>
              <div className="mb-8"><KpiScorecard title="Target progress" showManageLink={false} description="Live actuals for every target over its own period, from committed records. The Analytics page shows the same results." /></div>
              <SectionHeading
                title="KPI target register"
                description="Targets are scoped to a metric, period and currency where applicable. Owner and alert thresholds are retained in the audit trail."
                action={<button type="button" onClick={() => setTargetModalOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-indigo-500 px-3.5 text-xs font-semibold text-white shadow-[0_8px_25px_-12px_rgba(66,84,245,0.9)] transition hover:bg-primary/90"><Plus size={13} /> Create target</button>}
              />
              <Panel className="overflow-hidden">
                {targetsQuery.isLoading ? <div className="p-5 text-sm text-muted-foreground">Loading target register…</div> : targetsQuery.isError ? (
                  <div className="p-5 text-sm text-foreground/80">KPI targets could not be loaded. <button type="button" onClick={() => void targetsQuery.refetch()} className="underline">Retry</button></div>
                ) : targets.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-left">
                      <thead className="border-b border-border bg-muted/50"><tr>{['Metric', 'Target', 'Reporting period', 'Direction', 'Alert threshold', 'Owner'].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-semibold  text-muted-foreground">{heading}</th>)}</tr></thead>
                      <tbody className="divide-y divide-white/[0.05]">{targets.map((target) => (
                        <tr key={target.id} className="transition hover:bg-muted">
                          <td className="px-4 py-3"><p className="text-sm font-semibold text-foreground/90">{humanize(target.metric_key)}{target.currency ? <span className="ml-1.5 text-xs text-primary">{target.currency}</span> : null}</p><p className="mt-0.5 text-xs text-muted-foreground">{target.target_period}</p></td>
                          <td className="px-4 py-3 text-sm font-semibold text-foreground">{formatNumber(Number(target.target_value))} <span className="text-xs font-normal text-muted-foreground">{target.unit}</span></td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{formatCompactDate(target.period_start)} — {formatCompactDate(target.period_end)}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{target.direction === 'higher_is_better' ? 'Higher is better' : 'Lower is better'}</td>
                          <td className="px-4 py-3 text-sm text-foreground/80">{target.alert_threshold_pct === null || target.alert_threshold_pct === undefined ? 'Not set' : `${formatNumber(Number(target.alert_threshold_pct))}%`}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{target.owner_name || 'Unassigned'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex min-h-44 flex-col items-center justify-center p-6 text-center"><Target className="mb-2 text-muted-foreground" size={22} /><p className="text-sm font-semibold text-foreground/90">No KPI targets configured</p><p className="mt-1 text-xs text-muted-foreground">Create a target to enable progress tracking and threshold alerts.</p></div>
                )}
              </Panel>
            </section>
        )}

        {view === 'sources' && <>
            <FinancialCandidateReview />

            <section>
              <SectionHeading title="Import centre" description="Stage a CSV or XLSX source, map columns, validate every row and explicitly commit approved records." />
              <div className="grid gap-4 2xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.28fr)]">
                <Panel className="p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-indigo-500/10 text-primary"><Upload size={17} /></div><div><p className="text-sm font-semibold text-white">Stage a new import</p><p className="text-xs text-muted-foreground">CSV / XLSX · 10 MB maximum</p></div></div>
                  <label className="mb-2 block text-xs font-semibold  text-muted-foreground">Dataset type</label>
                  <select value={datasetType} onChange={(event) => setDatasetType(event.target.value as DatasetType)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground/90 outline-none focus:border-primary/60">
                    <option value="transactions" className="bg-card">Financial transactions</option>
                    <option value="contracts" className="bg-card">Customer contracts / recurring revenue</option>
                    <option value="pipeline" className="bg-card">Sales pipeline opportunities</option>
                    <option value="campaigns" className="bg-card">Marketing campaign performance</option>
                    <option value="cash" className="bg-card">Monthly cash balances and movements</option>
                  </select>
                  <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadMutation.mutate({ file, type: datasetType }); event.currentTarget.value = ''; }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} className="mt-3 flex min-h-36 w-full flex-col items-center justify-center rounded-xl border border-dashed border-primary/30 bg-indigo-500/[0.045] px-4 text-center transition hover:border-primary/60 hover:bg-indigo-500/[0.08] disabled:opacity-50">
                    {uploadMutation.isPending ? <Loader2 className="mb-2 animate-spin text-primary" size={22} /> : <Upload className="mb-2 text-primary" size={22} />}
                    <span className="text-sm font-semibold text-foreground/90">{uploadMutation.isPending ? 'Staging source file…' : 'Select source file'}</span>
                    <span className="mt-1 text-xs text-muted-foreground">Choose a CSV or XLSX file from your device</span>
                  </button>
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold  text-muted-foreground">Recent imports</p><span className="text-xs text-muted-foreground">{imports.length} shown</span></div>
                    {importsQuery.isLoading ? <p className="py-3 text-xs text-muted-foreground">Loading import history…</p> : importsQuery.isError ? <p className="py-3 text-xs text-foreground/80">Import history could not be loaded. <button type="button" onClick={() => void importsQuery.refetch()} className="underline">Retry</button></p> : imports.length ? (
                      <div className="space-y-1.5">{imports.slice(0, 8).map((item) => (
                        <button type="button" key={item.id} onClick={() => openImport(item.id)} className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${selectedImportId === item.id ? 'border-primary/35 bg-indigo-500/[0.09]' : 'border-white/[0.055] bg-muted/50 hover:border-white/[0.12] hover:bg-muted/50'}`}>
                          <FileSpreadsheet size={15} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-foreground/80">{item.file_name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{humanize(item.dataset_type)} · {item.row_count} rows</span></span><StatusPill status={item.status} /><ChevronRight size={12} className="shrink-0 text-muted-foreground" />
                        </button>
                      ))}</div>
                    ) : <p className="py-3 text-xs text-muted-foreground">No imports have been staged.</p>}
                  </div>
                </Panel>

                <Panel className="min-w-0 overflow-hidden">
                  <div className="flex flex-col justify-between gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:px-5">
                    <div><p className="text-sm font-semibold text-foreground">Import review workspace</p><p className="mt-1 text-xs text-muted-foreground">Column mapping · validation results · explicit commit</p></div>
                    {importDetail ? <StatusPill status={importDetail.status} /> : null}
                  </div>
                  {!selectedImportId ? (
                    <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center"><Layers3 className="mb-3 text-muted-foreground" size={25} /><p className="text-sm font-semibold text-foreground/80">No import selected</p><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">Stage a new source file or select an import from the history to inspect its mapping and validation state.</p></div>
                  ) : importDetailQuery.isLoading ? (
                    <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin text-primary" size={22} /></div>
                  ) : importDetailQuery.isError || !importDetail ? (
                    <div className="p-6"><p className="text-sm text-rose-700 dark:text-rose-300">{errorMessage(importDetailQuery.error, 'Import details could not be loaded.')}</p><button type="button" onClick={() => void importDetailQuery.refetch()} className="mt-3 text-xs font-semibold text-primary">Retry import details</button></div>
                  ) : (
                    <div className="space-y-5 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{importDetail.file_name}</p><p className="mt-1 text-xs text-muted-foreground">{humanize(importDetail.dataset_type)} · {importDetail.row_count} source rows · preview limit {importDetail.previewLimit}</p></div>
                        <button type="button" onClick={() => void importDetailQuery.refetch()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted"><RefreshCw size={11} /> Reload</button>
                      </div>

                      {importDetail.status !== 'committed' ? (
                        <div>
                          <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold text-foreground">1. Map source columns</p><p className="mt-1 text-xs text-muted-foreground">Pick the column for each field. If your file has no column for a field (for example Currency), choose “Same value for every row”.</p></div><span className="text-xs font-semibold text-muted-foreground">{mappedRequiredCount}/{mappingFields.required.length} required</span></div>
                          <ImportMapping
                            fields={mappingFields}
                            headers={importDetail.source_headers ?? []}
                            mapping={mapping}
                            onChange={setMapping}
                          />
                          <button type="button" onClick={() => validateMutation.mutate(importDetail.id)} disabled={validateMutation.isPending || mappedRequiredCount !== mappingFields.required.length} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">{validateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Validate all rows</button>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3.5"><div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={15} /><p className="text-sm font-semibold">Import committed</p></div><p className="mt-1 text-xs text-muted-foreground">Committed at {importDetail.committed_at ? new Date(importDetail.committed_at).toLocaleString('en-GB') : 'timestamp not available'}. The committed dataset is now available to reporting.</p></div>
                      )}

                      {(importDetail.status === 'validated' || importDetail.status === 'committed') ? (
                        <div>
                          <p className="mb-3 text-sm font-semibold text-foreground">2. Validation summary</p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {[
                              ['Total rows', importDetail.row_count, 'text-foreground'],
                              ['Valid', importDetail.valid_row_count, 'text-emerald-700 dark:text-emerald-300'],
                              ['Invalid', importDetail.invalid_row_count, 'text-rose-700 dark:text-rose-300'],
                              ['Duplicates', importDetail.duplicate_row_count, 'text-amber-700 dark:text-amber-300'],
                            ].map(([label, value, color]) => <div key={String(label)} className="rounded-xl border border-border bg-card/70 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold ${color}`}>{formatNumber(Number(value), 0)}</p></div>)}
                          </div>
                          {skippedRows > 0 && importDetail.status !== 'committed' ? (
                            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3"><input type="checkbox" checked={confirmPartial} onChange={(event) => setConfirmPartial(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-primary" /><span><span className="block text-xs font-semibold text-amber-700 dark:text-amber-200">Confirm partial import</span><span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{skippedRows} invalid or duplicate rows will be excluded. Only the {validRows} valid rows will be committed.</span></span></label>
                          ) : null}
                          {importDetail.status === 'validated' ? <button type="button" onClick={() => commitMutation.mutate({ id: importDetail.id, partial: confirmPartial })} disabled={!canCommit || commitMutation.isPending} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-40">{commitMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />} Commit {validRows} valid rows</button> : null}
                        </div>
                      ) : null}

                      {Array.isArray(importDetail.rows) && importDetail.rows.length ? (
                        <div>
                          <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-foreground">3. Row preview</p><span className="text-xs text-muted-foreground">First {importDetail.rows.length} rows</span></div>
                          <div className="max-h-72 overflow-auto rounded-xl border border-border">
                            <table className="w-full min-w-[540px] text-left">
                              <thead className="sticky top-0 bg-card"><tr><th className="px-3 py-2 text-xs  text-muted-foreground">Row</th><th className="px-3 py-2 text-xs  text-muted-foreground">Status</th><th className="px-3 py-2 text-xs  text-muted-foreground">Source values / validation</th></tr></thead>
                              <tbody className="divide-y divide-white/[0.05]">{importDetail.rows.map((row) => {
                                const values = isRecord(row.raw_data) ? Object.entries(row.raw_data).slice(0, 5).map(([key, value]) => `${key}: ${String(value ?? '')}`) : [];
                                const errors = Array.isArray(row.validation_errors) ? row.validation_errors.map((value) => String(value)) : [];
                                return <tr key={row.id} className="align-top"><td className="px-3 py-2 text-xs text-muted-foreground">{row.row_number}</td><td className="px-3 py-2"><StatusPill status={row.validation_status} /></td><td className="max-w-[420px] px-3 py-2"><p className="break-words text-xs leading-4 text-muted-foreground">{values.join(' · ') || '—'}</p>{errors.length ? <p className="mt-1 break-words text-xs leading-4 text-rose-700 dark:text-rose-300">{errors.join(' · ')}</p> : null}</td></tr>;
                              })}</tbody>
                            </table>
                          </div>
                          <p className="mt-2 text-xs leading-4 text-muted-foreground">Validation preview is capped at {importDetail.previewLimit} rows. All source rows are validated server-side.</p>
                        </div>
                      ) : null}
                    </div>
                  )}
                </Panel>
              </div>
            </section>

            {dashboard && <section>
              <SectionHeading title="Report methodology and source freshness" description="Definitions and assumptions travel with the downloadable report so figures remain explainable." />
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel className="p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-2"><Database size={15} className="text-primary" /><p className="text-sm font-semibold text-foreground">Source register</p></div>
                  {dashboard.sources?.length ? <div className="space-y-2">{dashboard.sources.map((source, index) => <div key={`${source.sourceType}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-xs font-medium text-foreground/80">{source.sourceName}</p><p className="mt-0.5 text-xs text-muted-foreground">{humanize(source.sourceType)} · {formatNumber(source.recordCount, 0)} records</p></div><span className="shrink-0 text-xs text-muted-foreground">{formatCompactDate(source.periodEnd)}</span></div>)}</div> : <p className="text-xs text-muted-foreground">Source freshness details will appear when data sources contain records.</p>}
                </Panel>
                <Panel className="p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-2"><ShieldCheck size={15} className="text-primary" /><p className="text-sm font-semibold text-foreground">Calculation assumptions</p></div>
                  {dashboard.assumptions?.length ? <ul className="space-y-2">{dashboard.assumptions.map((assumption, index) => <li key={index} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />{assumption}</li>)}</ul> : <p className="text-xs text-muted-foreground">No methodology notes were returned.</p>}
                </Panel>
              </div>
              {dashboard.sections?.length ? <details className="group rounded-2xl border border-border bg-card p-4"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-foreground/80"><span className="flex items-center gap-2"><FileText size={14} className="text-primary" /> Executive report sections</span><ChevronDown size={14} className="transition group-open:rotate-180" /></summary><div className="mt-4 grid gap-3 md:grid-cols-2">{dashboard.sections.map((section, index) => <div key={`${section.title}-${index}`} className="rounded-xl border border-border bg-muted/50 p-3"><p className="text-xs font-semibold text-foreground/90">{section.title}</p>{section.body ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{section.body}</p> : null}{section.items?.length ? <ul className="mt-2 space-y-1">{section.items.map((item, itemIndex) => <li key={itemIndex} className="text-xs leading-4 text-muted-foreground">• {item}</li>)}</ul> : null}</div>)}</div></details> : null}
            </section>}
        </>}
      </main>

      {targetModalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="target-modal-title">
          <div className="my-auto w-full max-w-xl rounded-2xl border border-white/[0.1] bg-background-deep p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-bold  text-primary">Performance governance</p><h2 id="target-modal-title" className="mt-1 text-lg font-semibold text-foreground">Create KPI target</h2><p className="mt-1 text-xs text-muted-foreground">Configure the measurement, period and alert policy.</p></div><button type="button" onClick={() => setTargetModalOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close target form"><X size={17} /></button></div>
            <form onSubmit={(event) => { event.preventDefault(); targetMutation.mutate(); }} className="space-y-3">
              <label className="block"><span className="mb-1.5 block text-xs font-semibold  text-muted-foreground">KPI metric</span><select required value={targetForm.metricKey} onChange={(event) => updateTargetField('metricKey', event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground/90 outline-none focus:border-primary/60">{TARGET_METRICS.map((metric) => <option key={metric} value={metric} className="bg-card">{humanize(metric)}</option>)}</select></label>
              {currencyScopedTarget ? <label className="block"><span className="mb-1.5 block text-xs font-semibold  text-muted-foreground">Currency · ISO 4217</span><input required maxLength={3} value={targetForm.currency} onChange={(event) => updateTargetField('currency', event.target.value.toUpperCase())} placeholder="USD" className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm  text-foreground/90 outline-none focus:border-primary/60" /></label> : null}
              <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-semibold  text-muted-foreground">Target value</span><input type="number" step="any" required value={targetForm.targetValue} onChange={(event) => updateTargetField('targetValue', event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground/90 outline-none focus:border-primary/60" /></label><div className="rounded-xl border border-border bg-muted/50 p-3"><p className="text-xs  text-muted-foreground">Validated unit</p><p className="mt-2 text-sm font-semibold text-primary">{targetUnit}</p><p className="mt-1 text-xs text-muted-foreground">Set automatically from the metric.</p></div></div>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-semibold  text-muted-foreground">Target period</span><select value={targetForm.targetPeriod} onChange={(event) => updateTargetField('targetPeriod', event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground/90 outline-none"><option value="monthly" className="bg-card">Monthly</option><option value="quarterly" className="bg-card">Quarterly</option><option value="annual" className="bg-card">Annual</option><option value="custom" className="bg-card">Custom</option></select></label><label className="block"><span className="mb-1.5 block text-xs font-semibold  text-muted-foreground">Direction</span><select value={targetForm.direction} onChange={(event) => updateTargetField('direction', event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground/90 outline-none"><option value="higher_is_better" className="bg-card">Higher is better</option><option value="lower_is_better" className="bg-card">Lower is better</option></select></label></div>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-semibold  text-muted-foreground">Period start</span><input type="date" required value={targetForm.periodStart} onChange={(event) => updateTargetField('periodStart', event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground/90 outline-none" /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold  text-muted-foreground">Period end</span><input type="date" required min={targetForm.periodStart} value={targetForm.periodEnd} onChange={(event) => updateTargetField('periodEnd', event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground/90 outline-none" /></label></div>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-semibold  text-muted-foreground">Alert threshold (%)</span><input type="number" min="0" max="1000" step="any" value={targetForm.alertThresholdPct} onChange={(event) => updateTargetField('alertThresholdPct', event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground/90 outline-none" /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold  text-muted-foreground">Minimum sample size</span><input type="number" min="1" step="1" required value={targetForm.minimumSampleSize} onChange={(event) => updateTargetField('minimumSampleSize', event.target.value)} className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground/90 outline-none" /></label></div>
              <div className="mt-5 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setTargetModalOpen(false)} className="h-10 rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-muted">Cancel</button><button type="submit" disabled={targetMutation.isPending || !targetForm.targetValue || !targetForm.periodStart || !targetForm.periodEnd || (currencyScopedTarget && !/^[A-Z]{3}$/.test(targetForm.currency.trim().toUpperCase()))} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40">{targetMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Save target</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
