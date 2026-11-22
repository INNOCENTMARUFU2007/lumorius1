'use client';

import { Panel, Skeleton, EmptyState, ErrorState } from './primitives';
import { BarChart3, type LucideIcon } from 'lucide-react';

/** Shared Recharts styling so every chart in Lumorius looks like one system. */
export const chartTheme = {
  series: ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'],
  grid: 'hsl(var(--chart-grid))',
  axisTick: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
  tooltip: {
    contentStyle: {
      background: 'hsl(var(--popover))',
      border: '1px solid hsl(var(--border))',
      borderRadius: 10,
      fontSize: 12,
      boxShadow: '0 12px 32px -12px hsl(var(--shadow-color) / 0.5)',
      color: 'hsl(var(--popover-foreground))',
    },
    labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600, marginBottom: 4 },
    itemStyle: { color: 'hsl(var(--foreground))' },
    cursor: { stroke: 'hsl(var(--primary) / 0.35)', strokeWidth: 1 },
  },
} as const;

/**
 * Panel wrapper for any chart: title, units/period, source note, and consistent
 * loading / empty / error handling. Children render only when data is ready.
 */
export function ChartContainer({
  title,
  description,
  icon,
  actions,
  source,
  loading,
  error,
  onRetry,
  empty,
  emptyTitle = 'No data for this period',
  emptyDescription,
  height = 260,
  children,
  className,
  legend,
}: {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  source?: React.ReactNode;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: React.ReactNode;
  height?: number;
  children: React.ReactNode;
  className?: string;
  legend?: React.ReactNode;
}) {
  return (
    <Panel title={title} description={description} icon={icon} actions={actions} className={className} footer={source}>
      {loading ? (
        <Skeleton className="w-full" style={{ height }} />
      ) : error ? (
        <ErrorState title="Chart data could not be loaded" onRetry={onRetry} />
      ) : empty ? (
        <EmptyState icon={BarChart3} title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          {legend && <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">{legend}</div>}
          <div style={{ minHeight: height }} className="w-full">
            {children}
          </div>
        </>
      )}
    </Panel>
  );
}

export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}
