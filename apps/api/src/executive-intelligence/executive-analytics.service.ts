import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { DatabaseService } from '../database/database.service';
import type {
  ExecutivePdfMetric,
  ExecutivePdfReport,
  ExecutivePdfSection,
  ExecutivePdfSource,
} from './executive-pdf.service';

export interface ExecutiveAnalyticsActor {
  organizationId: string;
  userId: string;
  role: string;
}

export interface ExecutiveMetricResult extends ExecutivePdfMetric {
  metricKey: string;
  alertThresholdPct?: number | null;
  targetProgressPct?: number | null;
  targetDirection?: 'higher_is_better' | 'lower_is_better';
  targetStatus?: 'on_track' | 'behind' | 'insufficient_data' | 'unavailable';
  targetOwnerName?: string | null;
}

export interface ExecutiveAlert {
  metricKey: string;
  label: string;
  currency?: string;
  severity: 'warning';
  message: string;
  actualValue: number;
  targetValue: number;
  gapPct: number;
}

export interface ExecutiveDashboardResult {
  organizationId: string;
  organizationName: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  metrics: ExecutiveMetricResult[];
  alerts: ExecutiveAlert[];
  sections: ExecutivePdfSection[];
  sources: ExecutivePdfSource[];
  assumptions: string[];
  /** Months covered by trends and monthlySeries (YYYY-MM-DD, inclusive). */
  trendWindow: { start: string; end: string };
  monthlySeries: ExecutiveMonthlySeries[];
}

export interface KpiScorecardItem {
  targetId: string;
  metricKey: string;
  label: string;
  currency: string | null;
  unit: string;
  direction: 'higher_is_better' | 'lower_is_better';
  targetPeriod: string;
  periodStart: string;
  periodEnd: string;
  targetValue: number;
  actualValue: number | null;
  status: 'actual' | 'estimated' | 'unavailable';
  progressPct: number | null;
  targetStatus: 'on_track' | 'behind' | 'insufficient_data' | 'not_started';
  sampleSize: number;
  trend: Array<{ label: string; value: number }>;
  ownerName: string | null;
  /** The period has not ended; the actual covers the period start to today. */
  toDate: boolean;
}

export const TRANSACTION_TYPES = [
  'revenue', 'refund', 'cost_of_goods_sold', 'operating_expense',
  'acquisition_cost', 'other_income', 'tax', 'capital_expenditure',
] as const;
export type TransactionType = typeof TRANSACTION_TYPES[number];

export type ExecutiveMonthlyPoint = Record<TransactionType, number> & {
  /** YYYY-MM */
  month: string;
  /** Committed transactions dated in this month. */
  recordCount: number;
  /** Recurring run-rate at month end (or period end); null when this currency has no eligible contracts in the window. */
  mrr: number | null;
};

export interface ExecutiveMonthlySeries {
  currency: string;
  /** Transaction types with at least one committed record in the window. */
  typesPresent: TransactionType[];
  points: ExecutiveMonthlyPoint[];
}

type TrendPoint = { label: string; value: number };

const round6 = (value: number) => Number(value.toFixed(6));

/**
 * Months used for trends: at least the 12 months ending at the period end, the whole
 * period when it is longer, and never more than 36 (the PDF trend limit).
 */
export function monthlyTrendWindow(periodStart: string, periodEnd: string): { start: string; months: string[]; snapshotDates: string[] } {
  const endMonth = new Date(`${periodEnd.slice(0, 7)}-01T00:00:00Z`);
  const startMonth = new Date(`${periodStart.slice(0, 7)}-01T00:00:00Z`);
  const twelveBack = new Date(endMonth);
  twelveBack.setUTCMonth(twelveBack.getUTCMonth() - 11);
  const limit = new Date(endMonth);
  limit.setUTCMonth(limit.getUTCMonth() - 35);
  let cursor = startMonth < twelveBack ? startMonth : twelveBack;
  if (cursor < limit) cursor = limit;

  const months: string[] = [];
  const snapshotDates: string[] = [];
  for (const date = new Date(cursor); date <= endMonth; date.setUTCMonth(date.getUTCMonth() + 1)) {
    months.push(date.toISOString().slice(0, 7));
    const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    snapshotDates.push(monthEnd < periodEnd ? monthEnd : periodEnd);
  }
  return { start: `${months[0]}-01`, months, snapshotDates };
}

/** One zero-filled point per month and currency from monthly transaction totals and MRR snapshots. */
export function buildMonthlySeries(
  months: string[],
  transactionRows: Array<{ currency: string; month: string; transaction_type: string; total_amount: number | string; record_count: number | string }>,
  mrrRows: Array<{ snapshot_date: string; currency: string; mrr: number | string }>,
): ExecutiveMonthlySeries[] {
  const byCurrency = new Map<string, { types: Set<TransactionType>; points: Map<string, ExecutiveMonthlyPoint>; hasMrr: boolean }>();
  const entry = (currencyInput: string) => {
    const currency = String(currencyInput).trim();
    let found = byCurrency.get(currency);
    if (!found) {
      const points = new Map<string, ExecutiveMonthlyPoint>();
      for (const month of months) {
        const point = { month, recordCount: 0, mrr: null } as ExecutiveMonthlyPoint;
        for (const type of TRANSACTION_TYPES) point[type] = 0;
        points.set(month, point);
      }
      found = { types: new Set(), points, hasMrr: false };
      byCurrency.set(currency, found);
    }
    return found;
  };

  for (const row of transactionRows) {
    const type = row.transaction_type as TransactionType;
    if (!TRANSACTION_TYPES.includes(type)) continue;
    const series = entry(row.currency);
    const point = series.points.get(row.month);
    if (!point) continue;
    point[type] = round6(point[type] + numeric(row.total_amount));
    point.recordCount += numeric(row.record_count);
    series.types.add(type);
  }
  for (const row of mrrRows) {
    const series = entry(row.currency);
    series.hasMrr = true;
    const point = series.points.get(String(row.snapshot_date).slice(0, 7));
    if (point) point.mrr = round6(numeric(row.mrr));
  }

  return Array.from(byCurrency.entries())
    .filter(([currency]) => currency !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, series]) => ({
      currency,
      typesPresent: TRANSACTION_TYPES.filter((type) => series.types.has(type)),
      points: Array.from(series.points.values()).map((point) => ({
        ...point,
        mrr: series.hasMrr ? (point.mrr ?? 0) : null,
      })),
    }));
}

/**
 * Monthly trend per metric key for one currency. Derived metrics get a trend only when
 * the inputs their period value needs are present, mirroring the KPI rules.
 */
export function metricTrendsFromSeries(series: ExecutiveMonthlySeries): Record<string, TrendPoint[]> {
  const has = (type: TransactionType) => series.typesPresent.includes(type);
  const line = (value: (point: ExecutiveMonthlyPoint) => number) =>
    series.points.map((point) => ({ label: point.month, value: round6(value(point)) }));
  const trends: Record<string, TrendPoint[]> = {};
  for (const type of series.typesPresent) trends[type] = line((point) => point[type]);
  if (has('revenue')) trends.net_revenue = line((p) => p.revenue - p.refund);
  if (has('revenue') && has('cost_of_goods_sold')) {
    trends.gross_profit = line((p) => p.revenue - p.refund - p.cost_of_goods_sold);
    if (has('operating_expense')) {
      trends.operating_result = line((p) => p.revenue - p.refund - p.cost_of_goods_sold - p.operating_expense - p.acquisition_cost);
    }
  }
  if (series.points.some((point) => point.mrr !== null)) {
    trends.mrr = line((p) => p.mrr ?? 0);
    trends.arr = line((p) => (p.mrr ?? 0) * 12);
  }
  return trends;
}

interface AmountRow {
  currency: string;
  transaction_type: string;
  record_count: number | string;
  total_amount: number | string;
}

interface MonthlyTransactionRow {
  currency: string;
  month: string;
  transaction_type: string;
  total_amount: number | string;
  record_count: number | string;
}

interface MonthlyMrrRow {
  snapshot_date: string;
  currency: string;
  mrr: number | string;
}

interface ContractSnapshotRow {
  snapshot_date: string;
  currency: string;
  contract_count: number | string;
  customer_count: number | string;
  mrr: number | string;
}

interface PipelineRow {
  currency: string;
  status: string;
  record_count: number | string;
  total_amount: number | string;
  weighted_amount: number | string;
}

interface AiBreakdownRow {
  provider: string;
  operation_type: string;
  operation_count: number | string;
  total_tokens: number | string;
  priced_count: number | string;
  unpriced_count: number | string;
  priced_cost_usd: number | string;
}

interface TargetRow {
  metric_key: string;
  target_value: string | number;
  unit: string;
  currency: string | null;
  direction: 'higher_is_better' | 'lower_is_better';
  alert_threshold_pct: string | number | null;
  minimum_sample_size: number | string;
  owner_name: string | null;
}

interface SourceRow {
  source_type: string;
  source_name: string;
  record_count: number | string;
  last_updated: Date | string | null;
}

function numeric(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeMonthlyRecurringAmount(amountInput: number, interval: string): number | null {
  const amount = Number(amountInput);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  switch (interval) {
    case 'weekly': return amount * 52 / 12;
    case 'monthly': return amount;
    case 'quarterly': return amount / 3;
    case 'annual': return amount / 12;
    default: return null;
  }
}

export function calculateTargetAssessment(
  value: number,
  target: number,
  direction: 'higher_is_better' | 'lower_is_better',
): { met: boolean; progressPct: number | null; gapPct: number | null } {
  if (!Number.isFinite(value) || !Number.isFinite(target)) {
    return { met: false, progressPct: null, gapPct: null };
  }
  const met = direction === 'higher_is_better' ? value >= target : value <= target;
  // A percentage variance from zero is mathematically undefined. Keep the target
  // state, but suppress percentage-based threshold alerts for this case.
  if (target === 0) return { met, progressPct: met ? 100 : null, gapPct: met ? 0 : null };
  const progressPct = direction === 'higher_is_better'
    ? (value * 100) / target
    : (target / value) * 100;
  const gapPct = met ? 0 : direction === 'higher_is_better'
    ? ((target - value) / Math.abs(target)) * 100
    : ((value - target) / Math.abs(target)) * 100;
  const safeProgressPct = Number.isFinite(progressPct) ? progressPct : null;
  const safeGapPct = Number.isFinite(gapPct) ? Math.max(0, gapPct) : null;
  return { met, progressPct: safeProgressPct, gapPct: safeGapPct };
}

export function escapeCsvField(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  const formulaLike = /^[\s]*[=+@]/.test(text) || /^[\s]*[\t\r]/.test(text)
    || (/^[\s]*-/.test(text) && !/^\s*-?\d+(?:\.\d+)?$/.test(text));
  if (formulaLike) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function safeSpreadsheetText(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const formulaLike = /^[\s]*[=+@]/.test(text) || /^[\s]*[\t\r]/.test(text)
    || (/^[\s]*-/.test(text) && !/^\s*-?\d+(?:\.\d+)?$/.test(text));
  return formulaLike ? `'${text}` : text;
}

@Injectable()
export class ExecutiveAnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async getDashboard(
    actor: ExecutiveAnalyticsActor,
    startInput?: unknown,
    endInput?: unknown,
  ): Promise<ExecutiveDashboardResult> {
    this.assertAdmin(actor);
    const period = this.parsePeriod(startInput, endInput);
    const todayUtc = new Date().toISOString().slice(0, 10);
    const isHistoricalPeriod = period.end < todayUtc;
    const trendWindow = monthlyTrendWindow(period.start, period.end);
    return this.db.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');

      const orgResult = await client.query<{ name: string }>(
        'SELECT name FROM organizations WHERE id = $1',
        [actor.organizationId],
      );
      const organizationName = orgResult.rows[0]?.name;
      if (!organizationName) throw new NotFoundException('Organisation not found.');

      const [transactionsResult, trendResult, monthlyMrrResult, contractsResult, pipelineResult, taskResult, documentResult,
        meetingResult, projectResult, aiResult, aiBreakdownResult, targetsResult, sourcesResult] = await Promise.all([
        client.query<AmountRow>(
          `SELECT currency, transaction_type, COUNT(*)::int AS record_count,
                  COALESCE(SUM(amount), 0)::numeric AS total_amount
           FROM executive_financial_transactions
           WHERE organization_id = $1 AND transaction_date BETWEEN $2::date AND $3::date
           GROUP BY currency, transaction_type ORDER BY currency, transaction_type`,
          [actor.organizationId, period.start, period.end],
        ),
        // Monthly totals per type over the trend window (at least 12 months, see monthlyTrendWindow).
        client.query<MonthlyTransactionRow>(
          `SELECT currency, TO_CHAR(DATE_TRUNC('month', transaction_date), 'YYYY-MM') AS month,
                  transaction_type, COUNT(*)::int AS record_count,
                  COALESCE(SUM(amount), 0)::numeric AS total_amount
           FROM executive_financial_transactions
           WHERE organization_id = $1 AND transaction_date BETWEEN $2::date AND $3::date
           GROUP BY currency, DATE_TRUNC('month', transaction_date), transaction_type
           ORDER BY currency, DATE_TRUNC('month', transaction_date), transaction_type`,
          [actor.organizationId, trendWindow.start, period.end],
        ),
        // Recurring run-rate at each month end in the window, same eligibility rules as the period snapshot.
        client.query<MonthlyMrrRow>(
          `WITH snapshot_dates AS (SELECT UNNEST($2::date[]) AS snapshot_date)
           SELECT d.snapshot_date::text AS snapshot_date, c.currency,
                  COALESCE(SUM(CASE c.billing_interval
                    WHEN 'weekly' THEN c.recurring_amount * 52 / 12
                    WHEN 'monthly' THEN c.recurring_amount
                    WHEN 'quarterly' THEN c.recurring_amount / 3
                    WHEN 'annual' THEN c.recurring_amount / 12
                    ELSE 0 END), 0)::numeric AS mrr
           FROM snapshot_dates d
           JOIN executive_customer_contracts c
             ON c.organization_id = $1
            AND (
              c.status = 'active'
              OR (c.status = 'cancelled' AND c.cancelled_at IS NOT NULL AND c.cancelled_at > d.snapshot_date)
              OR (c.status = 'expired' AND c.end_date IS NOT NULL AND c.end_date >= d.snapshot_date)
            )
            AND c.start_date <= d.snapshot_date
            AND (c.end_date IS NULL OR c.end_date >= d.snapshot_date)
            AND (c.cancelled_at IS NULL OR c.cancelled_at > d.snapshot_date)
           GROUP BY d.snapshot_date, c.currency
           ORDER BY d.snapshot_date, c.currency`,
          [actor.organizationId, trendWindow.snapshotDates],
        ),
        client.query<ContractSnapshotRow>(
          `WITH snapshot_dates AS (
             SELECT $2::date AS snapshot_date UNION SELECT $3::date AS snapshot_date
           )
           SELECT d.snapshot_date::text AS snapshot_date, c.currency,
                  COUNT(*)::int AS contract_count,
                  COUNT(DISTINCT c.customer_key)::int AS customer_count,
                  COALESCE(SUM(CASE c.billing_interval
                    WHEN 'weekly' THEN c.recurring_amount * 52 / 12
                    WHEN 'monthly' THEN c.recurring_amount
                    WHEN 'quarterly' THEN c.recurring_amount / 3
                    WHEN 'annual' THEN c.recurring_amount / 12
                    ELSE 0 END), 0)::numeric AS mrr
           FROM snapshot_dates d
           JOIN executive_customer_contracts c
             ON c.organization_id = $1
            AND (
              c.status = 'active'
              OR (c.status = 'cancelled' AND c.cancelled_at IS NOT NULL AND c.cancelled_at > d.snapshot_date)
              OR (c.status = 'expired' AND c.end_date IS NOT NULL AND c.end_date >= d.snapshot_date)
            )
            AND c.start_date <= d.snapshot_date
            AND (c.end_date IS NULL OR c.end_date >= d.snapshot_date)
            AND (c.cancelled_at IS NULL OR c.cancelled_at > d.snapshot_date)
           GROUP BY d.snapshot_date, c.currency
           ORDER BY d.snapshot_date, c.currency`,
          [actor.organizationId, period.start, period.end],
        ),
        client.query<PipelineRow>(
          `SELECT currency,
                  CASE WHEN status IN ('won', 'lost') AND closed_at > $3::date THEN 'open' ELSE status END AS status,
                  COUNT(*)::int AS record_count,
                  COALESCE(SUM(amount), 0)::numeric AS total_amount,
                  COALESCE(SUM(amount * probability) FILTER (
                    WHERE status = 'open' OR (status IN ('won', 'lost') AND closed_at > $3::date)
                  ), 0)::numeric AS weighted_amount
           FROM executive_pipeline_opportunities
           WHERE organization_id = $1
             AND created_at < ($3::date + INTERVAL '1 day')
             AND (status = 'open' OR closed_at BETWEEN $2::date AND $3::date
                  OR (status IN ('won', 'lost') AND closed_at > $3::date))
           GROUP BY currency, CASE WHEN status IN ('won', 'lost') AND closed_at > $3::date THEN 'open' ELSE status END
           ORDER BY currency, status`,
          [actor.organizationId, period.start, period.end],
        ),
        client.query(
          `SELECT
             COUNT(*) FILTER (WHERE created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day'))::int AS created_count,
             COUNT(*) FILTER (WHERE completed_at >= $2::date AND completed_at < ($3::date + INTERVAL '1 day'))::int AS completed_count,
             COUNT(*) FILTER (WHERE due_date < ($3::date + INTERVAL '1 day') AND status NOT IN ('done', 'cancelled'))::int AS overdue_count,
             COUNT(*) FILTER (WHERE created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day'))::int AS created_sample,
             COUNT(*) FILTER (WHERE completed_at >= $2::date AND completed_at < ($3::date + INTERVAL '1 day'))::int AS completed_sample,
             COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < ($3::date + INTERVAL '1 day'))::int AS due_sample,
             COUNT(*)::int AS task_sample
           FROM tasks
           WHERE organization_id = $1
             AND created_at < ($3::date + INTERVAL '1 day')`,
          [actor.organizationId, period.start, period.end],
        ),
        client.query(
          `SELECT COUNT(*)::int AS uploaded_count,
                  COUNT(*) FILTER (WHERE status::text = 'indexed')::int AS indexed_count,
                  COUNT(*) FILTER (WHERE status::text = 'failed')::int AS failed_count,
                  MAX(updated_at) AS last_updated
           FROM documents
           WHERE organization_id = $1 AND created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day')`,
          [actor.organizationId, period.start, period.end],
        ),
        client.query(
          `SELECT COUNT(*) FILTER (WHERE created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day'))::int AS created_count,
                  COUNT(*) FILTER (WHERE status::text = 'completed' AND completed_at >= $2::date AND completed_at < ($3::date + INTERVAL '1 day'))::int AS completed_count,
                  COALESCE(AVG(duration_seconds) FILTER (WHERE status::text = 'completed' AND duration_seconds IS NOT NULL AND completed_at >= $2::date AND completed_at < ($3::date + INTERVAL '1 day')), 0)::numeric AS average_duration_seconds,
                  COUNT(*) FILTER (WHERE status::text = 'completed' AND duration_seconds IS NOT NULL AND completed_at >= $2::date AND completed_at < ($3::date + INTERVAL '1 day'))::int AS duration_sample,
                  MAX(updated_at) AS last_updated
           FROM meetings
           WHERE organization_id = $1
             AND ((created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day'))
               OR (completed_at >= $2::date AND completed_at < ($3::date + INTERVAL '1 day')))` ,
          [actor.organizationId, period.start, period.end],
        ),
        client.query<{ status: string; project_count: number | string; created_count: number | string; updated_count: number | string }>(
          `SELECT status, COUNT(*)::int AS project_count,
                  COUNT(*) FILTER (WHERE created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day'))::int AS created_count,
                  COUNT(*) FILTER (WHERE updated_at >= $2::date AND updated_at < ($3::date + INTERVAL '1 day'))::int AS updated_count
           FROM projects
           WHERE organization_id = $1
             AND ((created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day'))
               OR (updated_at >= $2::date AND updated_at < ($3::date + INTERVAL '1 day')))
           GROUP BY status ORDER BY status`,
          [actor.organizationId, period.start, period.end],
        ),
        client.query(
          `SELECT COUNT(*)::int AS operation_count,
                  COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
                  COUNT(*) FILTER (WHERE pricing_id IS NOT NULL AND priced_at IS NOT NULL)::int AS priced_count,
                  COUNT(*) FILTER (WHERE pricing_id IS NULL OR priced_at IS NULL)::int AS unpriced_count,
                  COALESCE(SUM(input_cost_usd + output_cost_usd + audio_cost_usd)
                    FILTER (WHERE pricing_id IS NOT NULL AND priced_at IS NOT NULL), 0)::numeric AS priced_cost_usd,
                  MAX(created_at) AS last_updated
           FROM ai_usage
           WHERE organization_id = $1 AND created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day')`,
          [actor.organizationId, period.start, period.end],
        ),
        client.query<AiBreakdownRow>(
          `SELECT provider, operation_type, COUNT(*)::int AS operation_count,
                  COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
                  COUNT(*) FILTER (WHERE pricing_id IS NOT NULL AND priced_at IS NOT NULL)::int AS priced_count,
                  COUNT(*) FILTER (WHERE pricing_id IS NULL OR priced_at IS NULL)::int AS unpriced_count,
                  COALESCE(SUM(input_cost_usd + output_cost_usd + audio_cost_usd)
                    FILTER (WHERE pricing_id IS NOT NULL AND priced_at IS NOT NULL), 0)::numeric AS priced_cost_usd
           FROM ai_usage
           WHERE organization_id = $1 AND created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day')
           GROUP BY provider, operation_type ORDER BY provider, operation_type LIMIT 99`,
          [actor.organizationId, period.start, period.end],
        ),
        client.query<TargetRow>(
          `SELECT t.metric_key, t.target_value::text, t.unit, NULLIF(BTRIM(t.currency::text), '') AS currency,
                  t.direction, t.alert_threshold_pct::text, t.minimum_sample_size,
                  u.name AS owner_name
           FROM executive_metric_targets t
           LEFT JOIN users u ON u.organization_id = t.organization_id AND u.id = t.owner_id
           WHERE t.organization_id = $1
             AND t.period_start = $2::date AND t.period_end = $3::date
           ORDER BY CASE WHEN t.period_start = $2::date AND t.period_end = $3::date THEN 0 ELSE 1 END,
                    t.period_start DESC, t.created_at DESC`,
          [actor.organizationId, period.start, period.end],
        ),
        client.query<SourceRow>(
          `SELECT 'financial_transactions'::text AS source_type, 'Imported financial transactions'::text AS source_name,
                  COUNT(*)::int AS record_count, MAX(created_at) AS last_updated
           FROM executive_financial_transactions
           WHERE organization_id = $1 AND transaction_date BETWEEN $2::date AND $3::date
           UNION ALL
           SELECT 'customer_contracts', 'Imported recurring customer contracts', COUNT(*)::int, MAX(created_at)
           FROM executive_customer_contracts
           WHERE organization_id = $1 AND start_date <= $3::date
             AND (end_date IS NULL OR end_date >= $2::date)
           UNION ALL
           SELECT 'pipeline_opportunities', 'Imported sales pipeline opportunities', COUNT(*)::int, MAX(created_at)
           FROM executive_pipeline_opportunities
           WHERE organization_id = $1 AND created_at < ($3::date + INTERVAL '1 day')
             AND (status = 'open' OR closed_at BETWEEN $2::date AND $3::date
                  OR (status IN ('won', 'lost') AND closed_at > $3::date))
           UNION ALL
           SELECT 'tasks', 'Lumorius tasks', COUNT(*)::int, MAX(updated_at)
           FROM tasks
           WHERE organization_id = $1
             AND ((created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day'))
               OR (completed_at >= $2::date AND completed_at < ($3::date + INTERVAL '1 day')))
           UNION ALL
           SELECT 'documents', 'Company Brain documents', COUNT(*)::int, MAX(updated_at)
           FROM documents
           WHERE organization_id = $1 AND created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day')
           UNION ALL
           SELECT 'meetings', 'Meeting Intelligence records', COUNT(*)::int, MAX(updated_at)
           FROM meetings
           WHERE organization_id = $1
             AND ((created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day'))
               OR (completed_at >= $2::date AND completed_at < ($3::date + INTERVAL '1 day')))
           UNION ALL
           SELECT 'projects', 'Projects', COUNT(*)::int, MAX(updated_at)
           FROM projects
           WHERE organization_id = $1
             AND ((created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day'))
               OR (updated_at >= $2::date AND updated_at < ($3::date + INTERVAL '1 day')))
           UNION ALL
           SELECT 'ai_usage', 'AI usage and priced cost records', COUNT(*)::int, MAX(created_at)
           FROM ai_usage
           WHERE organization_id = $1 AND created_at >= $2::date AND created_at < ($3::date + INTERVAL '1 day')`,
          [actor.organizationId, period.start, period.end],
        ),
      ]);

      const transactionRows = transactionsResult.rows;
      const contractRows = contractsResult.rows;
      const pipelineRows = pipelineResult.rows;
      const metrics: ExecutiveMetricResult[] = [];
      const alerts: ExecutiveAlert[] = [];
      const currencySet = new Set<string>();
      for (const row of transactionRows) currencySet.add(String(row.currency).trim());
      for (const row of contractRows) currencySet.add(String(row.currency).trim());
      for (const row of pipelineRows) currencySet.add(String(row.currency).trim());
      for (const row of targetsResult.rows) {
        if (row.currency) currencySet.add(String(row.currency).trim());
      }
      currencySet.delete('');

      const byCurrencyType = new Map<string, { count: number; amount: number }>();
      for (const row of transactionRows) {
        byCurrencyType.set(`${String(row.currency).trim()}|${row.transaction_type}`, {
          count: numeric(row.record_count), amount: numeric(row.total_amount),
        });
      }
      const monthlySeries = buildMonthlySeries(trendWindow.months, trendResult.rows, monthlyMrrResult.rows);
      const trendsByCurrency = new Map(monthlySeries.map((series) => [series.currency, metricTrendsFromSeries(series)]));
      const contractsByCurrencyDate = new Map<string, ContractSnapshotRow>();
      for (const row of contractRows) contractsByCurrencyDate.set(`${String(row.snapshot_date).slice(0, 10)}|${String(row.currency).trim()}`, row);
      const pipelineByCurrencyStatus = new Map<string, PipelineRow>();
      for (const row of pipelineRows) pipelineByCurrencyStatus.set(`${String(row.currency).trim()}|${row.status}`, row);

      const addMetric = (input: Omit<ExecutiveMetricResult, 'targetValue'> & { targetValue?: number | null }) => metrics.push({ ...input, targetValue: input.targetValue ?? null });
      const financialTypes = [
        ['revenue', 'Revenue', 'Revenue transactions'],
        ['refund', 'Refunds', 'Refund transactions'],
        ['cost_of_goods_sold', 'Cost of goods sold', 'Direct cost transactions'],
        ['operating_expense', 'Operating expenses', 'Operating expense transactions'],
        ['acquisition_cost', 'Customer acquisition spend', 'Acquisition cost transactions'],
        ['other_income', 'Other income', 'Other income transactions'],
        ['tax', 'Tax', 'Tax transactions'],
        ['capital_expenditure', 'Capital expenditure', 'Capital expenditure transactions'],
      ] as const;

      const currencies = currencySet.size ? Array.from(currencySet).sort() : [null];
      for (const currency of currencies) {
        for (const [type, label, definition] of financialTypes) {
          const value = currency ? byCurrencyType.get(`${currency}|${type}`) : undefined;
          const present = !!value && value.count > 0;
          addMetric({
            key: currency ? `${type}_${currency.toLowerCase()}` : type,
            metricKey: type,
            label,
            category: 'Financial performance',
            status: present ? 'actual' : 'unavailable',
            value: present ? value!.amount : null,
            unit: currency ? currency : 'currency',
            currency: currency ?? undefined,
            definition,
            formula: `SUM(amount) WHERE transaction_type = '${type}'`,
            sourceLabels: ['Imported financial transactions'],
            sampleSize: value?.count ?? 0,
            note: present ? undefined : 'No committed records of this type were found for this currency and reporting period.',
          });
        }
        const revenue = currency ? byCurrencyType.get(`${currency}|revenue`) : undefined;
        const refunds = currency ? byCurrencyType.get(`${currency}|refund`) : undefined;
        const cogs = currency ? byCurrencyType.get(`${currency}|cost_of_goods_sold`) : undefined;
        const netRevenueAvailable = !!revenue && revenue.count > 0;
        addMetric({
          key: currency ? `net_revenue_${currency.toLowerCase()}` : 'net_revenue', metricKey: 'net_revenue',
          label: 'Net revenue', category: 'Financial performance',
          status: netRevenueAvailable ? (refunds?.count ? 'actual' : 'estimated') : 'unavailable',
          value: netRevenueAvailable ? revenue!.amount - (refunds?.amount ?? 0) : null,
          unit: currency ?? 'currency', currency: currency ?? undefined,
          definition: 'Revenue less imported refunds.', formula: 'SUM(revenue) - SUM(refund)',
          sourceLabels: ['Imported financial transactions'], sampleSize: (revenue?.count ?? 0) + (refunds?.count ?? 0),
          note: !netRevenueAvailable ? 'No revenue transaction records were found.' : (!refunds?.count ? 'No refund rows were supplied; refunds are treated as zero, so confirm source completeness.' : undefined),
        });
        const opEx = currency ? byCurrencyType.get(`${currency}|operating_expense`) : undefined;
        const acquisition = currency ? byCurrencyType.get(`${currency}|acquisition_cost`) : undefined;
        const grossAvailable = !!revenue && revenue.count > 0 && !!cogs && cogs.count > 0;
        const grossValue = grossAvailable ? revenue!.amount - (refunds?.amount ?? 0) - cogs!.amount : null;
        addMetric({
          key: currency ? `gross_profit_${currency.toLowerCase()}` : 'gross_profit', metricKey: 'gross_profit',
          label: 'Gross profit', category: 'Financial performance',
          status: grossAvailable ? (refunds?.count ? 'actual' : 'estimated') : 'unavailable',
          value: grossValue, unit: currency ?? 'currency', currency: currency ?? undefined,
          definition: 'Revenue less refunds and cost of goods sold.',
          formula: 'Revenue - refunds - cost_of_goods_sold',
          sourceLabels: ['Imported financial transactions'], sampleSize: (revenue?.count ?? 0) + (refunds?.count ?? 0) + (cogs?.count ?? 0),
          note: !grossAvailable ? 'Revenue and cost-of-goods-sold records are both required.' : (!refunds?.count ? 'No refund rows were supplied; refunds are treated as zero, so confirm source completeness.' : undefined),
        });
        const operatingAvailable = grossAvailable && !!opEx && opEx.count > 0;
        addMetric({
          key: currency ? `operating_result_${currency.toLowerCase()}` : 'operating_result', metricKey: 'operating_result',
          label: 'Operating result before tax and capital expenditure', category: 'Financial performance',
          status: operatingAvailable ? (refunds?.count && acquisition?.count ? 'actual' : 'estimated') : 'unavailable',
          value: operatingAvailable ? grossValue! - opEx!.amount - (acquisition?.amount ?? 0) : null,
          unit: currency ?? 'currency', currency: currency ?? undefined,
          definition: 'Gross profit less operating expenses and acquisition costs.',
          formula: 'Revenue - refunds - cost_of_goods_sold - operating_expense - acquisition_cost',
          sourceLabels: ['Imported financial transactions'], sampleSize: (revenue?.count ?? 0) + (cogs?.count ?? 0) + (opEx?.count ?? 0) + (acquisition?.count ?? 0),
          note: !operatingAvailable ? 'Revenue, cost of goods sold and operating expense records are required.' : 'Acquisition spend is included only when supplied; verify transaction import completeness.',
        });

        const endContract = contractsByCurrencyDate.get(`${period.end}|${currency ?? ''}`);
        const startContract = contractsByCurrencyDate.get(`${period.start}|${currency ?? ''}`);
        const endMrr = endContract ? numeric(endContract.mrr) : null;
        const contractCount = endContract ? numeric(endContract.contract_count) : 0;
        addMetric({
          key: currency ? `mrr_${currency.toLowerCase()}` : 'mrr', metricKey: 'mrr', label: 'Monthly recurring revenue',
          category: 'Recurring revenue', status: contractCount > 0 ? (isHistoricalPeriod ? 'estimated' : 'actual') : 'unavailable',
          value: endMrr, unit: currency ?? 'currency', currency: currency ?? undefined,
          definition: 'Monthly-normalized recurring amount for active contracts at period end.',
          formula: 'SUM(active contract recurring_amount normalized to monthly)',
          sourceLabels: ['Imported recurring customer contracts'], sampleSize: contractCount,
          note: contractCount > 0 ? (isHistoricalPeriod ? 'Historical contract status snapshots are not stored; current status and date fields are used to reconstruct this period-end snapshot.' : 'Snapshot as of reporting period end; active contracts are included.') : 'No eligible recurring contracts were found at period end.',
        });
        addMetric({
          key: currency ? `arr_${currency.toLowerCase()}` : 'arr', metricKey: 'arr', label: 'Annual recurring revenue',
          category: 'Recurring revenue', status: contractCount > 0 ? (isHistoricalPeriod ? 'estimated' : 'actual') : 'unavailable',
          value: endMrr === null ? null : endMrr * 12, unit: currency ?? 'currency', currency: currency ?? undefined,
          definition: 'Annualized monthly recurring revenue snapshot.', formula: 'MRR * 12',
          sourceLabels: ['Imported recurring customer contracts'], sampleSize: contractCount,
          note: contractCount > 0 ? (isHistoricalPeriod ? 'Annualized run-rate, not recognized revenue; historical contract status is reconstructed from current status and dates.' : 'Annualized run-rate, not recognized revenue.') : 'No eligible recurring contracts were found at period end.',
        });
        const startMrr = startContract ? numeric(startContract.mrr) : null;
        const canCompareMrr = startMrr !== null && startMrr > 0 && endMrr !== null;
        addMetric({
          key: currency ? `mrr_growth_pct_${currency.toLowerCase()}` : 'mrr_growth_pct', metricKey: 'mrr_growth_pct',
          label: 'MRR change over reporting period', category: 'Recurring revenue',
          status: canCompareMrr ? 'estimated' : 'unavailable',
          value: canCompareMrr ? ((endMrr! - startMrr!) / startMrr!) * 100 : null,
          unit: '%', currency: currency ?? undefined, definition: 'Change in monthly recurring contract run-rate between period start and end.',
          formula: '(period_end_MRR - period_start_MRR) / period_start_MRR * 100',
          sourceLabels: ['Imported recurring customer contracts'], sampleSize: contractCount,
          note: canCompareMrr ? 'Historical contract status snapshots are not stored; current status and date fields are used for both comparison dates.' : 'A non-zero eligible-contract MRR snapshot at period start is required.',
        });
      }

      // Customer-level unit economics are deliberately withheld: acquisition attribution and cohort lifetime data are not in the current schema.
      for (const [metricKey, label, note] of [
        ['cac', 'Customer acquisition cost (CAC)', 'Unavailable: acquisition spend is not linked to a verified new-customer cohort.'],
        ['ltv', 'Customer lifetime value (LTV)', 'Unavailable: customer-level revenue margin and lifetime/cohort history are not available.'],
        ['customer_retention_rate', 'Customer retention rate', 'Unavailable: a complete customer cohort and churn-event history is required.'],
      ] as const) {
        addMetric({ key: metricKey, metricKey, label, category: 'Customer economics', status: 'unavailable', value: null,
          unit: metricKey === 'cac' || metricKey === 'ltv' ? 'currency' : '%', definition: note,
          formula: 'Not calculated until required source data is available.', sourceLabels: [], sampleSize: 0, note });
      }

      for (const currency of currencies.filter((item): item is string => !!item)) {
        const open = pipelineByCurrencyStatus.get(`${currency}|open`);
        const won = pipelineByCurrencyStatus.get(`${currency}|won`);
        const lost = pipelineByCurrencyStatus.get(`${currency}|lost`);
        addMetric({ key: `open_pipeline_${currency.toLowerCase()}`, metricKey: 'open_pipeline', label: 'Open sales pipeline',
          category: 'Sales pipeline', status: numeric(open?.record_count) > 0 ? (isHistoricalPeriod ? 'estimated' : 'actual') : 'unavailable',
          value: open ? numeric(open.total_amount) : null, unit: currency, currency,
          definition: 'Sum of open pipeline opportunity amounts.', formula: "SUM(amount) WHERE status = 'open'",
          sourceLabels: ['Imported sales pipeline opportunities'], sampleSize: numeric(open?.record_count),
          note: open ? (isHistoricalPeriod ? 'Historical open status is reconstructed using current status and closed_at; historical stage snapshots are not available.' : undefined) : 'No open opportunities were found for this currency.' });
        addMetric({ key: `weighted_pipeline_${currency.toLowerCase()}`, metricKey: 'weighted_pipeline', label: 'Weighted open pipeline',
          category: 'Sales pipeline', status: numeric(open?.record_count) > 0 ? (isHistoricalPeriod ? 'estimated' : 'actual') : 'unavailable',
          value: open ? numeric(open.weighted_amount) : null, unit: currency, currency,
          definition: 'Open opportunity amount multiplied by its recorded probability.', formula: 'SUM(amount * probability) WHERE status = open',
          sourceLabels: ['Imported sales pipeline opportunities'], sampleSize: numeric(open?.record_count),
          note: open ? (isHistoricalPeriod ? 'Historical open status is reconstructed using current status and closed_at; historical stage snapshots are not available.' : undefined) : 'No open opportunities were found for this currency.' });
        addMetric({ key: `closed_won_${currency.toLowerCase()}`, metricKey: 'closed_won', label: 'Closed-won opportunities',
          category: 'Sales pipeline', status: numeric(won?.record_count) > 0 ? 'actual' : 'unavailable',
          value: won ? numeric(won.total_amount) : null, unit: currency, currency,
          definition: 'Won opportunity amount closed within the reporting period.', formula: "SUM(amount) WHERE status = 'won' AND closed_at in period",
          sourceLabels: ['Imported sales pipeline opportunities'], sampleSize: numeric(won?.record_count),
          note: won ? undefined : 'No won opportunities with a close date in the reporting period.' });
        addMetric({ key: `closed_lost_${currency.toLowerCase()}`, metricKey: 'closed_lost', label: 'Closed-lost opportunities',
          category: 'Sales pipeline', status: numeric(lost?.record_count) > 0 ? 'actual' : 'unavailable',
          value: lost ? numeric(lost.total_amount) : null, unit: currency, currency,
          definition: 'Lost opportunity amount closed within the reporting period.', formula: "SUM(amount) WHERE status = 'lost' AND closed_at in period",
          sourceLabels: ['Imported sales pipeline opportunities'], sampleSize: numeric(lost?.record_count),
          note: lost ? undefined : 'No lost opportunities with a close date in the reporting period.' });
      }

      const task = taskResult.rows[0] ?? {};
      addMetric({ key: 'tasks_created', metricKey: 'tasks_created', label: 'Tasks created', category: 'Operations', status: 'actual',
        value: numeric(task.created_count), unit: 'tasks', definition: 'Tasks created during the reporting period.',
        formula: 'COUNT(tasks WHERE created_at in period)', sourceLabels: ['Lumorius tasks'], sampleSize: numeric(task.created_sample) });
      addMetric({ key: 'tasks_completed', metricKey: 'tasks_completed', label: 'Tasks completed', category: 'Operations', status: 'actual',
        value: numeric(task.completed_count), unit: 'tasks', definition: 'Tasks marked done with completed_at in the reporting period.',
        formula: 'COUNT(tasks WHERE completed_at in period)', sourceLabels: ['Lumorius tasks'], sampleSize: numeric(task.completed_sample) });
      addMetric({ key: 'tasks_overdue', metricKey: 'tasks_overdue', label: 'Overdue open tasks', category: 'Operations', status: isHistoricalPeriod ? 'estimated' : 'actual',
        value: numeric(task.overdue_count), unit: 'tasks', definition: 'Tasks past due at period end that are not done or cancelled.',
        formula: "COUNT(tasks WHERE due_date <= period_end AND status NOT IN ('done','cancelled'))", sourceLabels: ['Lumorius tasks'], sampleSize: numeric(task.due_sample),
        note: isHistoricalPeriod ? 'Current task status is used with the period-end due-date cutoff; historical status snapshots are unavailable.' : 'Current task status is used with the period-end due-date cutoff.' });

      const document = documentResult.rows[0] ?? {};
      addMetric({ key: 'documents_uploaded', metricKey: 'documents_uploaded', label: 'Documents uploaded', category: 'Operations', status: 'actual',
        value: numeric(document.uploaded_count), unit: 'documents', definition: 'Documents created in the reporting period.',
        formula: 'COUNT(documents WHERE created_at in period)', sourceLabels: ['Company Brain documents'], sampleSize: numeric(document.uploaded_count) });
      addMetric({ key: 'documents_indexed', metricKey: 'documents_indexed', label: 'Documents indexed', category: 'Operations', status: isHistoricalPeriod ? 'estimated' : 'actual',
        value: numeric(document.indexed_count), unit: 'documents', definition: 'Documents currently indexed among uploads in the reporting period.',
        formula: "COUNT(documents WHERE status='indexed')", sourceLabels: ['Company Brain documents'], sampleSize: numeric(document.uploaded_count),
        note: isHistoricalPeriod ? 'Status is current at report generation, not a historical status snapshot.' : undefined });
      addMetric({ key: 'documents_failed', metricKey: 'documents_failed', label: 'Documents failed', category: 'Operations', status: isHistoricalPeriod ? 'estimated' : 'actual',
        value: numeric(document.failed_count), unit: 'documents', definition: 'Documents currently failed among uploads in the reporting period.',
        formula: "COUNT(documents WHERE status='failed')", sourceLabels: ['Company Brain documents'], sampleSize: numeric(document.uploaded_count),
        note: isHistoricalPeriod ? 'Status is current at report generation, not a historical status snapshot.' : undefined });

      const meeting = meetingResult.rows[0] ?? {};
      addMetric({ key: 'meetings_created', metricKey: 'meetings_created', label: 'Meetings created', category: 'Operations', status: 'actual',
        value: numeric(meeting.created_count), unit: 'meetings', definition: 'Meetings created during the reporting period.',
        formula: 'COUNT(meetings WHERE created_at in period)', sourceLabels: ['Meeting Intelligence records'], sampleSize: numeric(meeting.created_count) });
      addMetric({ key: 'meetings_completed', metricKey: 'meetings_completed', label: 'Meetings completed', category: 'Operations', status: 'actual',
        value: numeric(meeting.completed_count), unit: 'meetings', definition: 'Meetings with completed status and completed_at in the reporting period.',
        formula: "COUNT(meetings WHERE status='completed' AND completed_at in period)", sourceLabels: ['Meeting Intelligence records'], sampleSize: numeric(meeting.completed_count) });
      addMetric({ key: 'meeting_average_duration_seconds', metricKey: 'meeting_average_duration_seconds', label: 'Average completed meeting duration', category: 'Operations', status: numeric(meeting.duration_sample) > 0 ? 'actual' : 'unavailable',
        value: numeric(meeting.duration_sample) > 0 ? numeric(meeting.average_duration_seconds) : null, unit: 'seconds',
        definition: 'Average duration for meetings completed during the reporting period.', formula: 'AVG(duration_seconds) WHERE status=completed and completed_at in period',
        sourceLabels: ['Meeting Intelligence records'], sampleSize: numeric(meeting.duration_sample),
        note: numeric(meeting.duration_sample) > 0 ? undefined : 'No completed meetings with a recorded duration were found in the reporting period.' });

      const projectCreatedCount = projectResult.rows.reduce((sum, row) => sum + numeric(row.created_count), 0);
      const projectUpdatedCount = projectResult.rows.reduce((sum, row) => sum + numeric(row.updated_count), 0);
      addMetric({ key: 'projects_created', metricKey: 'projects_created', label: 'Projects created', category: 'Operations', status: 'actual',
        value: projectCreatedCount, unit: 'projects', definition: 'Projects created during the reporting period.',
        formula: 'COUNT(projects WHERE created_at in period)', sourceLabels: ['Projects'], sampleSize: projectCreatedCount });
      addMetric({ key: 'projects_updated', metricKey: 'projects_updated', label: 'Projects updated', category: 'Operations', status: 'actual',
        value: projectUpdatedCount, unit: 'projects', definition: 'Projects updated during the reporting period.',
        formula: 'COUNT(projects WHERE updated_at in period)', sourceLabels: ['Projects'], sampleSize: projectUpdatedCount });
      const allProjectStatuses = projectResult.rows.map((row) => `${String(row.status).slice(0, 60)}: ${numeric(row.project_count)}`);
      const projectStatuses = allProjectStatuses.slice(0, 20);
      if (allProjectStatuses.length > 20) {
        projectStatuses.push(`${allProjectStatuses.length - 20} additional project statuses omitted from this report section.`);
      }
      const ai = aiResult.rows[0] ?? {};
      const operationCount = numeric(ai.operation_count);
      const pricedCount = numeric(ai.priced_count);
      const unpricedCount = numeric(ai.unpriced_count);
      addMetric({ key: 'ai_operations', metricKey: 'ai_operations', label: 'AI operations', category: 'AI economics', status: 'actual',
        value: operationCount, unit: 'operations', definition: 'AI usage records generated during the reporting period.',
        formula: 'COUNT(ai_usage)', sourceLabels: ['AI usage records'], sampleSize: operationCount });
      addMetric({ key: 'ai_tokens', metricKey: 'ai_tokens', label: 'AI tokens', category: 'AI economics', status: 'actual',
        value: numeric(ai.total_tokens), unit: 'tokens', definition: 'Total input and output tokens reported in the period.',
        formula: 'SUM(total_tokens)', sourceLabels: ['AI usage records'], sampleSize: operationCount });
      addMetric({ key: 'ai_unpriced_operations', metricKey: 'ai_unpriced_operations', label: 'Unpriced AI operations', category: 'AI economics', status: 'actual',
        value: unpricedCount, unit: 'operations', definition: 'AI usage records without a retained pricing snapshot and priced timestamp.',
        formula: 'COUNT(ai_usage WHERE pricing_id IS NULL OR priced_at IS NULL)', sourceLabels: ['AI usage records'], sampleSize: operationCount });
      addMetric({ key: 'ai_cost_usd', metricKey: 'ai_cost_usd', label: 'Priced AI expenditure', category: 'AI economics',
        status: pricedCount === 0 ? 'unavailable' : (unpricedCount > 0 ? 'estimated' : 'actual'),
        value: pricedCount > 0 ? numeric(ai.priced_cost_usd) : null, unit: 'USD', currency: 'USD',
        definition: 'Sum of input, output and audio costs from retained pricing snapshots.',
        formula: 'SUM(input_cost_usd + output_cost_usd + audio_cost_usd) WHERE pricing_id IS NOT NULL AND priced_at IS NOT NULL',
        sourceLabels: ['AI usage pricing snapshots'], sampleSize: pricedCount,
        note: pricedCount === 0 ? 'No priced AI usage records are available.' : (unpricedCount > 0 ? `${unpricedCount} operations are unpriced; the displayed amount is partial.` : undefined) });

      for (const metric of metrics) {
        if (!metric.currency || metric.category === 'AI economics') continue;
        const trend = trendsByCurrency.get(metric.currency)?.[metric.metricKey];
        if (trend && trend.length > 1) metric.trend = trend;
      }

      const targetMap = new Map<string, TargetRow>();
      for (const target of targetsResult.rows) {
        const key = `${target.metric_key}|${target.currency ? target.currency.trim() : ''}`;
        if (!targetMap.has(key)) targetMap.set(key, target);
      }
      for (const metric of metrics) {
        const target = targetMap.get(`${metric.metricKey}|${metric.currency ?? ''}`)
          ?? (!metric.currency ? targetMap.get(`${metric.metricKey}|`) : undefined);
        if (!target) continue;
        metric.targetValue = numeric(target.target_value);
        metric.alertThresholdPct = target.alert_threshold_pct === null ? null : numeric(target.alert_threshold_pct);
        metric.targetDirection = target.direction;
        metric.targetOwnerName = target.owner_name;
        const minimum = numeric(target.minimum_sample_size);
        if (metric.status === 'unavailable' || numeric(metric.sampleSize) < minimum || typeof metric.value !== 'number') {
          metric.targetStatus = 'insufficient_data';
          metric.targetProgressPct = null;
          continue;
        }
        const assessment = calculateTargetAssessment(metric.value, numeric(target.target_value), target.direction);
        metric.targetProgressPct = assessment.progressPct;
        metric.targetStatus = assessment.met ? 'on_track' : 'behind';
        const threshold = target.alert_threshold_pct === null ? null : numeric(target.alert_threshold_pct);
        if (metric.status === 'actual' && !assessment.met && threshold !== null && assessment.gapPct !== null && assessment.gapPct >= threshold) {
          alerts.push({
            metricKey: metric.metricKey, label: metric.label, currency: metric.currency,
            severity: 'warning', actualValue: metric.value, targetValue: numeric(target.target_value),
            gapPct: Number(assessment.gapPct.toFixed(2)),
            message: `${metric.label} is ${assessment.gapPct.toFixed(1)}% ${target.direction === 'higher_is_better' ? 'below' : 'above'} its configured target.`,
          });
        }
      }

      const freshnessItems = sourcesResult.rows.map((row) => {
        const updatedAt = row.last_updated
          ? (row.last_updated instanceof Date ? row.last_updated : new Date(String(row.last_updated))).toISOString()
          : 'no records / no update timestamp';
        return `${row.source_name}: ${updatedAt}`;
      });
      const sections: ExecutivePdfSection[] = [
        { title: 'Financial performance', body: 'Financial transaction totals are reported separately by currency. Derived profitability metrics are withheld or marked estimated when required transaction categories are missing.' },
        { title: 'Recurring revenue', body: 'MRR and ARR are snapshots of active imported customer contracts as of the reporting period end. ARR is an annualized run-rate, not recognized revenue.' },
        { title: 'Sales pipeline', body: 'Pipeline figures use imported opportunities. Weighted pipeline uses each open opportunity amount multiplied by its recorded probability.' },
        { title: 'Operational performance', items: [
          `Tasks created: ${numeric(task.created_count)}`,
          `Tasks completed: ${numeric(task.completed_count)}`,
          `Overdue open tasks at period-end due-date cutoff: ${numeric(task.overdue_count)} (using current task status)`,
          `Documents uploaded: ${numeric(document.uploaded_count)}; currently indexed: ${numeric(document.indexed_count)}; currently failed: ${numeric(document.failed_count)}`,
          `Meetings created: ${numeric(meeting.created_count)}; completed: ${numeric(meeting.completed_count)}`,
          ...(projectStatuses.length ? [`Project status counts: ${projectStatuses.join('; ')}`] : ['No project status records were returned for this period.']),
        ] },
        { title: 'AI economics', items: [
          `AI operations: ${operationCount}; tokens: ${numeric(ai.total_tokens)}; priced operations: ${pricedCount}; unpriced operations: ${unpricedCount}. Only priced usage snapshots contribute to reported AI expenditure.`,
          ...aiBreakdownResult.rows.map((row) => `${row.provider} / ${row.operation_type}: ${numeric(row.operation_count)} operations, ${numeric(row.total_tokens)} tokens, ${numeric(row.priced_count)} priced, ${numeric(row.unpriced_count)} unpriced, USD ${numeric(row.priced_cost_usd).toFixed(6)} priced cost`),
        ] },
        { title: 'Configured KPI alerts', items: alerts.length
          ? [
              ...alerts.slice(0, 99).map((alert) => alert.message),
              ...(alerts.length > 99 ? [`${alerts.length - 99} additional alerts are retained in the structured report and spreadsheet exports.`] : []),
            ]
          : ['No configured KPI threshold breaches were detected for metrics with sufficient sample sizes.'] },
        { title: 'Source freshness', items: freshnessItems },
        { title: 'Data limitations', items: [
          'CAC is unavailable because acquisition spend is not attributed to a verified new-customer cohort.',
          'LTV and customer retention are unavailable because customer-level cohort and lifetime history are not present in the current source model.',
          'Financial values in different currencies are never added together.',
          'Operational status counts reflect the source system state at report generation unless the metric explicitly uses an event timestamp.',
        ] },
      ];

      const sources: ExecutivePdfSource[] = sourcesResult.rows.map((row) => ({
        sourceType: row.source_type, sourceName: row.source_name,
        recordCount: numeric(row.record_count),
        periodStart: period.start, periodEnd: period.end,
      }));
      const assumptions = [
        'The report includes committed Executive Intelligence import records only. Actual means arithmetic over supplied records; source completeness is not independently verified.',
        'Historical task, document and pipeline status snapshots are not fully retained; those metrics are marked estimated where current status is used to reconstruct a past period.',
        'Recurring contract snapshots include status=active contracts whose start/end/cancellation dates make them active on the snapshot date.',
        'Weekly, monthly, quarterly and annual contract amounts are normalized to monthly recurring revenue using 52 weeks per year.',
        'Currency values are grouped and reported independently; no foreign-exchange conversion is performed.',
        'AI expenditure includes only usage rows with a pricing_id and priced_at timestamp. Unpriced usage is reported separately.',
        'CAC, LTV and customer retention are unavailable until customer acquisition attribution and cohort history are supplied.',
        `Monthly trends cover ${trendWindow.months.length} months ending at the period end (at least 12, at most 36) so short periods still show direction. KPI values themselves use the selected period only.`,
      ];

      return {
        organizationId: actor.organizationId,
        organizationName,
        periodStart: period.start,
        periodEnd: period.end,
        generatedAt: new Date().toISOString(),
        metrics,
        alerts,
        sections,
        sources,
        assumptions,
        trendWindow: { start: trendWindow.start, end: period.end },
        monthlySeries,
      };
    });
  }

  /**
   * Server-side metrics for goal tracking (Founder OS linked key results). Not exposed
   * over HTTP; callers decide who may link a goal to financial data.
   */
  dashboardForOrganization(organizationId: string, start: string, end: string): Promise<ExecutiveDashboardResult> {
    return this.getDashboard({ organizationId, userId: 'goal-sync', role: 'owner' }, start, end);
  }

  /**
   * Every KPI target with its actual over the target's own period (to date while the
   * period is running), computed by the same engine as the dashboard. Analytics and
   * Executive Intelligence both read this, so they always agree.
   */
  async getScorecard(actor: ExecutiveAnalyticsActor): Promise<{ generatedAt: string; items: KpiScorecardItem[] }> {
    this.assertAdmin(actor);
    const today = new Date().toISOString().slice(0, 10);
    const targets = await this.db.query<{
      id: string; metric_key: string; target_value: string; unit: string; currency: string | null;
      direction: 'higher_is_better' | 'lower_is_better'; target_period: string; period_start: string; period_end: string;
      minimum_sample_size: number | string; owner_name: string | null;
    }>(
      `SELECT t.id, t.metric_key, t.target_value::text, t.unit, NULLIF(BTRIM(t.currency::text), '') AS currency,
              t.direction, t.target_period, t.period_start::text, t.period_end::text, t.minimum_sample_size,
              u.name AS owner_name
         FROM executive_metric_targets t
         LEFT JOIN users u ON u.organization_id = t.organization_id AND u.id = t.owner_id
        WHERE t.organization_id = $1
        ORDER BY t.period_end DESC, t.created_at DESC
        LIMIT 24`,
      [actor.organizationId],
    );

    // One dashboard per distinct period (to date), most recent periods first.
    const periods = new Map<string, { start: string; end: string }>();
    for (const target of targets.rows) {
      if (target.period_start > today) continue;
      const end = target.period_end < today ? target.period_end : today;
      const key = `${target.period_start}|${end}`;
      if (!periods.has(key) && periods.size < 6) periods.set(key, { start: target.period_start, end });
    }
    const dashboards = new Map<string, ExecutiveDashboardResult>();
    for (const [key, period] of periods) dashboards.set(key, await this.getDashboard(actor, period.start, period.end));

    const items = targets.rows.map((target): KpiScorecardItem => {
      const targetValue = numeric(target.target_value);
      const base = {
        targetId: target.id, metricKey: target.metric_key, currency: target.currency, unit: target.unit,
        direction: target.direction, targetPeriod: target.target_period, periodStart: target.period_start,
        periodEnd: target.period_end, targetValue, ownerName: target.owner_name,
      };
      if (target.period_start > today) {
        return { ...base, label: target.metric_key.replace(/_/g, ' '), actualValue: null, status: 'unavailable', progressPct: null,
          targetStatus: 'not_started', sampleSize: 0, trend: [], toDate: false };
      }
      const end = target.period_end < today ? target.period_end : today;
      const dashboard = dashboards.get(`${target.period_start}|${end}`);
      const metric = dashboard?.metrics.find((item) => item.metricKey === target.metric_key && (item.currency ?? null) === (target.currency ?? null))
        ?? dashboard?.metrics.find((item) => item.metricKey === target.metric_key && !target.currency);
      const label = metric?.label ?? target.metric_key.replace(/_/g, ' ');
      const value = typeof metric?.value === 'number' && metric.status !== 'unavailable' ? metric.value : null;
      const enough = numeric(metric?.sampleSize) >= numeric(target.minimum_sample_size);
      const assessment = value !== null && enough ? calculateTargetAssessment(value, targetValue, target.direction) : null;
      return {
        ...base, label, actualValue: value,
        status: (metric?.status ?? 'unavailable') as KpiScorecardItem['status'],
        progressPct: assessment?.progressPct ?? null,
        targetStatus: value === null || !enough ? 'insufficient_data' : assessment!.met ? 'on_track' : 'behind',
        sampleSize: numeric(metric?.sampleSize),
        trend: metric?.trend ?? [],
        toDate: target.period_end > today,
      };
    });
    return { generatedAt: new Date().toISOString(), items };
  }

  async getReport(actor: ExecutiveAnalyticsActor, startInput?: unknown, endInput?: unknown): Promise<ExecutivePdfReport> {
    const dashboard = await this.getDashboard(actor, startInput, endInput);
    const actualCount = dashboard.metrics.filter((metric) => metric.status === 'actual').length;
    const estimatedCount = dashboard.metrics.filter((metric) => metric.status === 'estimated').length;
    const unavailableCount = dashboard.metrics.filter((metric) => metric.status === 'unavailable').length;
    return {
      organizationId: dashboard.organizationId,
      organizationName: dashboard.organizationName,
      reportTitle: 'Executive Intelligence Report',
      periodStart: dashboard.periodStart,
      periodEnd: dashboard.periodEnd,
      generatedAt: dashboard.generatedAt,
      generatedBy: actor.userId,
      reportVersion: '1.1b',
      executiveSummary: `This report contains ${actualCount} actual, ${estimatedCount} estimated and ${unavailableCount} unavailable metrics. ${dashboard.alerts.length} configured target alerts require attention. Financial figures are separated by currency.`,
      metrics: dashboard.metrics,
      alerts: dashboard.alerts,
      sections: dashboard.sections,
      sources: dashboard.sources,
      assumptions: dashboard.assumptions,
    };
  }

  async listTargets(actor: ExecutiveAnalyticsActor) {
    this.assertAdmin(actor);
    const result = await this.db.query(
      `SELECT t.*, u.name AS owner_name
       FROM executive_metric_targets t
       LEFT JOIN users u ON u.organization_id = t.organization_id AND u.id = t.owner_id
       WHERE t.organization_id = $1
       ORDER BY t.period_start DESC, t.metric_key ASC`,
      [actor.organizationId],
    );
    return result.rows;
  }

  async createTarget(input: unknown, actor: ExecutiveAnalyticsActor) {
    this.assertAdmin(actor);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Target payload is required.');
    const body = input as Record<string, unknown>;
    const metricKey = this.requiredText(body.metricKey, 'metricKey', 80).toLowerCase();
    const supportedMetricKeys = new Set([
      'revenue', 'refund', 'cost_of_goods_sold', 'operating_expense', 'acquisition_cost',
      'other_income', 'tax', 'capital_expenditure', 'net_revenue', 'gross_profit',
      'operating_result', 'mrr', 'arr',
      'customer_retention_rate', 'mrr_growth_pct', 'open_pipeline', 'weighted_pipeline', 'closed_won',
      'closed_lost', 'tasks_created', 'tasks_completed', 'tasks_overdue', 'projects_created', 'projects_updated',
      'documents_uploaded', 'documents_indexed', 'documents_failed', 'meetings_created',
      'meetings_completed', 'meeting_average_duration_seconds', 'ai_operations',
      'ai_tokens', 'ai_unpriced_operations', 'ai_cost_usd',
    ]);
    if (!supportedMetricKeys.has(metricKey)) throw new BadRequestException('metricKey is not in the supported Executive Intelligence catalogue.');
    const unit = this.requiredText(body.unit, 'unit', 40);
    const targetPeriod = body.targetPeriod;
    if (!['monthly', 'quarterly', 'annual', 'custom'].includes(String(targetPeriod))) throw new BadRequestException('targetPeriod must be monthly, quarterly, annual or custom.');
    const direction = body.direction;
    if (!['higher_is_better', 'lower_is_better'].includes(String(direction))) throw new BadRequestException('direction must be higher_is_better or lower_is_better.');
    const periodStart = this.parseSingleDate(body.periodStart, 'periodStart');
    const periodEnd = this.parseSingleDate(body.periodEnd, 'periodEnd');
    if (periodEnd < periodStart) throw new BadRequestException('periodEnd must be on or after periodStart.');
    if (body.targetValue === undefined || body.targetValue === null || (typeof body.targetValue === 'string' && !body.targetValue.trim())) {
      throw new BadRequestException('targetValue is required and must be a finite number.');
    }
    const targetValue = Number(body.targetValue);
    if (!Number.isFinite(targetValue)) throw new BadRequestException('targetValue must be a finite number.');
    const currency = body.currency === undefined || body.currency === null || body.currency === '' ? null : String(body.currency).trim().toUpperCase();
    if (currency !== null && !/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('currency must be a three-letter ISO-style currency code.');
    const currencyScopedMetrics = new Set([
      'revenue', 'refund', 'cost_of_goods_sold', 'operating_expense', 'acquisition_cost',
      'other_income', 'tax', 'capital_expenditure', 'net_revenue', 'gross_profit',
      'operating_result', 'mrr', 'arr', 'mrr_growth_pct', 'open_pipeline',
      'weighted_pipeline', 'closed_won', 'closed_lost', 'ai_cost_usd',
    ]);
    if (currencyScopedMetrics.has(metricKey)) {
      if (!currency) throw new BadRequestException('A currency is required for this currency-scoped KPI target.');
      if (metricKey === 'mrr_growth_pct') {
        if (unit !== '%') throw new BadRequestException('The unit for mrr_growth_pct must be %.');
      } else if (unit !== currency) {
        throw new BadRequestException(`The unit for ${metricKey} must match its currency (${currency}).`);
      }
    } else {
      if (currency) throw new BadRequestException('Currency must be omitted for non-currency-scoped KPI targets.');
      const expectedUnits: Record<string, string> = {
        customer_retention_rate: '%',
        tasks_created: 'tasks', tasks_completed: 'tasks', tasks_overdue: 'tasks', projects_created: 'projects', projects_updated: 'projects',
        documents_uploaded: 'documents', documents_indexed: 'documents', documents_failed: 'documents',
        meetings_created: 'meetings', meetings_completed: 'meetings',
        meeting_average_duration_seconds: 'seconds', ai_operations: 'operations',
        ai_unpriced_operations: 'operations', ai_tokens: 'tokens',
      };
      if (expectedUnits[metricKey] && unit !== expectedUnits[metricKey]) {
        throw new BadRequestException(`The unit for ${metricKey} must be ${expectedUnits[metricKey]}.`);
      }
    }
    const alertThreshold = body.alertThresholdPct === undefined || body.alertThresholdPct === null || body.alertThresholdPct === '' ? null : Number(body.alertThresholdPct);
    if (alertThreshold !== null && (!Number.isFinite(alertThreshold) || alertThreshold < 0 || alertThreshold > 1000)) throw new BadRequestException('alertThresholdPct must be between 0 and 1000.');
    const minimumSample = body.minimumSampleSize === undefined ? 1 : Number(body.minimumSampleSize);
    if (!Number.isInteger(minimumSample) || minimumSample < 1 || minimumSample > 100000000) throw new BadRequestException('minimumSampleSize must be a positive integer.');
    const ownerId = body.ownerId === undefined || body.ownerId === null || body.ownerId === '' ? null : String(body.ownerId);
    if (ownerId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)) {
      throw new BadRequestException('ownerId must be a valid UUID.');
    }

    return this.db.transaction(async (client) => {
      if (ownerId) {
        const owner = await client.query(
          'SELECT id FROM users WHERE id = $1 AND organization_id = $2',
          [ownerId, actor.organizationId],
        );
        if (!owner.rows[0]) throw new BadRequestException('ownerId must belong to the current organisation.');
      }
      const result = await client.query(
        `INSERT INTO executive_metric_targets
          (organization_id, metric_key, target_value, unit, currency, target_period,
           period_start, period_end, owner_id, direction, alert_threshold_pct,
           minimum_sample_size, created_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12, $13)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [actor.organizationId, metricKey, targetValue, unit, currency, targetPeriod,
          periodStart, periodEnd, ownerId, direction, alertThreshold, minimumSample, actor.userId],
      );
      if (!result.rows[0]) throw new ConflictException('A target already exists for this metric, currency and reporting period, or its owner is invalid.');
      await client.query(
        `INSERT INTO executive_audit_events
          (organization_id, actor_id, event_type, entity_type, entity_id, details)
         VALUES ($1, $2, 'target_created', 'metric_target', $3, $4::jsonb)`,
        [actor.organizationId, actor.userId, result.rows[0].id, JSON.stringify({ metricKey, targetPeriod, periodStart, periodEnd, currency })],
      );
      return result.rows[0];
    });
  }

  exportXlsx(report: ExecutivePdfReport): Buffer {
    const workbook = XLSX.utils.book_new();
    const metricRows = report.metrics.map((metric) => ({
      Metric: safeSpreadsheetText(metric.label),
      Key: safeSpreadsheetText(metric.key),
      Category: safeSpreadsheetText(metric.category),
      Status: metric.status,
      Value: typeof metric.value === 'number' ? metric.value : safeSpreadsheetText(metric.value),
      Unit: safeSpreadsheetText(metric.unit),
      Currency: safeSpreadsheetText(metric.currency),
      Target: metric.targetValue ?? '',
      AlertThresholdPct: metric.alertThresholdPct ?? '',
      TargetProgressPct: metric.targetProgressPct ?? '',
      TargetStatus: safeSpreadsheetText(metric.targetStatus),
      TargetDirection: safeSpreadsheetText(metric.targetDirection),
      TargetOwner: safeSpreadsheetText(metric.targetOwnerName),
      Formula: safeSpreadsheetText(metric.formula),
      Definition: safeSpreadsheetText(metric.definition),
      SampleSize: metric.sampleSize ?? '',
      Sources: safeSpreadsheetText(metric.sourceLabels?.join('; ')),
      Note: safeSpreadsheetText(metric.note),
    }));
    const alertRows = (report.alerts ?? []).map((alert) => ({
      MetricKey: safeSpreadsheetText(alert.metricKey), Label: safeSpreadsheetText(alert.label),
      Currency: safeSpreadsheetText(alert.currency), Severity: alert.severity,
      ActualValue: alert.actualValue, TargetValue: alert.targetValue, GapPct: alert.gapPct,
      Message: safeSpreadsheetText(alert.message),
    }));
    const sourceRows = (report.sources ?? []).map((source) => ({
      Type: safeSpreadsheetText(source.sourceType), Name: safeSpreadsheetText(source.sourceName),
      SourceID: safeSpreadsheetText(source.sourceId), RecordCount: source.recordCount ?? 0,
      PeriodStart: source.periodStart ?? '', PeriodEnd: source.periodEnd ?? '',
    }));
    const assumptionRows = (report.assumptions ?? []).map((assumption) => ({ Assumption: safeSpreadsheetText(assumption) }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
      { Organisation: safeSpreadsheetText(report.organizationName), Title: safeSpreadsheetText(report.reportTitle),
        PeriodStart: report.periodStart, PeriodEnd: report.periodEnd, GeneratedAt: report.generatedAt ?? '' },
    ]), 'Overview');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(metricRows), 'KPIs');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(alertRows), 'Alerts');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sourceRows), 'Sources');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(assumptionRows), 'Assumptions');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  exportCsv(report: ExecutivePdfReport): string {
    const columns = ['metric', 'key', 'category', 'status', 'value', 'unit', 'currency', 'target', 'alert_threshold_pct', 'target_progress_pct', 'alert', 'target_status', 'target_direction', 'target_owner', 'formula', 'definition', 'sample_size', 'sources', 'note'];
    const rows = report.metrics.map((metric) => [
      metric.label, metric.key, metric.category ?? '', metric.status, metric.value ?? '', metric.unit ?? '',
      metric.currency ?? '', metric.targetValue ?? '', metric.alertThresholdPct ?? '', metric.targetProgressPct ?? '',
      (report.alerts ?? []).some((alert) => alert.metricKey === metric.metricKey && (alert.currency ?? '') === (metric.currency ?? '')),
      metric.targetStatus ?? '',
      metric.targetDirection ?? '', metric.targetOwnerName ?? '', metric.formula ?? '', metric.definition ?? '',
      metric.sampleSize ?? '', metric.sourceLabels?.join('; ') ?? '', metric.note ?? '',
    ]);
    // Headers are fixed, developer-defined identifiers; leave them unquoted for compatibility.
    // Every data cell remains RFC 4180 quoted and spreadsheet-formula neutralized.
    const header = columns.join(',');
    const dataRows = rows.map((row) => row.map(escapeCsvField).join(','));
    return '\uFEFF' + [header, ...dataRows].join('\r\n');
  }

  private assertAdmin(actor: ExecutiveAnalyticsActor): void {
    if (!actor?.organizationId || !actor?.userId) throw new ForbiddenException('Authenticated organisation and user context are required.');
    const role = String(actor.role ?? '').toLowerCase();
    if (role !== 'owner' && role !== 'admin') throw new ForbiddenException('Only organisation owners and administrators can access Executive Intelligence reporting.');
  }

  private parsePeriod(startInput?: unknown, endInput?: unknown): { start: string; end: string } {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const defaultStart = `${today.slice(0, 7)}-01`;
    const start = startInput === undefined || startInput === null || startInput === '' ? defaultStart : this.parseSingleDate(startInput, 'startDate');
    const end = endInput === undefined || endInput === null || endInput === '' ? today : this.parseSingleDate(endInput, 'endDate');
    if (end < start) throw new BadRequestException('endDate must be on or after startDate.');
    if (end > today) throw new BadRequestException('endDate cannot be in the future.');
    const duration = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
    if (duration > 3660) throw new BadRequestException('Reporting period cannot exceed 10 years.');
    return { start, end };
  }

  private parseSingleDate(value: unknown, field: string): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${field} must use YYYY-MM-DD format.`);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException(`${field} is not a valid calendar date.`);
    return value;
  }

  private requiredText(value: unknown, field: string, maxLength: number): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) throw new BadRequestException(`${field} is required and must contain at most ${maxLength} characters.`);
    return value.trim();
  }
}
