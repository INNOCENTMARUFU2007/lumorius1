'use client';

import { useMemo, useState } from 'react';
import type { BarSeriesOption, EChartsOption, LineSeriesOption } from 'echarts';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { EChart, useChartTokens } from '@/components/charts/echart';
import type { ChartTokens } from '@/components/charts/echart';
import { SegmentedControl } from '@/components/ui/primitives';

type FlowKey =
  | 'revenue' | 'other_income' | 'refund' | 'cost_of_goods_sold'
  | 'operating_expense' | 'acquisition_cost' | 'tax' | 'capital_expenditure';

export type MonthlyPoint = Record<FlowKey, number> & {
  month: string;
  recordCount: number;
  mrr: number | null;
};

export type MonthlySeries = {
  currency: string;
  typesPresent: string[];
  points: MonthlyPoint[];
};

type View = 'flow' | 'margin' | 'recurring';
type Flow = { key: FlowKey; name: string; token: string; alpha: number };

const INFLOWS: Flow[] = [
  { key: 'revenue', name: 'Revenue', token: 'chart-1', alpha: 1 },
  { key: 'other_income', name: 'Other income', token: 'chart-2', alpha: 1 },
];
const OUTFLOWS: Flow[] = [
  { key: 'refund', name: 'Refunds', token: 'destructive', alpha: 0.85 },
  { key: 'cost_of_goods_sold', name: 'Cost of goods sold', token: 'chart-5', alpha: 1 },
  { key: 'operating_expense', name: 'Operating expenses', token: 'chart-3', alpha: 1 },
  { key: 'acquisition_cost', name: 'Acquisition spend', token: 'chart-3', alpha: 0.5 },
  { key: 'tax', name: 'Tax', token: 'muted-foreground', alpha: 0.6 },
  { key: 'capital_expenditure', name: 'Capital expenditure', token: 'chart-5', alpha: 0.5 },
];

const round2 = (value: number) => Math.round(value * 100) / 100;
const totalIn = (point: MonthlyPoint) => point.revenue + point.other_income;
const totalOut = (point: MonthlyPoint) => OUTFLOWS.reduce((sum, flow) => sum + point[flow.key], 0);

function money(value: number, currency: string, compact = false): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: compact ? 'compact' : 'standard',
      maximumFractionDigits: compact ? 1 : 2,
    }).format(value);
  } catch {
    return `${currency} ${new Intl.NumberFormat('en-US', { notation: compact ? 'compact' : 'standard', maximumFractionDigits: 2 }).format(value)}`;
  }
}

function monthLabel(month: string, long = false): string {
  return new Intl.DateTimeFormat('en-GB', { month: long ? 'long' : 'short', year: long ? 'numeric' : '2-digit', timeZone: 'UTC' })
    .format(new Date(`${month}-01T00:00:00Z`));
}

function pctChange(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

const gradient = (top: string, bottom: string) => ({
  type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
  colorStops: [{ offset: 0, color: top }, { offset: 1, color: bottom }],
});

type TooltipItem = { dataIndex: number; seriesName: string; value: unknown; marker: string };

function tooltipRows(items: TooltipItem[], format: (item: TooltipItem) => string): string {
  return items
    .filter((item) => typeof item.value === 'number' && Number.isFinite(item.value))
    .map((item) => `<div style="display:flex;justify-content:space-between;gap:20px;line-height:20px"><span>${item.marker}${item.seriesName}</span><span style="font-variant-numeric:tabular-nums;font-weight:600">${format(item)}</span></div>`)
    .join('');
}

function buildOption(view: View, series: MonthlySeries, t: ChartTokens): EChartsOption {
  const { points, currency } = series;
  const count = points.length;
  const present = new Set(series.typesPresent);
  const muted = t.color('muted-foreground');
  const foreground = t.color('foreground');
  const border = t.color('border');
  const card = t.color('card');
  const grid = t.color('chart-grid');
  const zoomable = count > 12;
  const compactMoney = (value: number) => money(value, currency, true);
  const header = (index: number) => `<div style="font-weight:600;margin-bottom:4px">${monthLabel(points[index].month, true)}</div>`;
  const footer = (text: string) => (text ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid ${border};color:${muted}">${text}</div>` : '');

  let chartSeries: Array<BarSeriesOption | LineSeriesOption> = [];
  let yAxis: EChartsOption['yAxis'] = {
    type: 'value',
    axisLabel: { formatter: compactMoney, color: muted, fontSize: 11 },
    splitLine: { lineStyle: { color: grid, type: [3, 4] } },
  };
  let formatter: (params: unknown) => string;

  if (view === 'flow') {
    const inflows = INFLOWS.filter((flow) => present.has(flow.key));
    const outflows = OUTFLOWS.filter((flow) => present.has(flow.key));
    const bar = (flow: Flow, sign: 1 | -1, radius: number[]): BarSeriesOption => ({
      name: flow.name,
      type: 'bar',
      stack: 'flow',
      barMaxWidth: 26,
      emphasis: { focus: 'series' },
      itemStyle: {
        color: sign > 0
          ? gradient(t.color(flow.token, flow.alpha), t.color(flow.token, flow.alpha * 0.55))
          : gradient(t.color(flow.token, flow.alpha * 0.55), t.color(flow.token, flow.alpha)),
        borderRadius: radius,
      },
      data: points.map((point) => round2(point[flow.key] * sign)),
    });
    const green = t.color('chart-4');
    chartSeries = [
      ...inflows.map((flow, index) => bar(flow, 1, index === inflows.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0])),
      ...outflows.map((flow, index) => bar(flow, -1, index === outflows.length - 1 ? [0, 0, 4, 4] : [0, 0, 0, 0])),
      {
        name: 'Net (in − out)',
        type: 'line',
        smooth: 0.35, smoothMonotone: 'x',
        z: 10,
        symbol: 'circle',
        symbolSize: 7,
        showSymbol: count <= 18,
        lineStyle: { width: 2.5, color: green },
        itemStyle: { color: green, borderColor: card, borderWidth: 2 },
        emphasis: { focus: 'series' },
        data: points.map((point) => round2(totalIn(point) - totalOut(point))),
      },
    ];
    formatter = (params) => {
      const items = (Array.isArray(params) ? params : [params]) as TooltipItem[];
      const index = items[0]?.dataIndex ?? 0;
      const point = points[index];
      const change = index > 0 ? pctChange(point.revenue, points[index - 1].revenue) : null;
      const notes = [
        point.recordCount === 0 ? 'No transactions recorded' : `${point.recordCount} transaction${point.recordCount === 1 ? '' : 's'}`,
        change === null ? '' : `Revenue ${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs ${monthLabel(points[index - 1].month).split(' ')[0]}`,
      ].filter(Boolean).join(' · ');
      return header(index)
        + tooltipRows(items, (item) => {
          const value = item.value as number;
          return item.seriesName.startsWith('Net') ? money(value, currency) : money(Math.abs(value), currency);
        })
        + footer(notes);
    };
  } else if (view === 'margin') {
    const hasOpex = present.has('operating_expense');
    const amber = t.color('chart-5');
    const netRevenue = points.map((point) => point.revenue - point.refund);
    const gross = points.map((point, index) => round2(netRevenue[index] - point.cost_of_goods_sold));
    const operating = points.map((point, index) => round2(gross[index] - point.operating_expense - point.acquisition_cost));
    // Losses are drawn in red below the line whatever the series colour.
    const signedBar = (name: string, values: number[], token: string): BarSeriesOption => ({
      name,
      type: 'bar',
      barMaxWidth: 20,
      emphasis: { focus: 'series' },
      itemStyle: { color: t.color(token) },
      data: values.map((value) => ({
        value,
        itemStyle: value < 0
          ? { color: gradient(t.color('destructive', 0.45), t.color('destructive')), borderRadius: [0, 0, 3, 3] }
          : { color: gradient(t.color(token), t.color(token, 0.45)), borderRadius: [3, 3, 0, 0] },
      })),
    });
    yAxis = [
      yAxis as object,
      { type: 'value', position: 'right', axisLabel: { formatter: '{value}%', color: muted, fontSize: 11 }, splitLine: { show: false } },
    ] as EChartsOption['yAxis'];
    chartSeries = [
      signedBar('Gross profit', gross, 'chart-4'),
      ...(hasOpex ? [signedBar('Operating result', operating, 'chart-1')] : []),
      {
        name: 'Gross margin',
        type: 'line',
        yAxisIndex: 1,
        smooth: 0.3, smoothMonotone: 'x',
        z: 10,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 7,
        lineStyle: { width: 2, color: amber },
        itemStyle: { color: amber, borderColor: card, borderWidth: 2 },
        data: points.map((point, index) => (netRevenue[index] > 0 ? round2((gross[index] / netRevenue[index]) * 100) : null)),
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: amber, type: 'dashed', opacity: 0.6 },
          label: { formatter: (item: { value?: unknown }) => `Avg ${Number(item.value ?? 0).toFixed(1)}%`, color: muted, fontSize: 11, position: 'insideEndTop' },
          data: [{ type: 'average', name: 'Average margin' }],
        },
      },
    ];
    formatter = (params) => {
      const items = (Array.isArray(params) ? params : [params]) as TooltipItem[];
      const index = items[0]?.dataIndex ?? 0;
      return header(index)
        + tooltipRows(items, (item) => {
          const raw = item.value as unknown;
          const value = typeof raw === 'object' && raw !== null && 'value' in raw ? Number((raw as { value: number }).value) : Number(raw);
          return item.seriesName === 'Gross margin' ? `${value.toFixed(1)}%` : money(value, currency);
        })
        + footer(netRevenue[index] > 0 ? '' : 'No revenue this month, so no margin');
    };
  } else {
    const cyan = t.color('chart-2');
    const values = points.map((point) => round2(point.mrr ?? 0));
    const peak = Math.max(...values);
    chartSeries = [{
      name: 'Monthly recurring revenue',
      type: 'line',
      smooth: 0.3, smoothMonotone: 'x',
      symbol: 'circle',
      symbolSize: 7,
      showSymbol: count <= 18,
      lineStyle: { width: 2.5, color: cyan },
      itemStyle: { color: cyan, borderColor: card, borderWidth: 2 },
      areaStyle: { color: gradient(t.color('chart-2', 0.35), t.color('chart-2', 0)) },
      data: values,
      ...(peak > 0 ? {
        markPoint: {
          symbol: 'pin',
          symbolSize: 42,
          itemStyle: { color: cyan },
          label: { formatter: (item: { value?: unknown }) => compactMoney(Number(item.value ?? 0)), fontSize: 10, color: card },
          data: [{ type: 'max', name: 'Peak MRR' }],
        },
      } : {}),
    }];
    formatter = (params) => {
      const items = (Array.isArray(params) ? params : [params]) as TooltipItem[];
      const index = items[0]?.dataIndex ?? 0;
      const mrr = values[index];
      const change = index > 0 ? pctChange(mrr, values[index - 1]) : null;
      return header(index)
        + tooltipRows(items, (item) => money(item.value as number, currency))
        + `<div style="display:flex;justify-content:space-between;gap:20px;line-height:20px;color:${muted}"><span>Annual run-rate (ARR)</span><span style="font-variant-numeric:tabular-nums">${money(mrr * 12, currency)}</span></div>`
        + footer(change === null ? 'Month-end contract snapshot' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs previous month-end`);
    };
  }

  return {
    animation: !t.reducedMotion,
    animationDuration: 450,
    animationEasing: 'cubicOut',
    aria: { enabled: true },
    textStyle: { fontFamily: t.fontSans, color: muted },
    grid: { left: 4, right: view === 'margin' ? 4 : 12, top: 52, bottom: zoomable ? 46 : 6, containLabel: true },
    legend: {
      top: 0,
      left: 0,
      right: 64,
      type: 'scroll',
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 16,
      textStyle: { color: foreground, fontSize: 12 },
      inactiveColor: t.color('muted-foreground', 0.4),
      pageTextStyle: { color: muted },
    },
    toolbox: {
      right: 0,
      top: 0,
      itemSize: 14,
      itemGap: 10,
      iconStyle: { borderColor: muted },
      emphasis: { iconStyle: { borderColor: foreground } },
      feature: {
        ...(zoomable ? { restore: { title: 'Reset zoom' } } : {}),
        saveAsImage: { title: 'Download PNG', name: `lumorius-${view}-${currency.toLowerCase()}`, backgroundColor: card, pixelRatio: 2 },
      },
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: view === 'recurring'
        ? { type: 'line', lineStyle: { color: t.color('foreground', 0.25), type: 'dashed' } }
        : { type: 'shadow', shadowStyle: { color: t.color('foreground', 0.05) } },
      backgroundColor: t.color('popover'),
      borderColor: border,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.color('popover-foreground'), fontSize: 12, fontFamily: t.fontSans },
      extraCssText: 'border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.18);',
      formatter: formatter as never,
    },
    xAxis: {
      type: 'category',
      data: points.map((point) => point.month),
      axisLabel: { formatter: (value: string) => monthLabel(value), color: muted, fontSize: 11, hideOverlap: true },
      axisLine: { lineStyle: { color: border } },
      axisTick: { show: false },
    },
    yAxis,
    dataZoom: zoomable
      ? [
          { type: 'inside', startValue: count - 12, endValue: count - 1, zoomOnMouseWheel: 'ctrl', moveOnMouseWheel: false, moveOnMouseMove: true },
          {
            type: 'slider',
            startValue: count - 12,
            endValue: count - 1,
            height: 18,
            bottom: 8,
            borderColor: border,
            backgroundColor: 'transparent',
            fillerColor: t.color('chart-1', 0.12),
            handleStyle: { color: card, borderColor: t.color('chart-1') },
            moveHandleStyle: { color: t.color('chart-1', 0.4) },
            textStyle: { color: muted, fontSize: 11 },
            labelFormatter: (_: unknown, value: string) => monthLabel(value),
            dataBackground: { lineStyle: { color: t.color('chart-1', 0.4) }, areaStyle: { color: t.color('chart-1', 0.1) } },
          },
        ]
      : [],
    series: chartSeries,
  };
}

/** Interactive monthly revenue analytics for one currency, built on Apache ECharts. */
export default function RevenueAnalytics({ series }: { series: MonthlySeries }) {
  const tokens = useChartTokens();
  const [view, setView] = useState<View>('flow');
  const [showData, setShowData] = useState(false);
  const { points, currency } = series;
  const present = new Set(series.typesPresent);
  const hasMrr = points.some((point) => point.mrr !== null);
  const views: Array<{ value: View; label: string }> = [
    ...(series.typesPresent.length ? [{ value: 'flow' as const, label: 'Revenue & costs' }] : []),
    ...(present.has('revenue') && present.has('cost_of_goods_sold') ? [{ value: 'margin' as const, label: 'Profit & margin' }] : []),
    ...(hasMrr ? [{ value: 'recurring' as const, label: 'Recurring' }] : []),
  ];
  const activeView = views.some((item) => item.value === view) ? view : views[0]?.value;

  const option = useMemo(
    () => (tokens && activeView ? buildOption(activeView, series, tokens) : null),
    [activeView, series, tokens],
  );

  const stats = useMemo(() => {
    const last = points[points.length - 1];
    const previous = points[points.length - 2];
    const revenueTotal = points.reduce((sum, point) => sum + point.revenue, 0);
    const netRevenueTotal = points.reduce((sum, point) => sum + point.revenue - point.refund, 0);
    const cogsTotal = points.reduce((sum, point) => sum + point.cost_of_goods_sold, 0);
    const costsTotal = points.reduce((sum, point) => sum + totalOut(point), 0);
    const best = points.reduce<MonthlyPoint | null>((top, point) => (point.revenue > 0 && (!top || point.revenue > top.revenue) ? point : top), null);
    return {
      revenueTotal,
      monthsWithRevenue: points.filter((point) => point.revenue > 0).length,
      best,
      last,
      lastChange: previous ? pctChange(last.revenue, previous.revenue) : null,
      grossMargin: series.typesPresent.includes('cost_of_goods_sold') && netRevenueTotal > 0 ? ((netRevenueTotal - cogsTotal) / netRevenueTotal) * 100 : null,
      costsTotal,
    };
  }, [points, series.typesPresent]);

  if (!activeView || points.length === 0) {
    return (
      <section className="lm-panel p-5">
        <h3 className="text-base font-semibold text-foreground">Monthly revenue analytics</h3>
        <p className="mt-2 text-sm text-muted-foreground">No committed {currency} records in the last {points.length || 12} months.</p>
      </section>
    );
  }

  const first = points[0].month;
  const last = points[points.length - 1].month;
  const tiles: Array<{ label: string; value: string; detail?: React.ReactNode }> = [
    { label: `${points.length}-month revenue`, value: money(stats.revenueTotal, currency), detail: `${stats.monthsWithRevenue} month${stats.monthsWithRevenue === 1 ? '' : 's'} with revenue` },
    { label: 'Best month', value: stats.best ? money(stats.best.revenue, currency) : '—', detail: stats.best ? monthLabel(stats.best.month, true) : 'No revenue recorded' },
    {
      label: `${monthLabel(stats.last.month, true)}`,
      value: money(stats.last.revenue, currency),
      detail: stats.lastChange === null ? 'Revenue this month' : (
        <span className={`inline-flex items-center gap-0.5 font-medium ${stats.lastChange >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
          {stats.lastChange >= 0 ? <ArrowUpRight size={13} aria-hidden="true" /> : <ArrowDownRight size={13} aria-hidden="true" />}
          {stats.lastChange >= 0 ? '+' : ''}{stats.lastChange.toFixed(1)}% vs previous month
        </span>
      ),
    },
    stats.grossMargin !== null
      ? { label: 'Gross margin', value: `${stats.grossMargin.toFixed(1)}%`, detail: 'Revenue less refunds and cost of goods sold' }
      : { label: 'Total costs', value: money(stats.costsTotal, currency), detail: 'Refunds, direct and operating costs' },
  ];

  return (
    <section className="lm-panel p-4 sm:p-5" aria-labelledby={`revenue-analytics-${currency}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`revenue-analytics-${currency}`} className="text-base font-semibold text-foreground">Monthly revenue analytics</h3>
          <p className="mt-1 text-xs text-muted-foreground">{currency} · {monthLabel(first, true)} – {monthLabel(last, true)} · committed records only</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {views.length > 1 && <SegmentedControl options={views} value={activeView} onChange={setView} label="Chart view" />}
          <button type="button" aria-pressed={showData} onClick={() => setShowData((current) => !current)} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/90 hover:bg-muted">
            {showData ? 'Show chart' : 'Show data'}
          </button>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-card px-3.5 py-3">
            <dt className="truncate text-xs text-muted-foreground">{tile.label}</dt>
            <dd className="mt-1 truncate font-mono text-lg font-medium tabular-nums text-foreground">{tile.value}</dd>
            {tile.detail ? <dd className="mt-0.5 truncate text-xs text-muted-foreground">{tile.detail}</dd> : null}
          </div>
        ))}
      </dl>

      <div className="mt-4">
        {showData ? (
          <div className="max-h-[360px] overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Month</th>
                  <th className="px-3 py-2 text-right font-medium">Revenue</th>
                  <th className="px-3 py-2 text-right font-medium">Costs</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  {hasMrr && <th className="px-3 py-2 text-right font-medium">MRR</th>}
                  <th className="px-3 py-2 text-right font-medium">Records</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...points].reverse().map((point) => (
                  <tr key={point.month}>
                    <td className="px-3 py-2 text-foreground/90">{monthLabel(point.month, true)}</td>
                    <td className="px-3 py-2 text-right text-foreground/80">{money(point.revenue, currency)}</td>
                    <td className="px-3 py-2 text-right text-foreground/80">{money(totalOut(point), currency)}</td>
                    <td className="px-3 py-2 text-right text-foreground/80">{money(totalIn(point) - totalOut(point), currency)}</td>
                    {hasMrr && <td className="px-3 py-2 text-right text-foreground/80">{money(point.mrr ?? 0, currency)}</td>}
                    <td className="px-3 py-2 text-right text-muted-foreground">{point.recordCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EChart
            option={option}
            height={360}
            ariaLabel={`Monthly ${activeView === 'flow' ? 'revenue and costs' : activeView === 'margin' ? 'profit and margin' : 'recurring revenue'} in ${currency}, ${monthLabel(first, true)} to ${monthLabel(last, true)}`}
          />
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {activeView === 'flow' && 'Money in sits above the line and money out below it; the green line is the net. '}
        Click a legend item to hide or show it.{points.length > 12 ? ' Drag or use the slider to move through months; hold Ctrl and scroll to zoom.' : ''}
      </p>
    </section>
  );
}
