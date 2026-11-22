'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Globe2 } from 'lucide-react';
import { api } from '@/lib/api';

const countries: Record<string,string> = { NG:'Nigeria', ZA:'South Africa', KE:'Kenya', GH:'Ghana', EG:'Egypt', GB:'United Kingdom',
  US:'United States', DE:'Germany', IN:'India', BR:'Brazil', CA:'Canada', AE:'United Arab Emirates' };
type Research = { countryName:string; state:string; indicators:{ id:string; label:string; unit:string; purpose:string; source:string;
  history:{period:string;value:number}[]; retrievedAt:string|null; publishedAt:string|null; delivery:'source'|'snapshot'|'cache'|'unavailable' }[] };

function Trend({ history, label }: { history: Research['indicators'][number]['history']; label: string }) {
  const rows = [...history].reverse();
  const values = rows.map(p=>p.value);
  const low = Math.min(...values), high = Math.max(...values);
  const from = Number(rows[0].period), to = Number(rows[rows.length-1].period);
  const x = (period: string) => 6 + 228 * (Number(period)-from)/Math.max(1,to-from);
  const y = (value: number) => high===low ? 33 : 58 - 50*(value-low)/(high-low);
  return <figure className="mt-3">
    <svg viewBox="0 0 240 66" className="w-full rounded-lg bg-slate-950/50" role="img" aria-label={label + ' trend from '+from+' to '+to+'. Values in historical observations below.'}>
      {low<0 && high>0 && <line x1={6} x2={234} y1={y(0)} y2={y(0)} stroke="#64748b" strokeDasharray="4 4" />}
      <polyline points={rows.map(point=>x(point.period)+','+y(point.value)).join(' ')} fill="none" stroke="#67e8f9" strokeWidth="2" />
      {rows.map(point=><circle key={point.period} cx={x(point.period)} cy={y(point.value)} r={2.5} fill="#67e8f9" />)}
    </svg>
    <figcaption className="flex justify-between text-xs text-slate-400"><span>{from}</span><span>{to}</span></figcaption>
  </figure>;
}

export default function MarketResearch({ account }: { account: string }) {
  const [market,setMarket]=useState('NG');
  const query=useQuery({ queryKey:['business-twin-research',account,market],retry:false,staleTime:300000,
    queryFn:async()=> (await api.get<{data:Research}>('/workspace/business-twin/research',{params:{country:market}})).data.data });
  return <section aria-labelledby="market-research-title" className="space-y-4 rounded-2xl border border-slate-800 bg-[#101827] p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div>
      <h2 id="market-research-title" className="flex items-center gap-2 text-lg font-semibold"><Globe2 className="h-5 w-5 text-cyan-300" /> Market research</h2>
      <p className="mt-1 text-xs leading-5 text-slate-300">Public economic and digital indicators from the World Bank. These annual observations are separate from live market quotes.</p>
    </div><div className="flex gap-2">
      <select aria-label="Country" value={market} onChange={event=>setMarket(event.target.value)} className="rounded-md border border-slate-600 bg-slate-950 px-2 text-sm">
        {Object.entries(countries).map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </select><button type="button" disabled={query.isFetching} onClick={()=>void query.refetch()} className="rounded-md bg-cyan-900 px-3 py-2 text-sm font-semibold hover:bg-cyan-800 disabled:opacity-50">Refresh</button>
    </div></div>
    {query.isFetching && <p role="status" className="text-sm text-slate-300">Retrieving published indicators…</p>}
    {query.isError && <p role="alert" className="text-sm text-amber-200">Could not retrieve market research. Try again.</p>}
    {query.data && <><p className="text-xs text-slate-300">{query.data.countryName} · {query.data.state==='available'?'Published observations available':query.data.state==='partial'?'Some series are unavailable':'No observations currently available for this market'}</p>
      <div className="grid gap-3 md:grid-cols-3">{query.data.indicators.map(indicator=><article key={indicator.id} className="rounded-xl border border-slate-700 p-3">
        <p className="text-xs text-cyan-300">{indicator.purpose}</p><h3 className="mt-1 text-sm font-semibold">{indicator.label}</h3>
        <p className="mt-2 text-xl font-semibold tabular-nums">{indicator.history[0] ? indicator.history[0].value.toLocaleString(undefined,{maximumFractionDigits:2})+indicator.unit : 'Unavailable'}</p>
        {indicator.history[0] && <><p className="text-xs text-slate-300">Observed {indicator.history[0].period} · retrieved {indicator.retrievedAt?.slice(0,10)}</p>
          <p className={'mt-1 text-xs '+(indicator.delivery==='source'?'text-slate-400':'text-amber-200')}>
            {indicator.delivery==='snapshot'?'Published snapshot':indicator.delivery==='cache'?'Last retrieved copy':'World Bank API'}
            {indicator.publishedAt && ' · dataset updated '+indicator.publishedAt}
          </p></>}
        {indicator.history.length>1 && <Trend history={indicator.history} label={indicator.label} />}
        <a className="mt-2 inline-flex items-center gap-1 text-xs text-cyan-300 hover:underline" href={indicator.source} target="_blank" rel="noreferrer">World Bank series <ArrowUpRight className="h-3 w-3" /></a>
        {indicator.history.length>1 && <details className="mt-2 text-xs text-slate-300"><summary className="cursor-pointer">Historical observations</summary>
          <dl className="mt-2 space-y-1">{indicator.history.map(point=><div className="flex justify-between" key={point.period}><dt>{point.period}</dt><dd>{point.value.toLocaleString(undefined,{maximumFractionDigits:2})}{indicator.unit}</dd></div>)}</dl>
        </details>}
      </article>)}</div>
      {query.data.indicators.some(indicator=>indicator.history.length) && <div className="flex flex-wrap gap-2">
        <Link className="rounded-md border border-slate-600 px-3 py-2 text-sm hover:border-cyan-300" href={'/agent-command?intent=marketing&country='+market}>Draft a strategy for {query.data.countryName} <ArrowUpRight className="inline size-3" /></Link>
        <Link className="rounded-md border border-slate-600 px-3 py-2 text-sm hover:border-cyan-300" href="/analytics#marketing-intelligence">View campaign analytics <ArrowUpRight className="inline size-3" /></Link>
      </div>}
    </>}
  </section>;
}
