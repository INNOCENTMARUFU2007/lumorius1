'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CandlestickChart, LineChart, RefreshCw } from 'lucide-react';
import api from '@/lib/api';

const instruments = ['BTC-USD', 'ETH-USD', 'EUR/USD', 'USD/JPY', 'SPY', 'QQQ'] as const;
const ranges = ['1D', '1W', '1M', '3M'] as const;
type Point = { time: number; close: number; open?: number; high?: number; low?: number; volume?: number | null };
type History = { source: string | null; retrievedAt: string | null; state: 'available' | 'stale' | 'unavailable'; reason?: string;
  series: { kind: 'reference' | 'candles'; interval: string; points: Point[] } | null };
const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 5 });
const stamp = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const date = new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' });
const control = 'rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-400 focus-visible:outline focus-visible:outline-cyan-400 disabled:opacity-50';

export default function MarketHistory({ account }: { account: string }) {
  const [symbol, setSymbol] = useState<typeof instruments[number]>('BTC-USD');
  const [range, setRange] = useState<typeof ranges[number]>('1M');
  const [mode, setMode] = useState<'candles' | 'line'>('candles');
  const query = useQuery({
    queryKey: ['business-twin', 'history', account, symbol, range],
    queryFn: async () => (await api.get<{ data: History }>('/workspace/business-twin/history', { params: { symbol, range } })).data.data,
    retry: false, staleTime: 80_000, refetchInterval: 100_000,
  });
  const payload = query.data;
  const reason = payload?.reason === 'provider_required' ? 'This equity needs a configured Twelve Data connection.'
    : payload?.reason === 'no_intraday_reference' ? 'The ECB publishes a daily reference rate. Select 1W or longer.'
      : 'The data provider did not return usable observations. Try again or select a different instrument.';
  return <section aria-label="Price history" className="space-y-4 rounded-2xl border border-slate-700 bg-[#101928] p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-medium  text-cyan-300">Market Monitor</p><h2 className="mt-1 text-2xl font-semibold">Price history</h2></div>
      <div className="flex flex-wrap items-center gap-2">
        <select className={control} aria-label="Market instrument" value={symbol} onChange={e => setSymbol(e.target.value as typeof symbol)}>
          {instruments.map(instrument => <option key={instrument}>{instrument}</option>)}
        </select>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Chart range">
          {ranges.map(period => <button key={period} type="button" aria-pressed={range === period} onClick={() => setRange(period)} className={control + (range === period ? ' border-cyan-500 text-cyan-200' : '')}>{period}</button>)}
        </div>
        <button type="button" aria-label="Refresh price history" title="Refresh price history" disabled={query.isFetching} className={control} onClick={() => void query.refetch()}><RefreshCw className="size-4" /></button>
      </div>
    </header>
    {query.isPending ? <p role="status" className="p-6 text-sm text-slate-300">Loading price history…</p> : null}
    {query.isError && !payload?.series ? <p role="alert" className="p-6 text-sm text-amber-200">Could not load price history. Refresh to try again.</p> : null}
    {payload && !payload.series ? <p role="status" className="rounded-lg border border-slate-700 p-4 text-sm text-slate-300">{reason}</p> : null}
    {payload?.series && <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
        <p>{payload.source} · {payload.series.kind === 'reference' ? 'Daily reference rate' : payload.series.interval + ' bars'} · Times in UTC · Retrieved {payload.retrievedAt ? stamp.format(Date.parse(payload.retrievedAt)) : '—'}</p>
        {payload.series.kind === 'candles' && <button type="button" className={control + ' inline-flex items-center gap-2'} onClick={() => setMode(mode === 'line' ? 'candles' : 'line')}>
          {mode === 'line' ? <CandlestickChart className="size-4" /> : <LineChart className="size-4" />} {mode === 'line' ? 'Candles' : 'Close line'}
        </button>}
      </div>
      {(payload.state === 'stale' || query.isError) && <p role="status" className="text-xs text-amber-200">Source refresh failed. Showing the last retrieved series.</p>}
      <PricePlot key={symbol + ':' + range} points={payload.series.points} candle={payload.series.kind === 'candles' && mode === 'candles'} />
    </>}
  </section>;
}

function PricePlot({ points, candle }: { points: Point[]; candle: boolean }) {
  const [index, setIndex] = useState<number | null>(null);
  const selected = index === null ? points.length - 1 : Math.min(points.length - 1, index);
  const first = points[0], last = points[points.length - 1], current = points[selected];
  const change = 100 * (last.close / first.close - 1);
  const min = Math.min(...points.map(p => candle ? p.low ?? p.close : p.close));
  const max = Math.max(...points.map(p => candle ? p.high ?? p.close : p.close));
  const pad = (max - min || max * .002) * .08;
  const width = 960, height = 364, left = 12, right = 852, bottom = 272, top = 18;
  const slot = (right - left) / points.length;
  const x = (i: number) => left + (i + .5) * slot;
  const y = (n: number) => bottom - (n - min + pad) * (bottom - top) / (max - min + 2 * pad);
  const volume = Math.max(0, ...points.map(p => p.volume ?? 0));
  const tint = (p: Point) => p.close >= (p.open ?? p.close) ? '#34d399' : '#fb7185';
  return <>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300 tabular-nums">
      <span className="text-xl font-semibold text-white">{fmt.format(last.close)}</span>
      {points.length > 1 && <span className={change >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}% over shown range</span>}
      <span className="sm:ml-auto">{stamp.format(current.time)} UTC · {current.open != null && <>O {fmt.format(current.open)} · H {fmt.format(current.high!)} · L {fmt.format(current.low!)} · </>}C {fmt.format(current.close)}{current.volume != null && ' · Vol ' + fmt.format(current.volume)}</span>
    </div>
    <svg className="h-auto min-h-40 w-full rounded-xl border border-slate-800 bg-[#080e19] outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      viewBox={'0 0 ' + width + ' ' + height} tabIndex={0} role="group" aria-label="Historical price chart. Press left or right to inspect, or use the data table below."
      onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; e.preventDefault();
        setIndex(e.key === 'Home' ? 0 : e.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, selected + (e.key === 'ArrowLeft' ? -1 : 1)))); }}
      onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); setIndex(Math.max(0, Math.min(points.length - 1, Math.floor(((e.clientX - r.left) * width / r.width - left) / slot)))); }}
      onPointerLeave={() => setIndex(null)}>
      {Array.from({ length: 5 }, (_, i) => {
        const price = min - pad + (max - min + pad * 2) * i / 4;
        return <g key={i}><line x1={left} x2={right} y1={y(price)} y2={y(price)} stroke="#223047" /><text x={right + 12} y={y(price) + 4} fill="#a9b8cf" fontSize="13">{fmt.format(price)}</text></g>;
      })}
      {candle ? points.map((p, i) => <g key={p.time} fill={tint(p)} stroke={tint(p)}>
        <line x1={x(i)} x2={x(i)} y1={y(p.high!)} y2={y(p.low!)} />
        <rect x={x(i) - slot * .31} width={Math.max(1, slot * .62)} y={Math.min(y(p.open!), y(p.close))} height={Math.max(1, Math.abs(y(p.open!) - y(p.close)))} stroke="none" />
      </g>) : points.length > 1 ? <polyline points={points.map((p, i) => x(i) + ',' + y(p.close)).join(' ')} stroke="#38bdf8" strokeWidth="2" fill="none" />
        : <circle cx={x(0)} cy={y(first.close)} r={4} fill="#38bdf8" />}
      {volume > 0 && points.map((p, i) => p.volume ? <rect key={p.time} fill={tint(p)} opacity=".45" x={x(i) - slot * .3} width={slot * .6} y={327 - p.volume / volume * 38} height={p.volume / volume * 38} /> : null)}
      {volume > 0 && <text x={right + 12} y={321} fontSize="13" fill="#a9b8cf">Volume</text>}
      {[...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].map((i, order) => <text key={i} x={left + order * (right - left) / (points.length === 2 ? 1 : 2)} y={350} textAnchor={order === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fill="#a9b8cf" fontSize="13">{date.format(points[i].time)}</text>)}
      <line x1={x(selected)} x2={x(selected)} y1={top} y2={327} stroke="#a8c6e4" strokeDasharray="4 4" />
      <line x1={left} x2={right} y1={y(current.close)} y2={y(current.close)} stroke="#a8c6e4" strokeDasharray="4 4" />
    </svg>
    <details className="text-xs text-slate-300"><summary className="cursor-pointer py-2">Historical data table ({points.length} observations)</summary>
      <div className="max-h-72 overflow-auto"><table className="w-full min-w-[24rem] text-left tabular-nums"><thead><tr>
        {(first.open == null ? ['Time (UTC)', 'Reference rate'] : ['Time (UTC)', 'Open', 'High', 'Low', 'Close', 'Volume']).map(h => <th scope="col" className="p-2" key={h}>{h}</th>)}
      </tr></thead><tbody>{[...points].reverse().map(p => <tr key={p.time} className="border-t border-slate-800"><th scope="row" className="p-2 font-normal">{stamp.format(p.time)}</th>
        {(p.open == null ? [p.close] : [p.open, p.high, p.low, p.close, p.volume]).map((n, i) => <td className="p-2" key={i}>{n == null ? '—' : fmt.format(n)}</td>)}
      </tr>)}</tbody></table></div>
    </details>
  </>;
}
