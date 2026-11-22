'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/utils';

/** CSS colour token (without the leading --) used for the line and gradient. */
export type SparkTone = 'chart-1' | 'chart-2' | 'chart-3' | 'chart-4' | 'chart-5' | 'muted-foreground';

/** Monotone cubic curve through the points: smooth, but never overshoots the data. */
function monotonePath(xs: number[], ys: number[]): string {
  const n = xs.length;
  const f = (value: number) => Number(value.toFixed(2));
  if (n === 2) return `M${f(xs[0])},${f(ys[0])}L${f(xs[1])},${f(ys[1])}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = xs[i + 1] - xs[i];
    slope[i] = (ys[i + 1] - ys[i]) / dx[i];
  }
  const tangent: number[] = new Array(n);
  tangent[0] = slope[0];
  tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    tangent[i] = slope[i - 1] * slope[i] <= 0
      ? 0
      : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]);
  }
  let path = `M${f(xs[0])},${f(ys[0])}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    path += `C${f(xs[i] + h)},${f(ys[i] + h * tangent[i])} ${f(xs[i + 1] - h)},${f(ys[i + 1] - h * tangent[i + 1])} ${f(xs[i + 1])},${f(ys[i + 1])}`;
  }
  return path;
}

/**
 * Gradient-filled area sparkline for KPI cards. Hover (or touch) reads a single month;
 * the area fills to zero, so negative months sit below a dashed zero line.
 */
export function AreaSparkline({
  points,
  tone = 'chart-1',
  label,
  formatValue = (value) => String(value),
  formatLabel = (value) => value,
  height = 44,
  className,
}: {
  points: Array<{ label: string; value: number }>;
  tone?: SparkTone;
  label: string;
  formatValue?: (value: number) => string;
  formatLabel?: (label: string) => string;
  height?: number;
  className?: string;
}) {
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 2) return null;

  const width = 100;
  const viewHeight = 40;
  const padTop = 4;
  const padBottom = 2;
  const values = points.map((point) => point.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min;
  const yFor = (value: number) => (span === 0 ? viewHeight - padBottom : padTop + (1 - (value - min) / span) * (viewHeight - padTop - padBottom));
  const xs = points.map((_, index) => (index / (points.length - 1)) * width);
  const ys = values.map(yFor);
  const zeroY = yFor(0);
  const line = monotonePath(xs, ys);
  const area = `${line}L${width},${zeroY.toFixed(2)}L0,${zeroY.toFixed(2)}Z`;
  const color = `hsl(var(--${tone}))`;
  const index = active ?? points.length - 1;
  const first = points[0];
  const last = points[points.length - 1];
  const xPct = xs[index];
  const tipShift = xPct < 18 ? '0%' : xPct > 82 ? '-100%' : '-50%';

  return (
    <div
      className={cn('relative touch-pan-y select-none', className)}
      style={{ height }}
      role="img"
      aria-label={`${label}: ${formatLabel(first.label)} ${formatValue(first.value)}, ${formatLabel(last.label)} ${formatValue(last.value)}`}
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - box.left) / box.width;
        setActive(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
      }}
      onPointerLeave={() => setActive(null)}
    >
      <svg viewBox={`0 0 ${width} ${viewHeight}`} preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.38 }} />
            <stop offset="70%" style={{ stopColor: color, stopOpacity: 0.08 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {min < 0 && (
          <line x1="0" x2={width} y1={zeroY} y2={zeroY} style={{ stroke: 'hsl(var(--muted-foreground) / 0.45)' }} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        )}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" style={{ stroke: color }} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {active !== null && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-foreground/15" style={{ left: `${xPct}%` }} />}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
        style={{ left: `${xPct}%`, top: `${(ys[index] / viewHeight) * 100}%`, background: color }}
      />
      {active !== null && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-8 z-10 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
          style={{ left: `${xPct}%`, transform: `translateX(${tipShift})` }}
        >
          <span className="text-muted-foreground">{formatLabel(points[index].label)}</span>{' '}
          <span className="font-mono font-medium tabular-nums">{formatValue(points[index].value)}</span>
        </span>
      )}
    </div>
  );
}
