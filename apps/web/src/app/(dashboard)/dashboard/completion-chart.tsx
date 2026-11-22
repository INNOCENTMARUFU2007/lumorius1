'use client';

import { useMemo } from 'react';
import {
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';

export interface TrendPoint {
  date: string;
  label: string;
  value: number;
}

const WINDOW = 7;

/** Daily completions as bars, a trailing 7-day mean as a line, and the period mean as a reference. */
function withRollingMean(points: TrendPoint[]) {
  return points.map((point, i) => {
    const slice = points.slice(Math.max(0, i - WINDOW + 1), i + 1);
    const mean = slice.reduce((sum, p) => sum + p.value, 0) / slice.length;
    return { ...point, rolling: Number(mean.toFixed(2)) };
  });
}

function ChartTooltip({ active, payload, label, periodMean }: TooltipProps<number, string> & { periodMean: number }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as TrendPoint & { rolling: number };
  const diff = row.value - periodMean;
  return (
    <div className="min-w-44 rounded-lg border border-border bg-popover px-3 py-2.5 text-xs text-popover-foreground shadow-elevated">
      <p className="mb-2 font-medium">{label}</p>
      <dl className="space-y-1">
        <div className="flex justify-between gap-6">
          <dt className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-sm bg-chart-1" /> Completed</dt>
          <dd className="font-mono tabular-nums">{row.value}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="flex items-center gap-1.5 text-muted-foreground"><span className="h-0.5 w-2.5 bg-chart-2" /> 7-day average</dt>
          <dd className="font-mono tabular-nums">{row.rolling.toFixed(1)}</dd>
        </div>
        <div className="flex justify-between gap-6 border-t border-border pt-1">
          <dt className="text-muted-foreground">vs period average</dt>
          <dd className={`font-mono tabular-nums ${diff > 0 ? 'text-success' : diff < 0 ? 'text-destructive' : ''}`}>
            {diff > 0 ? '+' : ''}{diff.toFixed(1)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function CompletionChart({ points, height = 280 }: { points: TrendPoint[]; height?: number }) {
  const data = useMemo(() => withRollingMean(points), [points]);
  const periodMean = useMemo(() => (points.length ? points.reduce((s, p) => s + p.value, 0) / points.length : 0), [points]);
  const showBrush = points.length > 45;
  const tick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barCategoryGap="22%">
          <CartesianGrid stroke="hsl(var(--chart-grid))" vertical={false} />
          <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: 'hsl(var(--chart-grid))' }} minTickGap={28} />
          <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={44} />
          <Tooltip cursor={{ fill: 'hsl(var(--foreground) / 0.04)' }} content={<ChartTooltip periodMean={periodMean} />} />
          {periodMean > 0 && (
            <ReferenceLine
              y={periodMean}
              stroke="hsl(var(--muted-foreground) / 0.6)"
              strokeDasharray="4 4"
              label={{ value: `avg ${periodMean.toFixed(1)}`, position: 'insideTopRight', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            />
          )}
          <Bar dataKey="value" name="Completed" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          <Line dataKey="rolling" name="7-day average" type="monotone" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          {showBrush && (
            <Brush dataKey="label" height={22} travellerWidth={8} stroke="hsl(var(--border-strong))" fill="hsl(var(--muted))" tickFormatter={() => ''} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
