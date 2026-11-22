'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { EChartsOption } from 'echarts';
import { api } from '@/lib/api';
import { EChart, useChartTokens } from '@/components/charts/echart';
import type { ChartTokens } from '@/components/charts/echart';

type Point = { period: string; days: number; lower: number; base: number; upper: number };
type Forecast = {
  currency: string;
  basis: 'cash_balances' | 'transactions';
  latest: { month: string; closing: number };
  stale: boolean;
  usableMonths: number;
  activeMonths: number;
  points: Point[];
  backtest: { period: string; forecast: number; actual: number; absoluteError: number }[];
  history: { period: string; value: number; net: number }[];
};

function money(value: number, currency: string, compact = false) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 2 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  }
}
const monthLabel = (period: string, long = false) =>
  new Intl.DateTimeFormat('en-GB', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' }).format(new Date(`${period}-01T00:00:00Z`));
const r2 = (value: number) => Math.round(value * 100) / 100;

function buildOption(row: Forecast, t: ChartTokens): EChartsOption {
  const periods = [...row.history.map((point) => point.period), ...row.points.map((point) => point.period)];
  const lastIndex = row.history.length - 1;
  const latest = row.history[lastIndex]?.value ?? row.latest.closing;
  const pad = (values: Array<number | null>, before: number) => [...Array(before).fill(null), ...values];
  // Forecast series start at the last observed point so the band joins the line.
  const lower = pad([latest, ...row.points.map((point) => point.lower)], lastIndex);
  const base = pad([latest, ...row.points.map((point) => point.base)], lastIndex);
  const range = pad([0, ...row.points.map((point) => r2(point.upper - point.lower))], lastIndex);
  const upper = pad([latest, ...row.points.map((point) => point.upper)], lastIndex);
  const muted = t.color('muted-foreground');
  const border = t.color('border');
  const card = t.color('card');
  const cyan = t.color('chart-2');
  const indigo = t.color('chart-1');
  const positionName = row.basis === 'cash_balances' ? 'Closing balance' : 'Running net position';

  return {
    animation: !t.reducedMotion,
    animationDuration: 450,
    aria: { enabled: true },
    textStyle: { fontFamily: t.fontSans, color: muted },
    grid: { left: 4, right: 12, top: 44, bottom: 6, containLabel: true },
    legend: {
      top: 0, left: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, itemGap: 14,
      textStyle: { color: t.color('foreground'), fontSize: 12 }, inactiveColor: t.color('muted-foreground', 0.4),
      data: [positionName, 'Monthly net', 'Base case', 'Downside to upside'],
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: t.color('popover'),
      borderColor: border,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.color('popover-foreground'), fontSize: 12, fontFamily: t.fontSans },
      extraCssText: 'border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.18);',
      formatter: ((params: unknown) => {
        const items = (Array.isArray(params) ? params : [params]) as Array<{ dataIndex: number }>;
        const index = items[0]?.dataIndex ?? 0;
        const line = (label: string, value: number, color?: string) =>
          `<div style="display:flex;justify-content:space-between;gap:20px;line-height:20px"><span>${color ? `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${color}"></span>` : ''}${label}</span><span style="font-variant-numeric:tabular-nums;font-weight:600">${money(value, row.currency)}</span></div>`;
        const head = `<div style="font-weight:600;margin-bottom:4px">${monthLabel(periods[index], true)}</div>`;
        if (index <= lastIndex) {
          const point = row.history[index];
          return head + line(positionName, point.value, cyan) + line('Net this month', point.net);
        }
        const point = row.points[index - lastIndex - 1];
        return head + line('Upside', point.upper) + line('Base case', point.base, indigo) + line('Downside', point.lower)
          + `<div style="margin-top:6px;padding-top:6px;border-top:1px solid ${border};color:${muted}">Projection, ${point.days === 365 ? '12 months' : `about ${point.days} days`} ahead</div>`;
      }) as never,
    },
    xAxis: {
      type: 'category',
      data: periods,
      axisLabel: { formatter: (value: string) => monthLabel(value), color: muted, fontSize: 11, hideOverlap: true },
      axisLine: { lineStyle: { color: border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => money(value, row.currency, true), color: muted, fontSize: 11 },
      splitLine: { lineStyle: { color: t.color('chart-grid'), type: [3, 4] } },
    },
    series: [
      {
        name: 'Monthly net',
        type: 'bar',
        barMaxWidth: 16,
        data: row.history.map((point) => ({
          value: point.net,
          itemStyle: { color: point.net < 0 ? t.color('destructive', 0.45) : t.color('chart-4', 0.45), borderRadius: point.net < 0 ? [0, 0, 3, 3] : [3, 3, 0, 0] },
        })),
      },
      {
        name: positionName,
        type: 'line',
        smooth: 0.25,
        smoothMonotone: 'x',
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2.5, color: cyan },
        itemStyle: { color: cyan, borderColor: card, borderWidth: 2 },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: t.color('chart-2', 0.28) }, { offset: 1, color: t.color('chart-2', 0) }] } },
        data: row.history.map((point) => point.value),
        ...(row.points.length ? {
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: t.color('foreground', 0.3), type: 'dashed' },
            label: { formatter: 'Today', color: muted, fontSize: 11, position: 'insideEndTop' },
            data: [{ xAxis: row.history[lastIndex]?.period }],
          },
        } : {}),
      },
      // The band: an invisible lower line with the upside range stacked on top of it.
      { name: 'band-lower', type: 'line', stack: 'band', stackStrategy: 'all', symbol: 'none', lineStyle: { opacity: 0 }, data: lower, silent: true, tooltip: { show: false } },
      {
        name: 'Downside to upside', type: 'line', stack: 'band', stackStrategy: 'all', symbol: 'none', silent: true,
        lineStyle: { opacity: 0 }, areaStyle: { color: t.color('chart-1', 0.16) }, itemStyle: { color: t.color('chart-1', 0.4) }, data: range,
      },
      { name: 'upper-edge', type: 'line', symbol: 'none', silent: true, lineStyle: { width: 1, color: t.color('chart-4', 0.7), type: 'dotted' }, data: upper },
      {
        name: 'Base case', type: 'line', symbol: 'circle', symbolSize: 6,
        lineStyle: { width: 2, color: indigo, type: 'dashed' }, itemStyle: { color: indigo, borderColor: card, borderWidth: 2 }, data: base,
      },
    ],
  };
}

function ForecastCard({ row }: { row: Forecast }) {
  const tokens = useChartTokens();
  const [showData, setShowData] = useState(false);
  const option = useMemo(() => (tokens && row.history.length ? buildOption(row, tokens) : null), [row, tokens]);
  const near = row.points[0];
  const quarter = row.points.find((point) => point.days === 90);
  const fromTransactions = row.basis === 'transactions';
  const tiles = [
    {
      label: fromTransactions ? `Net position since ${row.history[0] ? monthLabel(row.history[0].period) : 'start'}` : 'Latest closing balance',
      value: money(row.latest.closing, row.currency),
      detail: fromTransactions ? 'Money in minus money out' : `Reported ${monthLabel(row.latest.month.slice(0, 7), true)}`,
    },
    { label: 'Next month (base)', value: near ? money(near.base, row.currency) : '—', detail: near ? `${money(near.lower, row.currency, true)} to ${money(near.upper, row.currency, true)}` : 'Not enough history' },
    { label: 'In 3 months (base)', value: quarter ? money(quarter.base, row.currency) : '—', detail: quarter ? `${money(quarter.lower, row.currency, true)} to ${money(quarter.upper, row.currency, true)}` : 'Not enough history' },
    { label: 'History used', value: `${row.usableMonths} month${row.usableMonths === 1 ? '' : 's'}`, detail: fromTransactions ? `${row.activeMonths} with records` : 'Consecutive reconciled months' },
  ];

  return (
    <article className="mt-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{row.currency}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fromTransactions
              ? 'Estimated from committed transactions: revenue and other income in, every cost out. This is not a bank balance.'
              : 'From reconciled monthly cash balances.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${fromTransactions ? 'border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300'}`}>
            {fromTransactions ? 'From transactions' : 'From cash balances'}
          </span>
          {row.history.length > 0 && (
            <button type="button" aria-pressed={showData} onClick={() => setShowData((value) => !value)} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
              {showData ? 'Show chart' : 'Show data'}
            </button>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-card px-3 py-2.5">
            <dt className="truncate text-xs text-muted-foreground">{tile.label}</dt>
            <dd className="mt-0.5 truncate font-mono text-base font-medium tabular-nums text-foreground">{tile.value}</dd>
            <dd className="truncate text-xs text-muted-foreground">{tile.detail}</dd>
          </div>
        ))}
      </dl>

      {row.points.length === 0 && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
          {row.stale
            ? 'No projection: the latest records are more than two months old. Import recent records to refresh it.'
            : fromTransactions
              ? 'No projection yet: at least three months of history, with records in two of them, are needed.'
              : 'No projection yet: at least three consecutive reconciled monthly balances are needed.'}
        </p>
      )}

      <div className="mt-3">
        {showData ? (
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs tabular-nums">
              <caption className="sr-only">{row.currency} cash position and forecast</caption>
              <thead className="sticky top-0 bg-card text-muted-foreground"><tr><th className="p-2 font-medium">Month</th><th className="p-2 text-right font-medium">Downside</th><th className="p-2 text-right font-medium">Position / base</th><th className="p-2 text-right font-medium">Upside</th></tr></thead>
              <tbody className="divide-y divide-border">
                {row.history.map((point) => <tr key={point.period}><th scope="row" className="p-2 font-normal">{monthLabel(point.period, true)}</th><td className="p-2 text-right text-muted-foreground">—</td><td className="p-2 text-right">{money(point.value, row.currency)}</td><td className="p-2 text-right text-muted-foreground">—</td></tr>)}
                {row.points.map((point) => <tr key={point.period} className="bg-muted/30"><th scope="row" className="p-2 font-normal">{monthLabel(point.period, true)} (forecast)</th><td className="p-2 text-right">{money(point.lower, row.currency)}</td><td className="p-2 text-right">{money(point.base, row.currency)}</td><td className="p-2 text-right">{money(point.upper, row.currency)}</td></tr>)}
              </tbody>
            </table>
          </div>
        ) : row.history.length > 0 ? (
          <EChart option={option} height={300} ariaLabel={`${row.currency} cash position history and forecast`} />
        ) : null}
      </div>

      {row.backtest.length > 0 && (
        <details className="mt-3 text-xs text-foreground/80">
          <summary className="cursor-pointer">Past forecasts versus actual</summary>
          <ul className="mt-2 space-y-1">{row.backtest.map((point) => <li key={point.period}>{monthLabel(point.period, true)}: forecast {money(point.forecast, row.currency)} · actual {money(point.actual, row.currency)} · off by {money(point.absoluteError, row.currency)}</li>)}</ul>
        </details>
      )}
    </article>
  );
}

export default function CashForecast() {
  const query = useQuery({
    queryKey: ['executive-intelligence', 'cash-forecasts'],
    retry: false,
    queryFn: async () => (await api.get('/executive-intelligence/forecasts')).data.data as Forecast[],
  });
  return (
    <section aria-labelledby="cash-forecast-title" className="mb-6 rounded-2xl border border-border bg-muted/30 p-4 text-foreground sm:p-5">
      <h2 id="cash-forecast-title" className="text-base font-semibold">Cash forecast</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Scenarios extend the lowest, median and highest monthly net movement of the last 12 months from the latest position. Currencies are kept separate.
      </p>
      {query.isPending && <div aria-hidden="true" className="lm-skeleton mt-4 h-72 rounded-xl" />}
      {query.isError && <p role="alert" className="mt-3 text-sm text-amber-700 dark:text-amber-200">The cash forecast could not be loaded. Refresh to try again.</p>}
      {query.data?.length === 0 && (
        <p className="mt-3 text-sm text-foreground/80">
          No financial records yet. <Link className="text-primary underline" href="/executive-intelligence?view=sources">Import transactions or monthly cash balances</Link> to see a forecast.
        </p>
      )}
      {query.data?.map((row) => <ForecastCard key={`${row.currency}-${row.basis}`} row={row} />)}
    </section>
  );
}
