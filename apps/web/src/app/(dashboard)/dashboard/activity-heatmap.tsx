import type { TrendPoint } from './completion-chart';

const LEVELS = [0, 0.18, 0.38, 0.62, 0.9];
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/**
 * Calendar heatmap of daily task completions (weeks as columns, Monday-first rows).
 * Pure markup: no chart runtime, keyboard-focusable cells with exact values.
 */
export function ActivityHeatmap({ points }: { points: TrendPoint[] }) {
  if (!points.length) return null;
  const max = Math.max(...points.map((p) => p.value), 1);

  // Pad the first week so columns align to Monday.
  const first = new Date(`${points[0].date}T12:00:00`);
  const lead = (first.getDay() + 6) % 7;
  const cells: Array<TrendPoint | null> = [...Array(lead).fill(null), ...points];
  const weeks: Array<Array<TrendPoint | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const level = (v: number) => (v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const activeDays = points.filter((p) => p.value > 0).length;

  return (
    <figure className="min-w-0">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="grid shrink-0 grid-rows-7 gap-[3px] pt-px text-xs leading-[12px] text-muted-foreground" aria-hidden="true">
          {WEEKDAYS.map((d, i) => <span key={i} className="h-3">{d}</span>)}
        </div>
        <div className="flex gap-[3px]" role="grid" aria-label="Daily task completions">
          {weeks.map((week, w) => (
            <div key={w} role="row" className="grid grid-rows-7 gap-[3px]">
              {Array.from({ length: 7 }).map((_, d) => {
                const cell = week[d];
                if (!cell) return <span key={d} className="h-3 w-3" aria-hidden="true" />;
                const l = level(cell.value);
                return (
                  <span
                    key={d}
                    role="gridcell"
                    tabIndex={0}
                    title={`${cell.label}: ${cell.value} completed`}
                    aria-label={`${cell.label}: ${cell.value} completed`}
                    className="h-3 w-3 rounded-[2px] outline-none ring-offset-1 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ background: l === 0 ? 'hsl(var(--muted))' : `hsl(var(--chart-1) / ${LEVELS[l]})` }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{activeDays} of {points.length} days with completed work</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          Less
          {LEVELS.map((o, i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: i === 0 ? 'hsl(var(--muted))' : `hsl(var(--chart-1) / ${o})` }} />
          ))}
          More
        </span>
      </figcaption>
    </figure>
  );
}

/** Single stacked bar with a legend: share of tasks per status. */
export function StatusBar({ rows }: { rows: Array<{ key: string; status: string; count: number }> }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const color = (key: string, i: number) =>
    key === 'done' ? 'hsl(var(--chart-4))' : key === 'in_progress' ? 'hsl(var(--chart-1))' : key === 'blocked' ? 'hsl(var(--destructive))' : key === 'review' ? 'hsl(var(--chart-3))' : `hsl(var(--muted-foreground) / ${0.55 - i * 0.1})`;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={rows.map((r) => `${r.status}: ${r.count}`).join(', ')}>
        {rows.map((r, i) => (
          <span key={r.key} style={{ width: `${total ? (r.count / total) * 100 : 0}%`, background: color(r.key, i) }} className="h-full border-r-2 border-card last:border-r-0" />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 capitalize text-foreground/90">
              <span className="h-2 w-2 rounded-sm" style={{ background: color(r.key, i) }} aria-hidden="true" />
              {r.status}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {r.count.toLocaleString()} · {total ? Math.round((r.count / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
