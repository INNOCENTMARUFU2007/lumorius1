'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import { ArrowUpRight, Loader2, Plus, TrendingUp, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { EChart, useChartTokens } from '@/components/charts/echart';
import type { ChartTokens } from '@/components/charts/echart';
import { useKpiScorecard } from '@/components/kpi-scorecard';
import type { ScorecardItem } from '@/components/kpi-scorecard';

type TeamKpi = {
  id: string;
  name: string;
  unit: string;
  target: number | null;
  current: number | null;
  previous: number | null;
  history: Array<{ date: string; value: number }>;
};

const num = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const today = () => new Date().toISOString().slice(0, 10);
const humanize = (value: string) => value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const monthLabel = (value: string) => /^\d{4}-\d{2}$/.test(value)
  ? new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`))
  : value;
const dayLabel = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));

function errorText(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join(' ') : message || fallback;
}

function normalizeTeamKpis(raw: Array<Record<string, unknown>>): TeamKpi[] {
  return raw.map((kpi, index) => {
    const history = (Array.isArray(kpi.history) ? kpi.history : [])
      .map((point) => {
        const record = point as Record<string, unknown>;
        return { date: String(record.date ?? record.recorded_at ?? '').slice(0, 10), value: num(record.value) };
      })
      .filter((point): point is { date: string; value: number } => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && point.value !== null)
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      id: typeof kpi.id === 'string' ? kpi.id : `kpi-${index}`,
      name: typeof kpi.name === 'string' && kpi.name.trim() ? kpi.name.trim() : 'Unnamed KPI',
      unit: typeof kpi.unit === 'string' ? kpi.unit : '',
      target: num(kpi.target),
      current: num(kpi.current_value),
      previous: num(kpi.previous_value),
      history,
    };
  });
}

function formatBusiness(item: ScorecardItem, value: number | null) {
  if (value === null) return '—';
  if (item.currency) {
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: item.currency, maximumFractionDigits: 2 }).format(value); } catch { /* plain */ }
  }
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${item.unit === '%' ? '%' : ''}`;
}
const formatTeam = (kpi: TeamKpi, value: number | null) =>
  value === null ? '—' : `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${kpi.unit ? ` ${kpi.unit}` : ''}`;

function baseOption(t: ChartTokens, labels: string[], format: (value: number) => string): EChartsOption {
  const muted = t.color('muted-foreground');
  return {
    animation: !t.reducedMotion,
    animationDuration: 400,
    aria: { enabled: true },
    textStyle: { fontFamily: t.fontSans, color: muted },
    grid: { left: 4, right: 10, top: 18, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: t.color('popover'),
      borderColor: t.color('border'),
      textStyle: { color: t.color('popover-foreground'), fontSize: 12, fontFamily: t.fontSans },
      extraCssText: 'border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.18);',
      valueFormatter: ((value: unknown) => (typeof value === 'number' ? format(value) : '—')) as never,
    },
    xAxis: { type: 'category', data: labels, axisLabel: { color: muted, fontSize: 11, hideOverlap: true }, axisLine: { lineStyle: { color: t.color('border') } }, axisTick: { show: false } },
    yAxis: {
      type: 'value',
      axisLabel: { color: muted, fontSize: 11, formatter: (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value) },
      splitLine: { lineStyle: { color: t.color('chart-grid'), type: [3, 4] } },
    },
  };
}

function targetLine(t: ChartTokens, value: number | null, label: string) {
  if (value === null) return {};
  return {
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: t.color('chart-5'), type: 'dashed' as const, width: 1.5 },
      label: { formatter: label, color: t.color('muted-foreground'), fontSize: 11, position: 'insideEndTop' as const },
      data: [{ yAxis: value }],
    },
  };
}

function businessOption(item: ScorecardItem, t: ChartTokens): EChartsOption {
  const tone = item.targetStatus === 'on_track' ? 'chart-4' : item.targetStatus === 'behind' ? 'chart-5' : 'chart-1';
  return {
    ...baseOption(t, item.trend.map((point) => monthLabel(point.label)), (value) => formatBusiness(item, value)),
    series: [{
      name: humanize(item.label),
      type: 'bar',
      barMaxWidth: 22,
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: t.color(tone) }, { offset: 1, color: t.color(tone, 0.35) }] },
      },
      data: item.trend.map((point) => point.value),
      ...targetLine(t, item.targetValue, item.direction === 'lower_is_better' ? 'Period limit' : 'Period target'),
    }],
  };
}

function teamOption(kpi: TeamKpi, t: ChartTokens): EChartsOption {
  return {
    ...baseOption(t, kpi.history.map((point) => dayLabel(point.date)), (value) => formatTeam(kpi, value)),
    series: [{
      name: kpi.name,
      type: 'line',
      smooth: 0.3,
      smoothMonotone: 'x',
      symbol: 'circle',
      symbolSize: 7,
      lineStyle: { width: 2.5, color: t.color('chart-3') },
      itemStyle: { color: t.color('chart-3'), borderColor: t.color('card'), borderWidth: 2 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: t.color('chart-3', 0.3) }, { offset: 1, color: t.color('chart-3', 0) }] } },
      data: kpi.history.map((point) => point.value),
      ...targetLine(t, kpi.target, 'Target'),
    }],
  };
}

const STATUS_STYLE: Record<ScorecardItem['targetStatus'], [string, string]> = {
  on_track: ['On track', 'border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300'],
  behind: ['Behind', 'border-rose-400/30 bg-rose-400/10 text-rose-700 dark:text-rose-300'],
  insufficient_data: ['Not enough data', 'border-border bg-muted text-muted-foreground'],
  not_started: ['Not started', 'border-border bg-muted text-muted-foreground'],
};

function BusinessKpiCard({ item, tokens }: { item: ScorecardItem; tokens: ChartTokens | null }) {
  const option = useMemo(() => (tokens && item.trend.length > 1 ? businessOption(item, tokens) : null), [item, tokens]);
  const [label, style] = STATUS_STYLE[item.targetStatus];
  return (
    <article className="min-w-0 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-medium text-muted-foreground">{humanize(item.label)}{item.currency ? ` · ${item.currency}` : ''}</h4>
          <p className="mt-1 truncate font-mono text-2xl font-semibold tabular-nums">{formatBusiness(item, item.actualValue)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{item.toDate ? 'So far this period' : 'This period'} · {item.direction === 'lower_is_better' ? 'limit' : 'target'} {formatBusiness(item, item.targetValue)}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>
      </div>
      <div className="mt-3">
        {item.trend.length > 1
          ? <EChart option={option} height={190} ariaLabel={`${humanize(item.label)} by month`} />
          : <p className="flex h-[190px] items-center justify-center rounded-lg bg-muted/30 px-4 text-center text-sm text-muted-foreground">No monthly history yet. It appears once records for this measure are committed.</p>}
      </div>
    </article>
  );
}

function TeamKpiCard({ kpi, tokens, canRecord, onChanged }: { kpi: TeamKpi; tokens: ChartTokens | null; canRecord: boolean; onChanged: () => void }) {
  const option = useMemo(() => (tokens && kpi.history.length > 1 ? teamOption(kpi, tokens) : null), [kpi, tokens]);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today());
  const record = useMutation({
    mutationFn: () => api.post(`/analytics/kpis/${kpi.id}/values`, { value: Number(value), date }),
    onSuccess: () => { toast.success(`${kpi.name} recorded.`); setValue(''); onChanged(); },
    onError: (error) => toast.error(errorText(error, 'The value could not be saved.')),
  });
  const change = kpi.current !== null && kpi.previous !== null && kpi.previous !== 0 ? ((kpi.current - kpi.previous) / Math.abs(kpi.previous)) * 100 : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() === '' || !Number.isFinite(Number(value))) { toast.error('Enter the value as a number.'); return; }
    record.mutate();
  };
  return (
    <article className="min-w-0 rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-medium text-muted-foreground">{kpi.name}</h4>
          <p className="mt-1 truncate font-mono text-2xl font-semibold tabular-nums">{formatTeam(kpi, kpi.current)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {kpi.current === null ? 'No value recorded yet' : 'Latest value'}
            {change !== null ? ` · ${change > 0 ? '+' : ''}${change.toFixed(1)}% vs previous` : ''}
            {kpi.target !== null ? ` · target ${formatTeam(kpi, kpi.target)}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-3">
        {kpi.history.length > 1
          ? <EChart option={option} height={170} ariaLabel={`${kpi.name} over time`} />
          : <p className="flex h-[120px] items-center justify-center rounded-lg bg-muted/30 px-4 text-center text-sm text-muted-foreground">{kpi.history.length === 1 ? 'Record one more value to see a trend.' : 'Record a value below to start the history.'}</p>}
      </div>
      {canRecord && (
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <label className="min-w-0 flex-1 text-xs font-medium text-muted-foreground">Value{kpi.unit ? ` (${kpi.unit})` : ''}
            <input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="e.g. 42" className="mt-1 block w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground" />
          </label>
          <label className="text-xs font-medium text-muted-foreground">Date
            <input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value)} className="mt-1 block rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground" />
          </label>
          <button type="submit" disabled={record.isPending} className="inline-flex h-[34px] items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {record.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Record
          </button>
        </form>
      )}
    </article>
  );
}

function NewKpiForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const create = useMutation({
    mutationFn: () => api.post('/analytics/kpis', { name: name.trim(), unit: unit.trim() || undefined, target: target.trim() === '' ? undefined : Number(target) }),
    onSuccess: () => { toast.success('KPI created. Record its first value below.'); onCreated(); onClose(); },
    onError: (error) => toast.error(errorText(error, 'The KPI could not be created.')),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) { toast.error('Give the KPI a name.'); return; }
        if (target.trim() !== '' && !Number.isFinite(Number(target))) { toast.error('The target must be a number.'); return; }
        create.mutate();
      }}
      className="mb-5 grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
    >
      <label className="text-xs font-medium text-muted-foreground">Name
        <input autoFocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="e.g. Qualified leads per week" className="mt-1 block w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground" />
      </label>
      <label className="text-xs font-medium text-muted-foreground">Unit (optional)
        <input value={unit} maxLength={24} onChange={(event) => setUnit(event.target.value)} placeholder="leads, %, USD" className="mt-1 block w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground" />
      </label>
      <label className="text-xs font-medium text-muted-foreground">Target (optional)
        <input inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="e.g. 40" className="mt-1 block w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground" />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={create.isPending} className="inline-flex h-[38px] items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create
        </button>
        <button type="button" onClick={onClose} aria-label="Cancel" className="inline-flex h-[38px] items-center rounded-lg border border-border px-2.5 hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
    </form>
  );
}

/**
 * KPI history: business KPIs (Executive Intelligence targets, by month) and team metrics
 * people record by hand, with forms to add a metric and record values.
 */
export default function KpiPerformance({
  rawKpis, loading, error, onChanged, canManage, canRecord,
}: {
  rawKpis: Array<Record<string, unknown>>;
  loading: boolean;
  error: string | null;
  onChanged: () => void;
  canManage: boolean;
  canRecord: boolean;
}) {
  const tokens = useChartTokens();
  const scorecard = useKpiScorecard();
  const [adding, setAdding] = useState(false);
  const team = useMemo(() => normalizeTeamKpis(rawKpis), [rawKpis]);
  const business = scorecard.data ?? [];
  const nothing = !loading && !scorecard.isPending && business.length === 0 && team.length === 0;

  return (
    <section id="kpi-history" className="scroll-mt-5 rounded-xl border border-border bg-card p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><TrendingUp className="h-5 w-5 text-emerald-500" /> KPI performance</h2>
          <p className="mt-1 text-sm text-muted-foreground">Monthly history for your business KPIs, and the team metrics your people record.</p>
        </div>
        {canManage && !adding && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" /> New team KPI</button>
        )}
      </div>

      {adding && <NewKpiForm onClose={() => setAdding(false)} onCreated={onChanged} />}
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

      {(loading || scorecard.isPending) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{[0, 1].map((item) => <div key={item} aria-hidden="true" className="lm-skeleton h-64 rounded-xl" />)}</div>
      )}

      {nothing && (
        <div className="rounded-lg bg-muted/30 px-5 py-10 text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 font-medium">No KPIs to track yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Set a financial target in Executive Intelligence, or add a team KPI such as qualified leads or customer satisfaction and record it each week.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/executive-intelligence?view=targets" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">Set a target <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            {canManage && <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" /> New team KPI</button>}
          </div>
        </div>
      )}

      {business.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Business KPIs <span className="font-normal text-muted-foreground">· from Executive Intelligence targets</span></h3>
            <Link href="/executive-intelligence?view=targets" className="text-xs font-medium text-primary hover:underline">Manage targets</Link>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {business.map((item) => <BusinessKpiCard key={item.targetId} item={item} tokens={tokens} />)}
          </div>
        </div>
      )}

      {!loading && (team.length > 0 || (!nothing && canManage)) && (
        <div>
          <h3 className="mb-3 text-sm font-semibold">Team metrics <span className="font-normal text-muted-foreground">· recorded by your team</span></h3>
          {team.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
              No team metrics yet. Add one for numbers that aren&apos;t in your financial records, like qualified leads or customer satisfaction.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {team.map((kpi) => <TeamKpiCard key={kpi.id} kpi={kpi} tokens={tokens} canRecord={canRecord} onChanged={onChanged} />)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
