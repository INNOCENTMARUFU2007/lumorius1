'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
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
  Gauge,
  Layers3,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
  Upload,
  X,
  Zap,
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
import { toast } from 'sonner';
import api from '@/lib/api';

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
};

type ImportSummary = {
  id: string;
  dataset_type: 'transactions' | 'contracts' | 'pipeline';
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
  datasetType: 'transactions' | 'contracts' | 'pipeline';
  status: string;
  fileName: string;
  headers: string[];
  rowCount: number;
};

type DatasetType = 'transactions' | 'contracts' | 'pipeline';

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
  if (metric.currency) return formatMoney(metric.value, metric.currency);
  if (metric.unit === '%') return `${formatNumber(metric.value)}%`;
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function initialPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { startDate: dateInputValue(start), endDate: dateInputValue(end) };
}

function statusClasses(status: string): string {
  if (status === 'actual' || status === 'committed' || status === 'on_track') {
    return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300';
  }
  if (status === 'estimated' || status === 'validated' || status === 'mapping_required') {
    return 'border-amber-400/20 bg-amber-400/10 text-amber-300';
  }
  if (status === 'behind' || status === 'invalid' || status === 'failed') {
    return 'border-rose-400/20 bg-rose-400/10 text-rose-300';
  }
  return 'border-slate-500/20 bg-slate-500/10 text-slate-400';
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
    <section className={`rounded-2xl border border-white/[0.08] bg-[#0c1424]/90 shadow-[0_18px_55px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl ${className}`}>
      {children as unknown as React.ReactNode}
    </section>
  );
}
function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-1 text-[12px] font-semibold uppercase tracking-[0.22em] text-[#8291b5]">{eyebrow}</p> : null}
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
        {description ? <p className="mt-1 text-[13px] leading-5 text-slate-400">{description}</p> : null}
      </div>
      {action as unknown as React.ReactNode}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = status === 'on_track' ? 'On track' : status === 'behind' ? 'Behind' : status === 'insufficient_data' ? 'Insufficient data' : humanize(status);
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-semibold capitalize tracking-wide ${statusClasses(status)}`}>{label}</span>;
}

function MetricCard({ metric, compact = false }: { metric: ExecutiveMetric; compact?: boolean }) {
  const Icon = metricIcon(metric.metricKey);
  const available = metric.status !== 'unavailable' && metric.value !== null;
  return (
    <div className={`group relative overflow-hidden rounded-xl border border-white/[0.07] bg-[#101b2f]/75 ${compact ? 'p-3.5' : 'p-4'}`}>
      <div className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#4254f5]/[0.09] blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-slate-400">{metric.label}</p>
          <p className={`mt-2 truncate font-semibold tracking-tight text-white ${compact ? 'text-xl' : 'text-2xl'}`}>
            {formatMetricValue(metric)}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#6174ff]/20 bg-[#4254f5]/10 text-[#8e9bff]">
          <Icon size={17} />
        </span>
      </div>
      <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
        <StatusPill status={metric.status} />
        <span className="text-[12px] text-slate-400">{formatNumber(metric.sampleSize ?? 0, 0)} records</span>
      </div>
      {metric.targetStatus ? (
        <div className="relative mt-2 flex items-center justify-between text-[12px] text-slate-400">
          <span>Target progress</span>
          <span className="font-semibold text-slate-300">{metric.targetProgressPct === null || metric.targetProgressPct === undefined ? '—' : `${formatNumber(metric.targetProgressPct)}%`}</span>
        </div>
      ) : null}
      {metric.note ? <p className="relative mt-2 text-[12px] leading-4 text-slate-400">{metric.note}</p> : null}
      {!available ? <div className="pointer-events-none absolute inset-0 bg-[#080d18]/10" /> : null}
    </div>
  );
}

function RevenueTrend({ metric }: { metric: ExecutiveMetric }) {
  const points = Array.isArray(metric.trend) ? metric.trend : [];
  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-white">Revenue trend</p>
          <p className="mt-1 text-[12px] text-slate-400">Monthly imported revenue · {metric.currency ?? 'Currency unavailable'}</p>
        </div>
        <span className="rounded-lg border border-[#6174ff]/20 bg-[#4254f5]/10 p-2 text-[#9ba6ff]"><BarChart3 size={15} /></span>
      </div>
      {points.length ? (
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id={`revenue-fill-${metric.currency ?? 'none'}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6577ff" stopOpacity={0.34} />
                  <stop offset="95%" stopColor="#6577ff" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#26334a" strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#71809c', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#71809c', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value: number) => formatNumber(value, 0)} />
              <Tooltip
                contentStyle={{ background: '#0b1220', border: '1px solid rgba(148,163,184,.18)', borderRadius: 12, color: '#e2e8f0', fontSize: 11 }}
                formatter={(value) => [formatMoney(Number(value ?? 0), metric.currency ?? 'USD'), 'Revenue']}
              />
              <Area type="monotone" dataKey="value" stroke="#7888ff" strokeWidth={2.5} fill={`url(#revenue-fill-${metric.currency ?? 'none'})`} activeDot={{ r: 4, fill: '#a5b4fc', stroke: '#18223b', strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-center">
          <div><BarChart3 className="mx-auto mb-2 text-slate-400" size={22} /><p className="text-[13px] text-slate-400">No monthly revenue trend available</p><p className="mt-1 text-[12px] text-slate-400">Commit transaction imports to populate this chart.</p></div>
        </div>
      )}
    </Panel>
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
        eyebrow="Evidence review"
        title="Financial candidates"
        description="Document-derived transaction suggestions remain non-authoritative until an owner/admin reviews the cited passage."
      />
      <Panel className="p-4 sm:p-5">
        {candidatesQuery.isLoading ? (
          <div className="flex items-center gap-2 py-4 text-[13px] text-slate-400">
            <Loader2 className="animate-spin" size={15} /> Loading evidence-backed candidates…
          </div>
        ) : candidatesQuery.isError ? (
          <div className="flex items-center justify-between gap-3 py-2">
            <p role="alert" className="text-[13px] text-rose-300">
              {errorMessage(candidatesQuery.error, 'Financial candidates could not be loaded.')}
            </p>
            <button type="button" onClick={() => void candidatesQuery.refetch()} className="text-[12px] font-semibold text-[#aab4ff]">
              Retry
            </button>
          </div>
        ) : candidatesQuery.data?.length ? (
          <div className="space-y-3">
            {candidatesQuery.data.map((candidate) => (
              <article key={candidate.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white">
                      {humanize(candidate.transaction_type)} · {candidate.currency} {formatNumber(Number(candidate.amount))}
                    </p>
                    <p className="mt-1 text-[12px] text-slate-400">
                      {candidate.transaction_date} · {candidate.document_name} · confidence {formatNumber(Number(candidate.confidence) * 100, 0)}%
                    </p>
                    <blockquote className="mt-3 border-l-2 border-[#6577ff]/50 pl-3 text-[12px] leading-5 text-slate-300">
                      {candidate.evidence_excerpt}
                    </blockquote>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={reviewMutation.isPending}
                      onClick={() => reviewMutation.mutate({ candidateId: candidate.id, action: 'approve' })}
                      className="rounded-lg bg-emerald-500/15 px-3 py-2 text-[12px] font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
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
                      className="rounded-lg border border-rose-400/20 px-3 py-2 text-[12px] font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="py-3 text-[13px] text-slate-400">
            No pending candidates. New suggestions appear only when a source passage contains an explicit date, currency amount and transaction type.
          </p>
        )}
      </Panel>
    </section>
  );
}

export default function ExecutiveIntelligencePage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(initialPeriod);
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
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
    queryKey: ['executive-intelligence', 'dashboard', period.startDate, period.endDate],
    queryFn: async () => unwrapRecord((await api.get('/executive-intelligence/dashboard', {
      params: { startDate: period.startDate, endDate: period.endDate },
    })).data) as unknown as ExecutiveDashboard,
    enabled: Boolean(period.startDate && period.endDate && period.endDate >= period.startDate),
    staleTime: 30_000,
  });

  const importsQuery = useQuery<ImportSummary[]>({
    queryKey: ['executive-intelligence', 'imports'],
    queryFn: async () => {
      const payload = unwrapRecord((await api.get('/executive-intelligence/imports', { params: { page: 1, pageSize: 12 } })).data);
      const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.items) ? payload.items : [];
      return rows.filter(isRecord) as unknown as ImportSummary[];
    },
    staleTime: 20_000,
  });

  const targetsQuery = useQuery<TargetRecord[]>({
    queryKey: ['executive-intelligence', 'targets'],
    queryFn: async () => unwrapArray((await api.get('/executive-intelligence/targets')).data) as unknown as TargetRecord[],
    staleTime: 30_000,
  });

  const importDetailQuery = useQuery<ImportDetail>({
    queryKey: ['executive-intelligence', 'import', selectedImportId],
    queryFn: async () => unwrapRecord((await api.get(`/executive-intelligence/imports/${selectedImportId}`)).data) as unknown as ImportDetail,
    enabled: Boolean(selectedImportId),
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
  const currencies = useMemo(() => Array.from(new Set(metrics.map((metric) => metric.currency).filter((value): value is string => Boolean(value)))).sort(), [metrics]);
  const visibleMetrics = useMemo(() => metrics.filter((metric) => !metric.currency || currencyFilter === 'ALL' || metric.currency === currencyFilter), [metrics, currencyFilter]);
  const financialCategories = new Set(['Financial performance', 'Recurring revenue', 'Sales pipeline']);
  const financialMetrics = visibleMetrics.filter((metric) => financialCategories.has(metric.category));
  const operationalMetrics = visibleMetrics.filter((metric) => metric.category === 'Operations');
  const aiMetrics = visibleMetrics.filter((metric) => metric.category === 'AI economics');
  const financialGroups = useMemo(() => {
    const groups: Record<string, ExecutiveMetric[]> = {};
    for (const metric of financialMetrics) {
      const key = metric.currency ?? 'Currency not specified';
      (groups[key] ??= []).push(metric);
    }
    return groups;
  }, [financialMetrics]);
  const signalMetrics = ['tasks_completed', 'meetings_completed', 'documents_indexed', 'ai_operations']
    .map((key) => metrics.find((metric) => metric.metricKey === key))
    .filter((metric): metric is ExecutiveMetric => Boolean(metric));
  const alerts = dashboard?.alerts ?? [];
  const imports = importsQuery.data ?? [];
  const targets = targetsQuery.data ?? [];
  const importDetail = importDetailQuery.data;
  const mappingFields = importDetail ? DATASET_FIELDS[importDetail.dataset_type] : DATASET_FIELDS[datasetType];
  const mappedRequiredCount = mappingFields.required.filter((field) => Boolean(mapping[field])).length;
  const validRows = importDetail?.valid_row_count ?? 0;
  const skippedRows = (importDetail?.invalid_row_count ?? 0) + (importDetail?.duplicate_row_count ?? 0);
  const canCommit = importDetail?.status === 'validated' && validRows > 0 && (skippedRows === 0 || confirmPartial);

  const refreshAll = async () => {
    await Promise.all([
      dashboardQuery.refetch(),
      importsQuery.refetch(),
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
    <div className="relative min-h-full overflow-hidden bg-[#070b14] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(66,84,245,0.16),transparent_36%),radial-gradient(ellipse_at_92%_24%,rgba(14,165,233,0.07),transparent_28%)]" />
      <main className="relative mx-auto w-full max-w-[1680px] space-y-7 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#6577ff]/25 bg-[#4254f5]/10 px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.2em] text-[#aab4ff]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#7c8cff] shadow-[0_0_10px_rgba(124,140,255,0.9)]" /> Lumorius intelligence suite
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                <LockKeyhole size={11} /> Owner / admin workspace
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">Executive Intelligence<span className="text-[#7788ff]">.</span></h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              A governed command view of financial performance, recurring revenue, operational execution and enterprise AI economics.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.17em] text-slate-400">From</span>
                <input type="date" value={period.startDate} max={period.endDate} onChange={(event) => setPeriod((current) => ({ ...current, startDate: event.target.value }))} className="h-10 w-full rounded-xl border border-white/[0.09] bg-[#111a2b] px-3 text-[13px] text-slate-200 outline-none transition focus:border-[#6577ff]/60" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.17em] text-slate-400">To</span>
                <input type="date" value={period.endDate} min={period.startDate} max={dateInputValue(new Date())} onChange={(event) => setPeriod((current) => ({ ...current, endDate: event.target.value }))} className="h-10 w-full rounded-xl border border-white/[0.09] bg-[#111a2b] px-3 text-[13px] text-slate-200 outline-none transition focus:border-[#6577ff]/60" />
              </label>
            </div>
            <button type="button" onClick={() => void refreshAll()} disabled={dashboardQuery.isFetching || importsQuery.isFetching || targetsQuery.isFetching} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-[13px] font-semibold text-slate-300 transition hover:border-[#6577ff]/40 hover:bg-[#4254f5]/10 disabled:cursor-not-allowed disabled:opacity-50">
              <RefreshCw size={14} className={dashboardQuery.isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </header>

        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[#6476ff]/20 bg-gradient-to-r from-[#172247]/90 via-[#101a31]/90 to-[#0d1829]/90 p-4 sm:flex-row sm:items-center sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#8190ff]/25 bg-[#4254f5]/15 text-[#aeb8ff]"><Gauge size={19} /></div>
            <div>
              <p className="text-[13px] font-semibold text-white">{dashboard?.organizationName ?? 'Executive command centre'}</p>
              <p className="mt-0.5 text-[12px] text-slate-400">Reporting window · {formatCompactDate(period.startDate)} — {formatCompactDate(period.endDate)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-400">Actual / estimated / unavailable</span>
            <span className="rounded-full border border-[#6577ff]/20 bg-[#4254f5]/10 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#aeb8ff]">No FX aggregation</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2 text-[12px] text-slate-400"><ShieldCheck size={13} className="text-emerald-400" /> Organisation-scoped reporting · source provenance retained · audited import commits</div>
          <div className="flex flex-wrap gap-2">
            {(['pdf', 'xlsx', 'csv'] as const).map((format) => (
              <button key={format} type="button" onClick={() => void exportReport(format)} disabled={Boolean(exporting) || dashboardQuery.isLoading || !dashboard} className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-300 transition hover:border-[#6577ff]/40 hover:bg-[#4254f5]/10 disabled:cursor-not-allowed disabled:opacity-40">
                {exporting === format ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                {format}
              </button>
            ))}
          </div>
        </div>

        {dashboardQuery.isLoading ? (
          <Panel className="flex min-h-72 items-center justify-center p-8"><div className="text-center"><Loader2 className="mx-auto mb-3 animate-spin text-[#8795ff]" size={26} /><p className="text-sm font-medium text-slate-300">Synchronising executive data</p><p className="mt-1 text-[13px] text-slate-400">Loading governed KPIs, targets and source records.</p></div></Panel>
        ) : dashboardQuery.isError ? (
          <Panel className="p-6 sm:p-8">
            <div className="mx-auto max-w-xl text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-400/10 text-rose-300"><LockKeyhole size={21} /></div>
              <h2 className="text-lg font-semibold text-white">Executive data unavailable</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{errorMessage(dashboardQuery.error, 'The API did not return Executive Intelligence data.')}</p>
              <p className="mt-2 text-[12px] text-slate-400">This workspace is restricted to organisation owners and administrators. Confirm the signed-in account role and API connectivity.</p>
              <button type="button" onClick={() => void dashboardQuery.refetch()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#4254f5] px-4 text-[13px] font-semibold text-white transition hover:bg-[#5265ff]"><RefreshCw size={13} /> Retry connection</button>
            </div>
          </Panel>
        ) : dashboard ? (
          <>
            <section>
              <SectionHeading eyebrow="Executive pulse" title="Operational command signals" description="Activity indicators for the selected reporting period. Currency-based measures remain in their own reporting lanes." />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {signalMetrics.length ? signalMetrics.map((metric) => <MetricCard key={metric.key} metric={metric} />) : (
                  <Panel className="col-span-full p-5"><p className="text-[13px] text-slate-400">Operational indicators will appear when source activity is available.</p></Panel>
                )}
              </div>
            </section>

            <section>
              <SectionHeading
                eyebrow="Financial intelligence"
                title="Performance by currency"
                description="Imported transactions, customer contracts and sales opportunities. Amounts are never combined across currencies."
                action={(
                  <label className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.09] bg-[#111a2b] px-3">
                    <Filter size={12} className="text-slate-400" />
                    <select value={currencyFilter} onChange={(event) => setCurrencyFilter(event.target.value)} className="max-w-[170px] bg-transparent text-[12px] font-semibold text-slate-200 outline-none">
                      <option value="ALL" className="bg-[#111a2b]">All currencies</option>
                      {currencies.map((currency) => <option key={currency} value={currency} className="bg-[#111a2b]">{currency}</option>)}
                    </select>
                    <ChevronDown size={12} className="text-slate-400" />
                  </label>
                )}
              />
              {Object.keys(financialGroups).length ? (
                <div className="space-y-4">
                  {Object.entries(financialGroups).map(([currency, currencyMetrics]) => {
                    const revenueMetric = currencyMetrics.find((metric) => metric.metricKey === 'revenue');
                    return (
                      <div key={currency} className="rounded-2xl border border-white/[0.07] bg-[#0b1220]/80 p-4 sm:p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#6476ff]/20 bg-[#4254f5]/10 text-[#9ba7ff]"><CircleDollarSign size={15} /></span><div><p className="text-[13px] font-semibold text-white">{currency}</p><p className="text-[12px] text-slate-400">Independent currency ledger</p></div></div>
                          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">{currencyMetrics.length} indicators</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {currencyMetrics.map((metric) => <MetricCard key={metric.key} metric={metric} compact />)}
                        </div>
                        {revenueMetric ? <div className="mt-4"><RevenueTrend metric={revenueMetric} /></div> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Panel className="p-6"><div className="flex flex-col items-center text-center"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-400"><Database size={19} /></div><p className="text-sm font-medium text-white">No committed financial records</p><p className="mt-1 max-w-lg text-[13px] leading-5 text-slate-400">Upload a transaction, contract or pipeline dataset below. Financial KPIs populate only after validation and an explicit commit.</p></div></Panel>
              )}
            </section>

            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
              <section>
                <SectionHeading eyebrow="Execution" title="Operational performance" description="Task throughput, knowledge ingestion, meetings and project activity." />
                {operationalMetrics.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {operationalMetrics.map((metric) => <MetricCard key={metric.key} metric={metric} compact />)}
                  </div>
                ) : <Panel className="p-5"><p className="text-[13px] text-slate-400">No operational metrics were returned for this period.</p></Panel>}
                {aiMetrics.length ? (
                  <div className="mt-5">
                    <SectionHeading eyebrow="AI economics" title="Usage and cost governance" description="Only usage with an effective pricing record contributes to priced AI expenditure." />
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{aiMetrics.map((metric) => <MetricCard key={metric.key} metric={metric} compact />)}</div>
                  </div>
                ) : null}
              </section>

              <section>
                <SectionHeading eyebrow="Risk signals" title="Target alerts" description="Threshold breaches are surfaced only when the configured sample size is met." />
                <Panel className="p-4">
                  <div className="mb-3 flex items-center justify-between"><span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">Current period</span><span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${alerts.length ? 'bg-amber-400/10 text-amber-300' : 'bg-emerald-400/10 text-emerald-300'}`}>{alerts.length} active</span></div>
                  {alerts.length ? (
                    <div className="space-y-2.5">{alerts.map((alert, index) => (
                      <div key={`${alert.metricKey}-${alert.currency ?? 'none'}-${index}`} className="rounded-xl border border-amber-300/15 bg-amber-300/[0.045] p-3.5">
                        <div className="flex items-start gap-2.5"><span className="mt-0.5 text-amber-300"><AlertTriangle size={15} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[13px] font-semibold text-slate-100">{alert.label}{alert.currency ? ` · ${alert.currency}` : ''}</p><span className="text-[12px] font-bold text-amber-300">{formatNumber(alert.gapPct)}% gap</span></div><p className="mt-1.5 text-[12px] leading-5 text-slate-400">{alert.message}</p></div></div>
                      </div>
                    ))}</div>
                  ) : (
                    <div className="flex min-h-40 flex-col items-center justify-center text-center"><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300"><Check size={17} /></div><p className="text-[13px] font-semibold text-slate-200">No threshold breaches</p><p className="mt-1 max-w-[230px] text-[12px] leading-4 text-slate-400">No configured alert crossed its threshold with sufficient sample data.</p></div>
                  )}
                </Panel>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/[0.07] bg-[#0c1424]/80 p-3.5"><p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-400">Configured targets</p><p className="mt-1.5 text-2xl font-semibold text-white">{targets.length}</p><p className="mt-1 text-[12px] text-slate-400">Organisation-wide</p></div>
                  <div className="rounded-xl border border-white/[0.07] bg-[#0c1424]/80 p-3.5"><p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-400">Data sources</p><p className="mt-1.5 text-2xl font-semibold text-white">{dashboard.sources?.length ?? 0}</p><p className="mt-1 text-[12px] text-slate-400">With source records</p></div>
                </div>
              </section>
            </div>

            <section>
              <SectionHeading
                eyebrow="Performance governance"
                title="KPI target register"
                description="Targets are scoped to a metric, period and currency where applicable. Owner and alert thresholds are retained in the audit trail."
                action={<button type="button" onClick={() => setTargetModalOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#4254f5] px-3.5 text-[12px] font-semibold text-white shadow-[0_8px_25px_-12px_rgba(66,84,245,0.9)] transition hover:bg-[#5265ff]"><Plus size={13} /> Create target</button>}
              />
              <Panel className="overflow-hidden">
                {targetsQuery.isLoading ? <div className="p-5 text-[13px] text-slate-400">Loading target register…</div> : targets.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-left">
                      <thead className="border-b border-white/[0.07] bg-white/[0.025]"><tr>{['Metric', 'Target', 'Reporting period', 'Direction', 'Alert threshold', 'Owner'].map((heading) => <th key={heading} className="px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">{heading}</th>)}</tr></thead>
                      <tbody className="divide-y divide-white/[0.05]">{targets.map((target) => (
                        <tr key={target.id} className="transition hover:bg-white/[0.02]">
                          <td className="px-4 py-3"><p className="text-[13px] font-semibold text-slate-200">{humanize(target.metric_key)}{target.currency ? <span className="ml-1.5 text-[12px] text-[#93a0ff]">{target.currency}</span> : null}</p><p className="mt-0.5 text-[12px] text-slate-400">{target.target_period}</p></td>
                          <td className="px-4 py-3 text-[13px] font-semibold text-white">{formatNumber(Number(target.target_value))} <span className="text-[12px] font-normal text-slate-400">{target.unit}</span></td>
                          <td className="px-4 py-3 text-[12px] text-slate-400">{formatCompactDate(target.period_start)} — {formatCompactDate(target.period_end)}</td>
                          <td className="px-4 py-3 text-[12px] text-slate-400">{target.direction === 'higher_is_better' ? 'Higher is better' : 'Lower is better'}</td>
                          <td className="px-4 py-3 text-[13px] text-slate-300">{target.alert_threshold_pct === null || target.alert_threshold_pct === undefined ? 'Not set' : `${formatNumber(Number(target.alert_threshold_pct))}%`}</td>
                          <td className="px-4 py-3 text-[13px] text-slate-400">{target.owner_name || 'Unassigned'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex min-h-44 flex-col items-center justify-center p-6 text-center"><Target className="mb-2 text-slate-400" size={22} /><p className="text-[13px] font-semibold text-slate-200">No KPI targets configured</p><p className="mt-1 text-[12px] text-slate-400">Create a target to enable progress tracking and threshold alerts.</p></div>
                )}
              </Panel>
            </section>

            <FinancialCandidateReview />

            <section>
              <SectionHeading eyebrow="Data operations" title="Import centre" description="Stage a CSV or XLSX source, map columns, validate every row and explicitly commit approved records." />
              <div className="grid gap-4 2xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.28fr)]">
                <Panel className="p-4 sm:p-5">
                  <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#6577ff]/20 bg-[#4254f5]/10 text-[#9ba7ff]"><Upload size={17} /></div><div><p className="text-sm font-semibold text-white">Stage a new import</p><p className="text-[12px] text-slate-400">CSV / XLSX · 10 MB maximum</p></div></div>
                  <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">Dataset type</label>
                  <select value={datasetType} onChange={(event) => setDatasetType(event.target.value as DatasetType)} className="h-10 w-full rounded-xl border border-white/[0.09] bg-[#111a2b] px-3 text-[13px] text-slate-200 outline-none focus:border-[#6577ff]/60">
                    <option value="transactions" className="bg-[#111a2b]">Financial transactions</option>
                    <option value="contracts" className="bg-[#111a2b]">Customer contracts / recurring revenue</option>
                    <option value="pipeline" className="bg-[#111a2b]">Sales pipeline opportunities</option>
                  </select>
                  <input ref={fileInputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadMutation.mutate({ file, type: datasetType }); event.currentTarget.value = ''; }} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} className="mt-3 flex min-h-36 w-full flex-col items-center justify-center rounded-xl border border-dashed border-[#6577ff]/30 bg-[#4254f5]/[0.045] px-4 text-center transition hover:border-[#8795ff]/60 hover:bg-[#4254f5]/[0.08] disabled:opacity-50">
                    {uploadMutation.isPending ? <Loader2 className="mb-2 animate-spin text-[#aab4ff]" size={22} /> : <Upload className="mb-2 text-[#9ba7ff]" size={22} />}
                    <span className="text-[13px] font-semibold text-slate-200">{uploadMutation.isPending ? 'Staging source file…' : 'Select source file'}</span>
                    <span className="mt-1 text-[12px] text-slate-400">Choose a CSV or XLSX file from your device</span>
                  </button>
                  <div className="mt-4 space-y-2 rounded-xl border border-white/[0.06] bg-black/10 p-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-400">Import controls</p>
                    <div className="flex items-start gap-2 text-[12px] leading-4 text-slate-400"><ShieldCheck size={12} className="mt-0.5 shrink-0 text-emerald-400" /> No records are committed during upload or mapping.</div>
                    <div className="flex items-start gap-2 text-[12px] leading-4 text-slate-400"><BadgeCheck size={12} className="mt-0.5 shrink-0 text-[#9ba7ff]" /> Duplicate detection and row-level validation run before commit.</div>
                    <div className="flex items-start gap-2 text-[12px] leading-4 text-slate-400"><LockKeyhole size={12} className="mt-0.5 shrink-0 text-slate-400" /> Imports are organisation-scoped and audited.</div>
                  </div>
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between"><p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-400">Recent imports</p><span className="text-[12px] text-slate-400">{imports.length} shown</span></div>
                    {importsQuery.isLoading ? <p className="py-3 text-[12px] text-slate-400">Loading import history…</p> : imports.length ? (
                      <div className="space-y-1.5">{imports.slice(0, 8).map((item) => (
                        <button type="button" key={item.id} onClick={() => openImport(item.id)} className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${selectedImportId === item.id ? 'border-[#6577ff]/35 bg-[#4254f5]/[0.09]' : 'border-white/[0.055] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.035]'}`}>
                          <FileSpreadsheet size={15} className="shrink-0 text-slate-400" /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium text-slate-300">{item.file_name}</span><span className="mt-0.5 block text-[12px] text-slate-400">{humanize(item.dataset_type)} · {item.row_count} rows</span></span><StatusPill status={item.status} /><ChevronRight size={12} className="shrink-0 text-slate-400" />
                        </button>
                      ))}</div>
                    ) : <p className="py-3 text-[12px] text-slate-400">No imports have been staged.</p>}
                  </div>
                </Panel>

                <Panel className="min-w-0 overflow-hidden">
                  <div className="flex flex-col justify-between gap-2 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:px-5">
                    <div><p className="text-sm font-semibold text-white">Import review workspace</p><p className="mt-1 text-[12px] text-slate-400">Column mapping · validation results · explicit commit</p></div>
                    {importDetail ? <StatusPill status={importDetail.status} /> : null}
                  </div>
                  {!selectedImportId ? (
                    <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center"><Layers3 className="mb-3 text-slate-400" size={25} /><p className="text-[13px] font-semibold text-slate-300">No import selected</p><p className="mt-1 max-w-sm text-[12px] leading-5 text-slate-400">Stage a new source file or select an import from the history to inspect its mapping and validation state.</p></div>
                  ) : importDetailQuery.isLoading ? (
                    <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin text-[#8795ff]" size={22} /></div>
                  ) : importDetailQuery.isError || !importDetail ? (
                    <div className="p-6"><p className="text-[13px] text-rose-300">{errorMessage(importDetailQuery.error, 'Import details could not be loaded.')}</p><button type="button" onClick={() => void importDetailQuery.refetch()} className="mt-3 text-[12px] font-semibold text-[#aab4ff]">Retry import details</button></div>
                  ) : (
                    <div className="space-y-5 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0"><p className="truncate text-[13px] font-semibold text-white">{importDetail.file_name}</p><p className="mt-1 text-[12px] text-slate-400">{humanize(importDetail.dataset_type)} · {importDetail.row_count} source rows · preview limit {importDetail.previewLimit}</p></div>
                        <button type="button" onClick={() => void importDetailQuery.refetch()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 text-[12px] font-semibold text-slate-400 hover:bg-white/[0.04]"><RefreshCw size={11} /> Reload</button>
                      </div>

                      {importDetail.status !== 'committed' ? (
                        <div>
                          <div className="mb-3 flex items-center justify-between"><div><p className="text-[13px] font-semibold text-white">1. Map source columns</p><p className="mt-1 text-[12px] text-slate-400">Required fields must be mapped to distinct source headers.</p></div><span className="text-[12px] font-semibold text-slate-400">{mappedRequiredCount}/{mappingFields.required.length} required</span></div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {[...mappingFields.required, ...mappingFields.optional].map((field) => (
                              <label key={field} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                                <span className="mb-1.5 flex items-center justify-between gap-2 text-[12px] font-medium text-slate-300"><span>{humanize(field)}</span><span className={mappingFields.required.includes(field) ? 'text-rose-300' : 'text-slate-400'}>{mappingFields.required.includes(field) ? 'Required' : 'Optional'}</span></span>
                                <select value={mapping[field] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))} className="h-9 w-full rounded-lg border border-white/[0.08] bg-[#111a2b] px-2.5 text-[12px] text-slate-200 outline-none focus:border-[#6577ff]/50"><option value="" className="bg-[#111a2b]">Not mapped</option>{(importDetail.source_headers ?? []).map((header) => <option key={header} value={header} className="bg-[#111a2b]">{header}</option>)}</select>
                              </label>
                            ))}
                          </div>
                          <button type="button" onClick={() => validateMutation.mutate(importDetail.id)} disabled={validateMutation.isPending || mappedRequiredCount !== mappingFields.required.length} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#4254f5] px-4 text-[12px] font-semibold text-white transition hover:bg-[#5265ff] disabled:cursor-not-allowed disabled:opacity-40">{validateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Validate all rows</button>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3.5"><div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 size={15} /><p className="text-[13px] font-semibold">Import committed</p></div><p className="mt-1 text-[12px] text-slate-400">Committed at {importDetail.committed_at ? new Date(importDetail.committed_at).toLocaleString('en-GB') : 'timestamp not available'}. The committed dataset is now available to reporting.</p></div>
                      )}

                      {(importDetail.status === 'validated' || importDetail.status === 'committed') ? (
                        <div>
                          <p className="mb-3 text-[13px] font-semibold text-white">2. Validation summary</p>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {[
                              ['Total rows', importDetail.row_count, 'text-white'],
                              ['Valid', importDetail.valid_row_count, 'text-emerald-300'],
                              ['Invalid', importDetail.invalid_row_count, 'text-rose-300'],
                              ['Duplicates', importDetail.duplicate_row_count, 'text-amber-300'],
                            ].map(([label, value, color]) => <div key={String(label)} className="rounded-xl border border-white/[0.06] bg-[#101b2f]/70 p-3"><p className="text-[12px] text-slate-400">{label}</p><p className={`mt-1 text-xl font-semibold ${color}`}>{formatNumber(Number(value), 0)}</p></div>)}
                          </div>
                          {skippedRows > 0 && importDetail.status !== 'committed' ? (
                            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3"><input type="checkbox" checked={confirmPartial} onChange={(event) => setConfirmPartial(event.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-[#6577ff]" /><span><span className="block text-[12px] font-semibold text-amber-200">Confirm partial import</span><span className="mt-0.5 block text-[12px] leading-4 text-slate-400">{skippedRows} invalid or duplicate rows will be excluded. Only the {validRows} valid rows will be committed.</span></span></label>
                          ) : null}
                          {importDetail.status === 'validated' ? <button type="button" onClick={() => commitMutation.mutate({ id: importDetail.id, partial: confirmPartial })} disabled={!canCommit || commitMutation.isPending} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 text-[12px] font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-40">{commitMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />} Commit {validRows} valid rows</button> : null}
                        </div>
                      ) : null}

                      {Array.isArray(importDetail.rows) && importDetail.rows.length ? (
                        <div>
                          <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-semibold text-white">3. Row preview</p><span className="text-[12px] text-slate-400">First {importDetail.rows.length} rows</span></div>
                          <div className="max-h-72 overflow-auto rounded-xl border border-white/[0.07]">
                            <table className="w-full min-w-[540px] text-left">
                              <thead className="sticky top-0 bg-[#111a2b]"><tr><th className="px-3 py-2 text-[12px] uppercase tracking-wider text-slate-400">Row</th><th className="px-3 py-2 text-[12px] uppercase tracking-wider text-slate-400">Status</th><th className="px-3 py-2 text-[12px] uppercase tracking-wider text-slate-400">Source values / validation</th></tr></thead>
                              <tbody className="divide-y divide-white/[0.05]">{importDetail.rows.map((row) => {
                                const values = isRecord(row.raw_data) ? Object.entries(row.raw_data).slice(0, 5).map(([key, value]) => `${key}: ${String(value ?? '')}`) : [];
                                const errors = Array.isArray(row.validation_errors) ? row.validation_errors.map((value) => String(value)) : [];
                                return <tr key={row.id} className="align-top"><td className="px-3 py-2 text-[12px] text-slate-400">{row.row_number}</td><td className="px-3 py-2"><StatusPill status={row.validation_status} /></td><td className="max-w-[420px] px-3 py-2"><p className="break-words text-[12px] leading-4 text-slate-400">{values.join(' · ') || '—'}</p>{errors.length ? <p className="mt-1 break-words text-[12px] leading-4 text-rose-300">{errors.join(' · ')}</p> : null}</td></tr>;
                              })}</tbody>
                            </table>
                          </div>
                          <p className="mt-2 text-[12px] leading-4 text-slate-400">Validation preview is capped at {importDetail.previewLimit} rows. All source rows are validated server-side.</p>
                        </div>
                      ) : null}
                    </div>
                  )}
                </Panel>
              </div>
            </section>

            <section>
              <SectionHeading eyebrow="Audit and provenance" title="Report methodology and source freshness" description="Definitions and assumptions travel with the downloadable report so figures remain explainable." />
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel className="p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-2"><Database size={15} className="text-[#9ba7ff]" /><p className="text-[13px] font-semibold text-white">Source register</p></div>
                  {dashboard.sources?.length ? <div className="space-y-2">{dashboard.sources.map((source, index) => <div key={`${source.sourceType}-${index}`} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5"><div className="min-w-0"><p className="truncate text-[12px] font-medium text-slate-300">{source.sourceName}</p><p className="mt-0.5 text-[12px] text-slate-400">{humanize(source.sourceType)} · {formatNumber(source.recordCount, 0)} records</p></div><span className="shrink-0 text-[12px] text-slate-400">{formatCompactDate(source.periodEnd)}</span></div>)}</div> : <p className="text-[12px] text-slate-400">Source freshness details will appear when data sources contain records.</p>}
                </Panel>
                <Panel className="p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-2"><ShieldCheck size={15} className="text-[#9ba7ff]" /><p className="text-[13px] font-semibold text-white">Calculation assumptions</p></div>
                  {dashboard.assumptions?.length ? <ul className="space-y-2">{dashboard.assumptions.map((assumption, index) => <li key={index} className="flex items-start gap-2 text-[12px] leading-5 text-slate-400"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#8190ff]" />{assumption}</li>)}</ul> : <p className="text-[12px] text-slate-400">No methodology notes were returned.</p>}
                </Panel>
              </div>
              {dashboard.sections?.length ? <details className="group rounded-2xl border border-white/[0.07] bg-[#0c1424]/80 p-4"><summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-semibold text-slate-300"><span className="flex items-center gap-2"><FileText size={14} className="text-[#9ba7ff]" /> Executive report sections</span><ChevronDown size={14} className="transition group-open:rotate-180" /></summary><div className="mt-4 grid gap-3 md:grid-cols-2">{dashboard.sections.map((section, index) => <div key={`${section.title}-${index}`} className="rounded-xl border border-white/[0.05] bg-white/[0.015] p-3"><p className="text-[12px] font-semibold text-slate-200">{section.title}</p>{section.body ? <p className="mt-1 text-[12px] leading-5 text-slate-400">{section.body}</p> : null}{section.items?.length ? <ul className="mt-2 space-y-1">{section.items.map((item, itemIndex) => <li key={itemIndex} className="text-[12px] leading-4 text-slate-400">• {item}</li>)}</ul> : null}</div>)}</div></details> : null}
            </section>

            <footer className="flex flex-col justify-between gap-2 border-t border-white/[0.07] pt-4 text-[12px] text-slate-400 sm:flex-row sm:items-center">
              <span> LUMORIUS · EXECUTIVE INTELLIGENCE · REPORTING ENGINE V1.1b</span>
              <span>Generated {dashboard.generatedAt ? new Date(dashboard.generatedAt).toLocaleString('en-GB') : '—'} · Financial values remain currency-separated</span>
            </footer>
          </>
        ) : null}
      </main>

      {targetModalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="target-modal-title">
          <div className="my-auto w-full max-w-xl rounded-2xl border border-white/[0.1] bg-[#0c1424] p-5 shadow-2xl sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#9ba7ff]">Performance governance</p><h2 id="target-modal-title" className="mt-1 text-lg font-semibold text-white">Create KPI target</h2><p className="mt-1 text-[12px] text-slate-400">Configure the measurement, period and alert policy.</p></div><button type="button" onClick={() => setTargetModalOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.05] hover:text-white" aria-label="Close target form"><X size={17} /></button></div>
            <form onSubmit={(event) => { event.preventDefault(); targetMutation.mutate(); }} className="space-y-3">
              <label className="block"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-400">KPI metric</span><select required value={targetForm.metricKey} onChange={(event) => updateTargetField('metricKey', event.target.value)} className="h-10 w-full rounded-xl border border-white/[0.09] bg-[#111a2b] px-3 text-[13px] text-slate-200 outline-none focus:border-[#6577ff]/60">{TARGET_METRICS.map((metric) => <option key={metric} value={metric} className="bg-[#111a2b]">{humanize(metric)}</option>)}</select></label>
              {currencyScopedTarget ? <label className="block"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-400">Currency · ISO 4217</span><input required maxLength={3} value={targetForm.currency} onChange={(event) => updateTargetField('currency', event.target.value.toUpperCase())} placeholder="USD" className="h-10 w-full rounded-xl border border-white/[0.09] bg-[#111a2b] px-3 text-[13px] uppercase text-slate-200 outline-none focus:border-[#6577ff]/60" /></label> : null}
              <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-400">Target value</span><input type="number" step="any" required value={targetForm.targetValue} onChange={(event) => updateTargetField('targetValue', event.target.value)} className="h-10 w-full rounded-xl border border-white/[0.09] bg-[#111a2b] px-3 text-[13px] text-slate-200 outline-none focus:border-[#6577ff]/60" /></label><div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><p className="text-[12px] uppercase tracking-[0.13em] text-slate-400">Validated unit</p><p className="mt-2 text-sm font-semibold text-[#aeb8ff]">{targetUnit}</p><p className="mt-1 text-[12px] text-slate-400">Set automatically from the metric.</p></div></div>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-400">Target period</span><select value={targetForm.targetPeriod} onChange={(event) => updateTargetField('targetPeriod', event.target.value)} className="h-10 w-full rounded-xl border border-white/[0.09] bg-[#111a2b] px-3 text-[13px] text-slate-200 outline-none"><option value="monthly" className="bg-[#111a2b]">Monthly</option><option value="quarterly" className="bg-[#111a2b]">Quarterly</option><option value="annual" className="bg-[#111a2b]">Annual</option><option value="custom" className="bg-[#111a2b]">Custom</option></select></label><label className="block"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-400">Direction</span><select value={targetForm.direction} onChange={(event) => updateTargetField('direction', event.target.value)} className="h-10 w-full rounded-xl border border-white/[0.09] bg-[#111a2b] px-3 text-[13px] text-slate-200 outline-none"><option value="higher_is_better" className="bg-[#111a2b]">Higher is better</option><option value="lower_is_better" className="bg-[#111a2b]">Lower is better</option></select></label></div>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-400">Period start</span><input type="date" required value={targetForm.periodStart} onChange={(event) => updateTargetField('periodStart', event.target.value)} className="h-10 w-full rounded-xl border border-white/[0.09] bg-[#111a2b] px-3 text-[13px] text-slate-200 outline-none" /></label><label className="block"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-400">Period end</span><input type="date" required min={targetForm.periodStart} value={targetForm.periodEnd} onChange={(event) => updateTargetField('periodEnd', event.target.value)} className="h-10 w-full rounded-xl border border-white/[0.09] bg-[#111a2b] px-3 text-[13px] text-slate-200 outline-none" /></label></div>
              <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-400">Alert threshold (%)</span><input type="number" min="0" max="1000" step="any" value={targetForm.alertThresholdPct} onChange={(event) => updateTargetField('alertThresholdPct', event.target.value)} className="h-10 w-full rounded-xl border border-white/[0.09] bg-[#111a2b] px-3 text-[13px] text-slate-200 outline-none" /></label><label className="block"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-400">Minimum sample size</span><input type="number" min="1" step="1" required value={targetForm.minimumSampleSize} onChange={(event) => updateTargetField('minimumSampleSize', event.target.value)} className="h-10 w-full rounded-xl border border-white/[0.09] bg-[#111a2b] px-3 text-[13px] text-slate-200 outline-none" /></label></div>
              <div className="mt-5 flex flex-col-reverse gap-2 border-t border-white/[0.07] pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setTargetModalOpen(false)} className="h-10 rounded-xl border border-white/[0.09] px-4 text-[13px] font-semibold text-slate-400 hover:bg-white/[0.04]">Cancel</button><button type="submit" disabled={targetMutation.isPending || !targetForm.targetValue || !targetForm.periodStart || !targetForm.periodEnd || (currencyScopedTarget && !/^[A-Z]{3}$/.test(targetForm.currency.trim().toUpperCase()))} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#4254f5] px-4 text-[13px] font-semibold text-white hover:bg-[#5265ff] disabled:cursor-not-allowed disabled:opacity-40">{targetMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Save target</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
