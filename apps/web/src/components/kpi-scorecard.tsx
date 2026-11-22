'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Target } from 'lucide-react';
import api from '@/lib/api';
import { AreaSparkline } from '@/components/ui/area-sparkline';
import type { SparkTone } from '@/components/ui/area-sparkline';

export type ScorecardItem = {
  targetId: string;
  metricKey: string;
  label: string;
  currency: string | null;
  unit: string;
  direction: 'higher_is_better' | 'lower_is_better';
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
  toDate: boolean;
};

/** Shared by Analytics and Executive Intelligence: one endpoint, one cache entry. */
export const SCORECARD_QUERY_KEY = ['executive-intelligence', 'scorecard'] as const;

export function useKpiScorecard(enabled = true) {
  return useQuery({
    queryKey: SCORECARD_QUERY_KEY,
    enabled,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const payload = (await api.get('/executive-intelligence/scorecard')).data;
      const data = payload?.data ?? payload;
      return (Array.isArray(data?.items) ? data.items : []) as ScorecardItem[];
    },
  });
}

const STATUS: Record<ScorecardItem['targetStatus'], { label: string; className: string; bar: string; tone: SparkTone }> = {
  on_track: { label: 'On track', className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500', tone: 'chart-4' },
  behind: { label: 'Behind', className: 'border-rose-400/30 bg-rose-400/10 text-rose-700 dark:text-rose-300', bar: 'bg-rose-500', tone: 'chart-5' },
  insufficient_data: { label: 'Not enough data', className: 'border-border bg-muted text-muted-foreground', bar: 'bg-muted-foreground/40', tone: 'muted-foreground' },
  not_started: { label: 'Not started', className: 'border-border bg-muted text-muted-foreground', bar: 'bg-muted-foreground/40', tone: 'muted-foreground' },
};

function formatValue(item: ScorecardItem, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (item.unit === '%') return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
  if (item.currency) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency, maximumFractionDigits: 2 }).format(value);
    } catch { /* fall through */ }
  }
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${item.unit && item.unit !== item.currency ? ` ${item.unit}` : ''}`;
}

const dateLabel = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
const monthLabel = (value: string) => /^\d{4}-\d{2}$/.test(value)
  ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`))
  : value;
const humanize = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * KPI targets with live actuals over each target's own period. Renders nothing for
 * users without Executive Intelligence access.
 */
export function KpiScorecard({ title = 'Business KPIs', description, showManageLink = true }: { title?: string; description?: string; showManageLink?: boolean }) {
  const query = useKpiScorecard();
  const forbidden = (query.error as { response?: { status?: number } } | null)?.response?.status;
  if (query.isError && (forbidden === 403 || forbidden === 401)) return null;

  return (
    <section aria-labelledby="kpi-scorecard-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="kpi-scorecard-title" className="flex items-center gap-2 text-lg font-semibold"><Target className="h-5 w-5 text-primary" /> {title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description ?? 'Targets set in Executive Intelligence, measured from committed records over each target period. The same figures appear on both pages.'}</p>
        </div>
        {showManageLink && <Link href="/executive-intelligence?view=targets" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Manage targets <ArrowUpRight className="h-3.5 w-3.5" /></Link>}
      </div>
      {query.isPending && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} aria-hidden="true" className="lm-skeleton h-44 rounded-xl" />)}</div>}
      {query.isError && <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">KPI results could not be loaded. <button type="button" onClick={() => void query.refetch()} className="underline">Retry</button></p>}
      {query.data?.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
          No KPI targets yet. <Link href="/executive-intelligence?view=targets" className="font-medium text-primary underline underline-offset-2">Create a target</Link> for revenue, margin, costs or recurring revenue to track it here.
        </p>
      )}
      {!!query.data?.length && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.map((item) => {
            const status = STATUS[item.targetStatus];
            const width = Math.max(0, Math.min(100, item.progressPct ?? 0));
            return (
              <article key={item.targetId} className="lm-panel p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{humanize(item.label)}{item.currency ? ` · ${item.currency}` : ''}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{dateLabel(item.periodStart)} – {dateLabel(item.periodEnd)}{item.toDate ? ' · to date' : ''}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <p className="truncate font-mono text-xl font-medium tabular-nums">{formatValue(item, item.actualValue)}</p>
                  <p className="shrink-0 text-xs text-muted-foreground">{item.direction === 'lower_is_better' ? 'at most' : 'target'} {formatValue(item, item.targetValue)}</p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className={`h-full rounded-full ${status.bar}`} style={{ width: `${width}%` }} /></div>
                <p className="mt-1 text-xs text-muted-foreground">{item.progressPct === null ? (item.targetStatus === 'not_started' ? 'Period has not started' : `${item.sampleSize} record${item.sampleSize === 1 ? '' : 's'} in this period`) : `${item.progressPct.toLocaleString('en-US', { maximumFractionDigits: 1 })}% of target`}{item.ownerName ? ` · Owner: ${item.ownerName}` : ''}</p>
                {item.trend.length > 1 && (
                  <div className="mt-3">
                    <AreaSparkline points={item.trend} tone={status.tone === 'muted-foreground' ? 'chart-1' : status.tone} height={36} label={`${item.label}, monthly`}
                      formatValue={(value) => formatValue(item, value)} formatLabel={monthLabel} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
