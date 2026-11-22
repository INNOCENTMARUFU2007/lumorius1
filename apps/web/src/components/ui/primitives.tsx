import { AlertTriangle, ArrowDownRight, ArrowUpRight, Info, Minus, RefreshCw, type LucideIcon } from 'lucide-react';
import { cn, formatRelative } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

/**
 * Page title row. Deliberately plain: title, one line of context, actions on
 * the right, a hairline underneath. `icon` and `hero` are accepted for API
 * compatibility; `hero` only adds the bottom rule and spacing.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  hero = false,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  hero?: boolean;
  className?: string;
}) {
  return (
    <header className={cn(hero && 'border-b border-border pb-6', className)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-sm text-muted-foreground">{eyebrow}</p>}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Panels / sections                                                   */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
  as: Tag = 'section',
  footer,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: 'section' | 'article' | 'div';
  footer?: React.ReactNode;
}) {
  return (
    <Tag className={cn('lm-panel flex min-w-0 flex-col', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>}
              {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn('flex-1 p-5', bodyClassName)}>{children}</div>
      {footer && <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{footer}</div>}
    </Tag>
  );
}

export function SectionHeading({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={cn('lm-skeleton', className)} style={style} />;
}

export function EmptyState({
  icon: Icon = Info,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong/70 bg-muted/20 text-center',
        compact ? 'min-h-32 px-4 py-5' : 'min-h-44 px-6 py-8',
        className,
      )}
    >
      <span className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3', className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Indicators                                                          */
/* ------------------------------------------------------------------ */

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'critical' | 'info' | 'violet';

const toneClass: Record<Tone, string> = {
  neutral: 'border-border bg-muted/60 text-muted-foreground',
  primary: 'border-primary/30 bg-primary/10 text-primary',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  critical: 'border-destructive/30 bg-destructive/10 text-destructive',
  info: 'border-info/30 bg-info/10 text-info',
  violet: 'border-violet/30 bg-violet/10 text-violet',
};

const dotClass: Record<Tone, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  critical: 'bg-destructive',
  info: 'bg-info',
  violet: 'bg-violet',
};

export function StatusBadge({ tone = 'neutral', children, dot = true, className }: { tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium capitalize', toneClass[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotClass[tone])} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function TrendIndicator({
  current,
  previous,
  higherIsBetter = true,
  unit = '',
  className,
}: {
  current: number | null;
  previous: number | null;
  higherIsBetter?: boolean;
  unit?: string;
  className?: string;
}) {
  if (current === null || previous === null) return null;
  const delta = current - previous;
  const pct = previous !== 0 ? (delta / Math.abs(previous)) * 100 : null;
  const good = delta === 0 ? null : (delta > 0) === higherIsBetter;
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const label =
    pct === null
      ? `${delta > 0 ? '+' : ''}${delta.toLocaleString()}${unit}`
      : `${delta > 0 ? '+' : ''}${pct.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
        good === null ? 'bg-muted text-muted-foreground' : good ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
        className,
      )}
      title={`Previous period: ${previous.toLocaleString()}${unit} · change ${delta > 0 ? '+' : ''}${delta.toLocaleString()}${unit}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
      <span className="sr-only"> versus previous period</span>
    </span>
  );
}

export function DataFreshness({ at, label = 'Updated', className }: { at?: string | Date | null; label?: string; className?: string }) {
  if (!at) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)} title={date.toLocaleString()}>
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60 motion-reduce:hidden" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
      </span>
      {label} {formatRelative(date)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control / time range                                      */
/* ------------------------------------------------------------------ */

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150',
              active ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sparkline (pure SVG — no chart runtime cost)                        */
/* ------------------------------------------------------------------ */

export function Sparkline({ values, className, label }: { values: number[]; className?: string; label?: string }) {
  if (values.length < 2) return null;
  const width = 96;
  const height = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [(i / (values.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)]);
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('h-7 w-24 overflow-visible text-primary', className)} role="img" aria-label={label ?? 'Trend'} preserveAspectRatio="none">
      <path d={area} fill="currentColor" opacity={0.12} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Metric card                                                         */
/* ------------------------------------------------------------------ */

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  note?: React.ReactNode;
  /** Tooltip explaining how the metric is calculated. */
  detail?: string;
  available?: boolean;
  loading?: boolean;
  trend?: React.ReactNode;
  sparkline?: number[];
  emphasis?: 'default' | 'primary';
  tone?: Tone;
  href?: string;
  className?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  note,
  detail,
  available = true,
  loading = false,
  trend,
  sparkline,
  emphasis = 'default',
  tone = 'primary',
  className,
}: MetricCardProps) {
  void tone;
  return (
    <article
      title={detail}
      className={cn('lm-panel lm-panel-interactive group relative min-w-0 overflow-hidden p-4', className)}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />}
      </div>
      {loading ? (
        <Skeleton className="mt-2.5 h-7 w-24" />
      ) : (
        <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <p
            className={cn(
              'whitespace-pre-line break-words font-semibold tracking-tight tabular-nums',
              available ? (emphasis === 'primary' ? 'text-[28px] leading-9 text-foreground' : 'text-2xl text-foreground') : 'text-sm text-muted-foreground',
            )}
          >
            {value}
          </p>
          {available && sparkline && sparkline.length > 1 && <Sparkline values={sparkline} label={`${label} trend`} />}
        </div>
      )}
      {(note || trend) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {trend}
          {note && <p className="line-clamp-2 min-w-0 flex-1 text-xs leading-4 text-muted-foreground">{note}</p>}
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Insight panel — always labels provenance                            */
/* ------------------------------------------------------------------ */

export type InsightProvenance = 'calculated' | 'ai' | 'missing';

export interface Insight {
  id: string;
  tone: Tone;
  title: string;
  body: React.ReactNode;
  provenance: InsightProvenance;
  evidence?: React.ReactNode;
  action?: React.ReactNode;
}

const provenanceLabel: Record<InsightProvenance, { label: string; tone: Tone; title: string }> = {
  calculated: { label: 'Calculated', tone: 'success', title: 'Deterministic result computed from your recorded data.' },
  ai: { label: 'AI interpretation', tone: 'violet', title: 'Generated by AI. Verify against the cited evidence before acting.' },
  missing: { label: 'Data gap', tone: 'warning', title: 'Information required for this analysis is missing or stale.' },
};

export function InsightList({ insights }: { insights: Insight[] }) {
  return (
    <ul className="space-y-2.5">
      {insights.map((insight) => {
        const p = provenanceLabel[insight.provenance];
        return (
          <li key={insight.id} className="rounded-xl border border-border bg-muted/25 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClass[insight.tone])} aria-hidden="true" />
              <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{insight.title}</p>
              <span title={p.title}>
                <StatusBadge tone={p.tone} dot={false}>{p.label}</StatusBadge>
              </span>
            </div>
            <div className="mt-1.5 pl-4 text-xs leading-5 text-muted-foreground">{insight.body}</div>
            {insight.evidence && <div className="mt-2 pl-4 text-xs text-muted-foreground/90">{insight.evidence}</div>}
            {insight.action && <div className="mt-2 pl-4">{insight.action}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Progress bar                                                        */
/* ------------------------------------------------------------------ */

export function ProgressBar({ value, max, tone = 'primary', label }: { value: number; max: number; tone?: Tone; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out-expo', dotClass[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
