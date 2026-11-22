import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

type Tone = 'primary' | 'success' | 'warning' | 'critical' | 'info' | 'violet' | 'neutral';

const STROKE: Record<Tone, string> = {
  primary: 'hsl(var(--chart-1))',
  success: 'hsl(var(--chart-4))',
  warning: 'hsl(var(--chart-5))',
  critical: 'hsl(var(--destructive))',
  info: 'hsl(var(--chart-2))',
  violet: 'hsl(var(--chart-3))',
  neutral: 'hsl(var(--muted-foreground))',
};

/**
 * Radial gauge for a share (e.g. tasks completed of all tasks). Pure SVG, so it
 * costs nothing to render; the arc animates in with CSS and respects reduced motion.
 */
export function RingGauge({
  value,
  max,
  label,
  caption,
  tone = 'primary',
  size = 168,
}: {
  value: number | null;
  max: number | null;
  label: string;
  caption?: React.ReactNode;
  tone?: Tone;
  size?: number;
}) {
  const pct = value !== null && max ? Math.max(0, Math.min(100, (value / max) * 100)) : null;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = pct === null ? 0 : (pct / 100) * circumference;
  return (
    <figure className="flex flex-col items-center text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img"
          aria-label={pct === null ? `${label}: no data` : `${label}: ${Math.round(pct)}%`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
          {/* Tick marks every 10% */}
          {Array.from({ length: 10 }).map((_, i) => {
            const a = (i / 10) * 2 * Math.PI;
            const r1 = r + stroke / 2 + 3;
            const r2 = r1 + 4;
            return <line key={i} x1={size / 2 + r1 * Math.cos(a)} y1={size / 2 + r1 * Math.sin(a)} x2={size / 2 + r2 * Math.cos(a)} y2={size / 2 + r2 * Math.sin(a)} stroke="hsl(var(--border-strong))" strokeWidth={1} />;
          })}
          {pct !== null && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={STROKE[tone]} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference}`} className="lm-ring-arc" style={{ ['--lm-ring' as string]: `${circumference}` }} />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-medium tabular-nums">{pct === null ? '—' : `${Math.round(pct)}%`}</span>
          <span className="mt-0.5 text-xs text-muted-foreground">{label}</span>
        </div>
      </div>
      {caption && <figcaption className="mt-3 text-sm text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}

/** Horizontal share bar with a label and value, for breakdowns next to a gauge. */
export function ShareBar({ label, value, total, tone = 'primary', hint }: { label: string; value: number | null; total: number | null; tone?: Tone; hint?: string }) {
  const pct = value !== null && total ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
  return (
    <div title={hint}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-foreground/90">{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{value === null ? '—' : value.toLocaleString()}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-[width] duration-700 ease-out-expo" style={{ width: `${pct}%`, background: STROKE[tone] }} />
      </div>
    </div>
  );
}

/** Compact stat with an accent edge and an optional meter (value against a total). */
export function StatTile({
  label,
  value,
  note,
  icon: Icon,
  tone = 'primary',
  meter,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  meter?: { value: number | null; total: number | null };
}) {
  const pct = meter && meter.value !== null && meter.total ? Math.max(0, Math.min(100, (meter.value / meter.total) * 100)) : null;
  return (
    <article className="lm-panel lm-panel-interactive relative min-w-0 overflow-hidden p-4">
      <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: STROKE[tone] }} />
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />}
      </div>
      <p className="mt-1.5 font-mono text-2xl font-medium tabular-nums">{value}</p>
      {pct !== null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: STROKE[tone] }} />
        </div>
      )}
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </article>
  );
}
