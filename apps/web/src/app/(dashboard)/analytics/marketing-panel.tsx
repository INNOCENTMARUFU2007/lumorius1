'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';

type Entry = {campaign:string; channel:string; segment:string|null; currency:string; through:string; spend:string;
  budget:string|null; cac:string|null; roas:string|null; leads:string|null; customers:string|null;
  lead_conversion_pct:string|null; attribution_model:string|null; };
const money = (value: string|null,currency:string) => value===null?'—':Number(value).toLocaleString(undefined,{maximumFractionDigits:2})+' '+currency;

export default function MarketingPanel() {
  const [open,setOpen]=useState(false);
  const [days,setDays]=useState(30);
  const query=useQuery({ queryKey:['marketing-analytics',days],enabled:open,retry:false,
    queryFn:async()=> (await api.get('/analytics/marketing',{params:{days}})).data.data as { items:Entry[];truncated:boolean } });
  return <section id="marketing-intelligence" className="scroll-mt-16 rounded-2xl border border-border bg-card p-4 sm:p-5" aria-labelledby="marketing-analytics-title">
    <div className="flex flex-wrap items-center justify-between gap-3"><div>

      <h2 id="marketing-analytics-title" className="flex items-center gap-2 text-lg font-semibold"><BarChart3 className="h-5 w-5 text-cyan-500" /> Marketing Intelligence</h2>
      <p className="mt-1 text-xs text-muted-foreground">Campaign economics from validated imports, separated by currency and audience segment.</p>
    </div><button type="button" onClick={()=>setOpen(!open)} aria-expanded={open} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">{open?'Collapse':'View campaign performance'}</button></div>
    {open && <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Campaign reporting period" value={days} onChange={event=>setDays(Number(event.target.value))} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
          {[30,90,365].map(n=><option key={n} value={n}>Last {n} days</option>)}
        </select>
        <Link className="flex items-center gap-1 text-sm font-semibold hover:underline" href="/executive-intelligence?view=sources">Import campaign data <ArrowUpRight className="h-3 w-3" /></Link>
        <Link className="flex items-center gap-1 text-sm font-semibold hover:underline" href="/agent-command?intent=marketing">Draft a strategy <ArrowUpRight className="h-3 w-3" /></Link>
      </div>
      {query.isPending && <p role="status" className="text-sm text-muted-foreground">Loading validated campaign data…</p>}
      {query.isError && <p role="alert" className="text-sm text-muted-foreground">{(query.error as {response?:{status?:number}}).response?.status===403?'Campaign financials require workspace administrator access.':'Campaign performance could not be loaded.'}</p>}
      {query.data?.items.length===0 && <p className="text-sm text-muted-foreground">No committed campaign rows in this period. Import a CSV or XLSX through Executive Intelligence.</p>}
      {!!query.data?.items.length && <>
        <div className="overflow-x-auto"><table className="min-w-[730px] w-full text-left text-sm">
          <thead className="text-xs text-muted-foreground"><tr>{['Campaign','Spend','Budget','Acquisition cost','ROAS','Lead conversion','Data through'].map(v=><th key={v} scope="col" className="p-2">{v}</th>)}</tr></thead>
          <tbody>{query.data.items.map(row=><tr key={[row.campaign,row.channel,row.segment,row.currency].join(':')} className="border-t border-border">
            <th scope="row" className="p-2 font-medium">{row.campaign}<span className="block text-xs text-muted-foreground">{row.channel}{row.segment?' · '+row.segment:''}</span></th>
            <td className="p-2">{money(row.spend,row.currency)}</td><td className="p-2">{money(row.budget,row.currency)}</td><td className="p-2">{money(row.cac,row.currency)}</td>
            <td className="p-2">{row.roas===null?'—':Number(row.roas).toFixed(2)+'×'}{row.attribution_model && <span className="block text-xs text-muted-foreground">{row.attribution_model}</span>}</td>
            <td className="p-2">{row.lead_conversion_pct===null?'—':Number(row.lead_conversion_pct).toFixed(1)+'%'}</td>
            <td className="p-2">{row.through}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="text-xs text-muted-foreground">A dash means the required figures or attribution inputs were missing. Currency and audience rows may overlap and should not be added together.{query.data.truncated?' Showing the 50 most recently reported groups.':''}</p>
      </>}
    </div>}
  </section>;
}
