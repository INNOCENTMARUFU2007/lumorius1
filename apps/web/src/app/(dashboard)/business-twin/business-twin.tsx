'use client';

import Link from 'next/link';
import MarketResearch from './market-research';
import MarketHistory from './market-history';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowDownToLine, ArrowUpRight, ChartNoAxesCombined, CircleDollarSign, Gauge, Radio, SlidersHorizontal } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '@/hooks/use-auth';
import api from '@/lib/api';
import { actions, Assumptions, example, forecast, risk, stats } from './simulation';

type Quote = { symbol: string; label: string; price: number; changePercent: number | null; asOf: string; exchangeOpen: boolean | null; source: string; reference?: boolean };
type Market = { state: 'configured' | 'unavailable' | 'public_feed'; updatedAt: string | null; quotes: Quote[]; unavailable: string[] };
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const pct = (value: number) => (value > 0 ? '+' : '') + value.toFixed(2) + '%';
const card = 'rounded-2xl border border-slate-700/90 bg-[#101928] p-5';
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-sky-400/70 hover:text-white disabled:opacity-40';
const fields: { key: keyof Assumptions; label: string; min: number; max: number; step: number }[] = [
  { key: 'cash', label: 'Opening cash ($)', min: 0, max: 1e9, step: 100 },
  { key: 'revenue', label: 'Month 1 revenue ($)', min: 0, max: 1e9, step: 100 },
  { key: 'monthlyGrowth', label: 'Monthly revenue growth (%)', min: -50, max: 50, step: .1 },
  { key: 'fixedCost', label: 'Month 1 fixed costs ($)', min: 0, max: 1e9, step: 100 },
  { key: 'variableCost', label: 'Variable costs (% of revenue)', min: 0, max: 100, step: .5 },
  { key: 'costInflation', label: 'Monthly fixed cost growth (%)', min: -20, max: 30, step: .1 },
  { key: 'workingCapital', label: 'Growth cash tied up (%)', min: 0, max: 100, step: 1 },
  { key: 'oneTimeSpend', label: 'One-time spend ($)', min: 0, max: 1e9, step: 100 },
  { key: 'fxExposure', label: 'Foreign-currency share of costs (%)', min: 0, max: 100, step: 1 },
  { key: 'fxShock', label: 'Foreign-currency cost shock (%)', min: -75, max: 75, step: .1 },
  { key: 'volatility', label: 'Stress-test variation (points)', min: 0, max: 30, step: 1 },
  { key: 'months', label: 'Forecast horizon (months)', min: 3, max: 24, step: 1 },
];
const growthTests = [-6, -3, 0, 3, 6];
const costTests = [-15, -7.5, 0, 7.5, 15];

function EditableNumber({ value, min, max, whole, onChange }: { value: number; min: number; max: number; whole: boolean; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input type="text" inputMode={whole ? 'numeric' : 'decimal'} value={draft ?? value}
    className="w-full rounded-lg border border-slate-700 bg-[#0b1321] px-3 py-2 text-sm tabular-nums text-slate-100 focus:border-sky-400"
    onChange={(event) => {
      const text = event.target.value;
      if (!/^-?\d*(?:\.\d*)?$/.test(text)) return;
      setDraft(text);
      const next = Number(text);
      if (text && Number.isFinite(next) && next >= min && next <= max) onChange(whole ? Math.round(next) : next);
    }}
    onBlur={() => setDraft(null)} />;
}

function exportForecast(rows: { month: number; revenue: number; expenses: number; operating: number; cash: number }[]) {
  const csv = ['Month,Revenue,Operating expenses,Operating margin dollars,Ending cash',
    ...rows.map((row) => [row.month, row.revenue.toFixed(2), row.expenses.toFixed(2), row.operating.toFixed(2), row.cash.toFixed(2)].join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv; charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'lumorius-business-twin.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type View = 'monitor' | 'research' | 'simulation';

export default function BusinessTwin({ view }: { view: View }) {
  const { user, isLoading } = useAuth();
  const allowed = Boolean(user?.organizationId) && ['owner', 'admin', 'manager', 'member'].includes(user?.role ?? '');
  if (!allowed) return <main className="p-6 text-sm text-muted-foreground">{isLoading ? 'Checking workspace access…' : 'Business Twin requires workspace member access.'}</main>;
  return <Simulation key={user?.organizationId + '/' + user?.id} account={user?.organizationId + '/' + user?.id} view={view} />;
}

function Simulation({ account, view }: { account: string; view: View }) {
  const [inputs, setInputs] = useState<Assumptions>(example);
  const [edited, setEdited] = useState(false);
  const [scenario, setScenario] = useState<[number, number]>([0, 0]);
  const [marketNote, setMarketNote] = useState('');
  const quotes = useQuery({
    queryKey: ['business-twin', 'markets', account],
    queryFn: async () => (await api.get<{ data: Market }>('/workspace/business-twin/markets')).data.data,
    enabled: view === 'monitor',
    refetchInterval: 70_000,
    retry: false,
  });

  const model = useMemo(() => {
    const base = forecast(inputs);
    const downside = forecast(inputs, -5, 12);
    const upside = forecast(inputs, 5, -7);
    const selected = forecast(inputs, scenario[0], scenario[1]);
    return {
      selected, score: stats(selected), distribution: risk({ ...inputs, monthlyGrowth: inputs.monthlyGrowth + scenario[0], fixedCost: inputs.fixedCost * (1 + scenario[1] / 100) }),
      guidance: actions({ ...inputs, monthlyGrowth: inputs.monthlyGrowth + scenario[0], fixedCost: inputs.fixedCost * (1 + scenario[1] / 100) }),
      chart: base.map((month, index) => ({ period: 'M' + month.month, Base: month.cash, Downside: downside[index].cash, Upside: upside[index].cash, Selected: selected[index].cash })),
      grid: costTests.map((cost) => growthTests.map((growth) => stats(forecast(inputs, growth, cost)).endCash)),
    };
  }, [inputs, scenario]);

  function applyFx(quote: Quote) {
    if (quote.reference || quote.symbol !== 'EUR/USD' || quote.changePercent === null || Math.abs(quote.changePercent) > 75 || quote.exchangeOpen === false ||
        Date.now() - Date.parse(quote.asOf) > 15 * 60_000) return;
    setInputs((previous) => ({ ...previous, fxShock: Math.round(quote.changePercent! * 100) / 100 }));
    setEdited(true);
    setMarketNote('EUR/USD change applied as a one-time shift in the cost level for EUR-denominated expenses.');
  }

  return (
    <main className="mx-auto max-w-[1530px] space-y-5 bg-[#0a101a] p-4 text-slate-100 sm:p-7">
      <header className="overflow-hidden rounded-2xl border border-sky-800/70 px-6 py-8 sm:px-8" style={{ background: 'radial-gradient(ellipse at 85% 4%, #09374a 0%, #111e32 50%, #101827 85%)' }}>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><Activity className="mb-4 h-6 w-6 text-sky-300" /><h1 className="text-4xl font-semibold tracking-tight">Business Twin</h1>
            <p className="mt-2 text-sm text-slate-300">Simulate cash flow, stress-test a decision, and compare the effect of operating changes.</p></div>
          <div className="flex flex-wrap gap-2"><Link className={button} href="/chief-of-staff">Chief of Staff <ArrowUpRight className="h-4 w-4" /></Link>
            {view === 'simulation' && <button className={button} onClick={() => exportForecast(model.selected)}><ArrowDownToLine className="h-4 w-4" /> Export forecast</button>}</div>
        </div>
      </header>

      <nav aria-label="Business Twin views" className="flex flex-wrap gap-2">
        {([['simulation', 'Simulation'], ['monitor', 'Market Monitor'], ['research', 'Market Research']] as const).map(([id, label]) =>
          <Link key={id} href={'/business-twin?view=' + id} scroll={false} aria-current={view === id ? 'page' : undefined}
            className={button + (view === id ? ' border-cyan-500 text-cyan-200' : '')}>{label}</Link>)}
      </nav>
      {view === 'research' && <MarketResearch account={account} />}
      {view === 'monitor' && <>
      <MarketHistory account={account} />
      {marketNote && <p className="text-sm text-cyan-200" role="status">{marketNote} <Link className="underline" href="/business-twin?view=simulation">Open simulation</Link></p>}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="flex items-center gap-2 font-semibold"><Radio className="h-4 w-4 text-cyan-300" /> Market monitor</h2>
            <p className="mt-1 text-xs text-slate-400">Quotes refresh about once a minute. Each card shows its source and observed time.</p></div>
          <button className={button} disabled={quotes.isFetching} onClick={() => void quotes.refetch()}>Refresh quotes</button>
        </div>
        {(quotes.isPending || quotes.isError || quotes.data?.state === 'unavailable') && <p className="mt-4 rounded-lg border border-slate-700 p-3 text-sm text-slate-300" role="status">
          {quotes.isPending ? 'Loading market data…' : 'Market data is temporarily unavailable. Manual assumptions are available.'}
        </p>}
        {quotes.data?.state === 'public_feed' && <p className="mt-3 text-xs text-slate-400">Public feed. Configure Twelve Data for equity and intraday FX coverage.</p>}
        {quotes.data?.quotes.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quotes.data.quotes.map((quote) => {
            const age = Date.now() - Date.parse(quote.asOf);
            const fresh = !quote.reference && age <= 15 * 60_000 && quote.exchangeOpen !== false && !quotes.isError;
            return <article className="rounded-lg border border-slate-700 px-4 py-3" key={quote.symbol}>
              <p className="flex items-center justify-between text-sm font-semibold">{quote.symbol}<span className={fresh ? 'text-xs text-cyan-300' : 'text-xs text-amber-300'}>{quote.reference ? 'Daily reference' : quote.exchangeOpen === false ? 'Closed' : fresh ? 'Recent quote' : 'Older quote'}</span></p>
              <p className="text-xs text-slate-400">{quote.label} · {quote.source}</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{quote.price.toLocaleString(undefined, { maximumFractionDigits: 5 })} <span className="text-sm text-slate-300">{quote.changePercent === null ? '' : pct(quote.changePercent)}</span></p>
              <time className="block text-xs text-slate-400" dateTime={quote.asOf}>{quote.reference ? quote.asOf : new Date(quote.asOf).toLocaleString()}</time>
              {quote.symbol === 'EUR/USD' && !quote.reference && <button className={button + ' mt-2'} disabled={!fresh || quote.changePercent === null || Math.abs(quote.changePercent) > 75} onClick={() => applyFx(quote)}>Apply to EUR cost exposure</button>}
            </article>;
          })}
        </div> : null}
        {quotes.data && quotes.data.unavailable.length > 0 && <p className="mt-3 text-xs text-slate-400">No quote returned for {quotes.data.unavailable.join(', ')}.</p>}
      </section>
      </>}

      {view === 'simulation' && <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className={card}>
          <div className="mb-4 flex items-start justify-between gap-2"><div><h2 className="flex items-center gap-2 font-semibold"><SlidersHorizontal className="h-4 w-4 text-cyan-300" /> Assumptions</h2>
            <p className="mt-1 text-xs text-slate-400">{edited ? 'Edited scenario · USD' : 'Illustrative example · USD'}</p></div>
            <button className={button} onClick={() => { setInputs(example); setScenario([0, 0]); setEdited(false); setMarketNote(''); }}>Reset</button></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {fields.map(({ key, label, min, max }) => <label key={key} className="grid gap-1 text-xs text-slate-300">{label}
              <EditableNumber value={inputs[key]} min={min} max={max} whole={key === 'months'} onChange={(value) => {
                setInputs((previous) => ({ ...previous, [key]: value }));
                if (key === 'fxShock') setMarketNote('');
                setEdited(true);
              }} />
            </label>)}
          </div>
          {marketNote && <p className="mt-4 text-xs text-cyan-200" role="status">{marketNote}</p>}
        </aside>

        <div className="min-w-0 space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Ending cash', money.format(model.score.endCash)], ['Lowest cash', money.format(model.score.lowCash)],
              ['Cash depletion', model.score.runway === null ? 'Beyond horizon' : 'Month ' + model.score.runway],
              ['Operating break-even', model.score.firstProfit === null ? 'Beyond horizon' : 'Month ' + model.score.firstProfit],
            ].map(([label, value]) => <div className={card} key={label}><p className="text-xs text-slate-400">{label}</p><p className="mt-2 break-words text-xl font-semibold tabular-nums">{value}</p></div>)}
          </section>
          <section className={card}>
            <h2 className="flex items-center gap-2 font-semibold"><ChartNoAxesCombined className="h-4 w-4 text-cyan-300" /> Cash trajectory</h2>
            <p className="mt-1 text-xs text-slate-400">Downside uses −5 growth points and +12% fixed costs. Upside uses +5 growth points and −7% fixed costs.</p>
            <div className="mt-4 h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={model.chart} margin={{ left: 0, right: 14, top: 8 }}>
                  <CartesianGrid stroke="#26364a" vertical={false} /><XAxis dataKey="period" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tickFormatter={(value) => '$' + compact.format(value)} width={66} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip formatter={(value) => money.format(Number(value))} contentStyle={{ background: '#0e1727', border: '1px solid #42546c', color: '#e2e8f0' }} labelStyle={{ color: '#e2e8f0' }} />
                  <Legend /><ReferenceLine y={0} stroke="#fbbf24" strokeDasharray="4 4" />
                  <Line type="linear" dataKey="Upside" stroke="#34d399" dot={false} strokeWidth={2} />
                  <Line type="linear" dataKey="Downside" stroke="#fda4af" dot={false} strokeWidth={2} />
                  <Line type="linear" dataKey="Base" stroke="#7dd3fc" dot={false} strokeWidth={2} />
                  {(scenario[0] !== 0 || scenario[1] !== 0) && <Line type="linear" dataKey="Selected" stroke="#c4b5fd" dot={false} strokeWidth={3} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className={card}>
            <h2 className="flex items-center gap-2 font-semibold"><Gauge className="h-4 w-4 text-cyan-300" /> Cash sensitivity</h2>
            <p className="mb-3 mt-1 text-xs text-slate-400">Pick a cell to model that fixed-cost and growth change. Selected stress {scenario[0]} growth points, {scenario[1]}% fixed costs.</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[500px] border-separate border-spacing-1 text-center text-xs tabular-nums">
              <thead><tr><th scope="col" className="p-1.5 text-left text-slate-400">Fixed cost ↓ / growth →</th>{growthTests.map((growth) => <th key={growth} scope="col" className="text-slate-400">{growth > 0 ? '+' : ''}{growth} pts</th>)}</tr></thead>
              <tbody>{costTests.map((cost, y) => <tr key={cost}><th scope="row" className="p-1.5 text-left text-slate-400">{cost > 0 ? '+' : ''}{cost}%</th>
                {growthTests.map((growth, x) => {
                  const amount = model.grid[y][x]; const selected = scenario[0] === growth && scenario[1] === cost;
                  return <td key={growth}><button className={'w-full rounded-md border px-2 py-2.5 hover:border-sky-300 ' + (selected ? 'border-sky-300' : 'border-transparent') + (amount < 0 ? ' bg-rose-950 text-rose-200' : ' bg-teal-950 text-teal-100')}
                    aria-pressed={selected} aria-label={'Growth ' + growth + ' points, fixed costs ' + cost + ' percent, ending cash ' + money.format(amount)}
                    onClick={() => setScenario([growth, cost])}>{money.format(amount)}</button></td>;
                })}</tr>)}</tbody>
            </table></div>
          </section>
          <section className={card}>
            <h2 className="flex items-center gap-2 font-semibold"><CircleDollarSign className="h-4 w-4 text-cyan-300" /> Cash risk and operating plan</h2>
            <p className="mt-2 text-xs text-slate-400">400 reproducible simulations vary monthly growth and fixed cost levels around the selected case. These outcomes depend on the variation you enter.</p>
            <dl className="my-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[['Cash depletion in simulations', (model.distribution.risk * 100).toFixed(1) + '%'], ['10th percentile cash', money.format(model.distribution.p10)], ['Median ending cash', money.format(model.distribution.p50)], ['90th percentile cash', money.format(model.distribution.p90)]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}
            </dl>
            <ul className="divide-y divide-slate-700">{model.guidance.map((action) => <li className="flex flex-wrap items-start justify-between gap-2 py-3" key={action.name}>
              <div><h3 className="text-sm font-semibold">{action.name}</h3><p className="mt-1 max-w-2xl text-xs text-slate-400">{action.next}</p></div>
              <span className={'text-sm font-medium tabular-nums ' + (action.cashGain < 0 ? 'text-rose-300' : 'text-cyan-200')}>{action.cashGain > 0 ? '+' : ''}{money.format(action.cashGain)} ending cash</span>
              <button className={button} onClick={() => { setInputs(action.inputs); setScenario([0, 0]); setEdited(true); }}>Model action</button>
            </li>)}</ul>
            <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">Calculation details</summary>
              <p className="mt-2">Revenue compounds monthly after month one. Costs combine inflation-adjusted fixed costs and a share of revenue. The FX shock adjusts the exposed share of costs. Cash subtracts one-time spend and incremental working capital and adds the operating result. Include tax, financing, and capital costs in your assumptions where relevant.</p>
            </details>
          </section>
        </div>
      </div>}
    </main>
  );
}
