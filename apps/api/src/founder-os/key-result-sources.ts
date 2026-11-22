/**
 * Organisation metrics a key result can track automatically. Values come from the
 * Executive Intelligence engine over the goal's quarter (to date): flow metrics are
 * totals for the quarter, snapshot metrics are the value today.
 */
export type KeyResultSource = {
  label: string;
  /** Executive Intelligence metric key. */
  metricKey: string;
  /** Needs a currency and owner/admin access. */
  financial: boolean;
  kind: 'flow' | 'snapshot';
  lowerIsBetter?: boolean;
  /** Where the numbers come from, for the UI. */
  origin: string;
};

export const KEY_RESULT_SOURCES: Record<string, KeyResultSource> = {
  'ei:revenue': { label: 'Revenue', metricKey: 'revenue', financial: true, kind: 'flow', origin: 'Imported transactions' },
  'ei:net_revenue': { label: 'Net revenue', metricKey: 'net_revenue', financial: true, kind: 'flow', origin: 'Imported transactions' },
  'ei:gross_profit': { label: 'Gross profit', metricKey: 'gross_profit', financial: true, kind: 'flow', origin: 'Imported transactions' },
  'ei:operating_result': { label: 'Operating result', metricKey: 'operating_result', financial: true, kind: 'flow', origin: 'Imported transactions' },
  'ei:cost_of_goods_sold': { label: 'Cost of goods sold', metricKey: 'cost_of_goods_sold', financial: true, kind: 'flow', lowerIsBetter: true, origin: 'Imported transactions' },
  'ei:operating_expense': { label: 'Operating expenses', metricKey: 'operating_expense', financial: true, kind: 'flow', lowerIsBetter: true, origin: 'Imported transactions' },
  'ei:acquisition_cost': { label: 'Customer acquisition spend', metricKey: 'acquisition_cost', financial: true, kind: 'flow', lowerIsBetter: true, origin: 'Imported transactions' },
  'ei:mrr': { label: 'Monthly recurring revenue (MRR)', metricKey: 'mrr', financial: true, kind: 'snapshot', origin: 'Imported customer contracts' },
  'ei:arr': { label: 'Annual recurring revenue (ARR)', metricKey: 'arr', financial: true, kind: 'snapshot', origin: 'Imported customer contracts' },
  'ei:open_pipeline': { label: 'Open sales pipeline', metricKey: 'open_pipeline', financial: true, kind: 'snapshot', origin: 'Imported pipeline' },
  'ei:weighted_pipeline': { label: 'Weighted pipeline', metricKey: 'weighted_pipeline', financial: true, kind: 'snapshot', origin: 'Imported pipeline' },
  'ei:closed_won': { label: 'Closed-won deals', metricKey: 'closed_won', financial: true, kind: 'flow', origin: 'Imported pipeline' },
  'workspace:tasks_completed': { label: 'Tasks completed', metricKey: 'tasks_completed', financial: false, kind: 'flow', origin: 'Tasks' },
  'workspace:meetings_completed': { label: 'Meetings completed', metricKey: 'meetings_completed', financial: false, kind: 'flow', origin: 'Meetings' },
  'workspace:documents_indexed': { label: 'Documents indexed', metricKey: 'documents_indexed', financial: false, kind: 'flow', origin: 'Company Brain' },
  'workspace:projects_created': { label: 'Projects created', metricKey: 'projects_created', financial: false, kind: 'flow', origin: 'Projects' },
};

/** First and last day of a goal quarter, with the end capped at today. Null if it has not started. */
export function quarterPeriod(quarter: string, year: number, today = new Date().toISOString().slice(0, 10)) {
  const q = Number(String(quarter).replace(/^Q/i, ''));
  if (!Number.isInteger(q) || q < 1 || q > 4 || !Number.isInteger(year)) return null;
  const start = new Date(Date.UTC(year, (q - 1) * 3, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, q * 3, 0)).toISOString().slice(0, 10);
  if (start > today) return null;
  return { start, end: end < today ? end : today, quarterEnd: end };
}

/** The metric value for a source from a dashboard's metrics, or null when there is no data. */
export function sourceValue(
  metrics: Array<{ metricKey: string; currency?: string; status: string; value: unknown }>,
  source: KeyResultSource,
  currency: string | null,
): number | null {
  const metric = metrics.find((item) => item.metricKey === source.metricKey && (source.financial ? item.currency === currency : !item.currency));
  const value = typeof metric?.value === 'number' ? metric.value : typeof metric?.value === 'string' && metric.value.trim() ? Number(metric.value) : NaN;
  if (!metric || metric.status === 'unavailable' || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}
