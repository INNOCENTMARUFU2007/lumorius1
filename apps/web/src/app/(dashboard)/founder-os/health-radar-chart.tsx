'use client';

/**
 * Business health radar, drawn directly in SVG so every value sits exactly on
 * its own axis with a label: a score of 0 is shown as a labelled point near the
 * centre of its axis (not an unlabelled dot in the middle), and a missing score
 * is shown as "No data" on its axis instead of being silently dropped.
 */
export interface RadarDimension {
  key: string;
  label: string;
  color: string;
  score: number | null;
}

const SIZE = 340;
const C = SIZE / 2;
const R = 112;
const RINGS = [25, 50, 75, 100];

function point(index: number, count: number, value: number) {
  // Start at the top, go clockwise.
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const r = (Math.max(0, Math.min(100, value)) / 100) * R;
  return { x: C + r * Math.cos(angle), y: C + r * Math.sin(angle), angle };
}

export function HealthRadarChart({
  dimensions,
  selected,
  onSelect,
}: {
  dimensions: RadarDimension[];
  selected?: string;
  onSelect?: (key: string) => void;
}) {
  const n = dimensions.length;
  const measured = dimensions.map((d, i) => ({ ...d, i })).filter((d) => d.score !== null);
  // Polygon through measured axes only; a 0 score is drawn a hair off-centre so its axis stays readable.
  const polygon = measured.map((d) => point(d.i, n, Math.max(d.score as number, 2)));
  const polygonPath = polygon.length >= 3 ? polygon.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z' : '';

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" role="img"
      aria-label={dimensions.map((d) => `${d.label}: ${d.score === null ? 'no data' : `${d.score} out of 100`}`).join('; ')}>
      <defs>
        <radialGradient id="health-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity="0.10" />
          <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity="0.35" />
        </radialGradient>
      </defs>

      {/* Rings with their values on the vertical axis */}
      {RINGS.map((ring) => {
        const pts = dimensions.map((_, i) => point(i, n, ring));
        return (
          <g key={ring}>
            <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="hsl(var(--chart-grid))" strokeWidth={ring === 100 ? 1.25 : 1} />
            <text x={C + 4} y={C - (ring / 100) * R + 3} fontSize="9" fill="hsl(var(--muted-foreground))" opacity="0.8">{ring}</text>
          </g>
        );
      })}

      {/* Axes */}
      {dimensions.map((d, i) => {
        const end = point(i, n, 100);
        return (
          <line key={d.key} x1={C} y1={C} x2={end.x} y2={end.y}
            stroke={d.score === null ? 'hsl(var(--muted-foreground))' : 'hsl(var(--chart-grid))'}
            strokeDasharray={d.score === null ? '3 4' : undefined} strokeOpacity={d.score === null ? 0.5 : 1} />
        );
      })}

      {/* Measured area */}
      {polygonPath && <path d={polygonPath} fill="url(#health-fill)" stroke="hsl(var(--chart-1))" strokeWidth={2} strokeLinejoin="round" />}
      {polygon.length === 2 && (
        <line x1={polygon[0].x} y1={polygon[0].y} x2={polygon[1].x} y2={polygon[1].y} stroke="hsl(var(--chart-1))" strokeWidth={2} />
      )}

      {/* Points, value badges and axis labels */}
      {dimensions.map((d, i) => {
        const active = d.key === selected;
        const labelPos = point(i, n, 100);
        const cos = Math.cos(labelPos.angle);
        const sin = Math.sin(labelPos.angle);
        const lx = C + (R + 22) * cos;
        const ly = C + (R + 22) * sin;
        const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end';
        const p = d.score === null ? null : point(i, n, Math.max(d.score, 2));
        return (
          <g key={d.key} onClick={() => onSelect?.(d.key)} style={{ cursor: onSelect ? 'pointer' : undefined }}>
            <text x={lx} y={ly + (sin > 0.5 ? 6 : sin < -0.5 ? -2 : 4)} textAnchor={anchor} fontSize="12"
              fontWeight={active ? 700 : 600} fill={active ? d.color : 'hsl(var(--foreground))'}>
              {d.label}
            </text>
            <text x={lx} y={ly + (sin > 0.5 ? 21 : sin < -0.5 ? 13 : 19)} textAnchor={anchor} fontSize="11"
              fill={d.score === null ? 'hsl(var(--muted-foreground))' : d.color} fontFamily="var(--font-mono)">
              {d.score === null ? 'No data' : `${d.score} / 100`}
            </text>
            {p ? (
              <>
                {active && <circle cx={p.x} cy={p.y} r={11} fill={d.color} opacity={0.18} />}
                <circle cx={p.x} cy={p.y} r={active ? 6 : 5} fill={d.color} stroke="hsl(var(--card))" strokeWidth={2} />
              </>
            ) : (
              <circle cx={labelPos.x} cy={labelPos.y} r={4} fill="none" stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
            )}
          </g>
        );
      })}
    </svg>
  );
}
